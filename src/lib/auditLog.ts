import { server } from './stellar.js'
import { config } from '../config.js'
import { parseAuditEvent, type RawEvent } from './auditEventParser.js'
import {
  insertAuditEvents,
  getAuditCursor,
  setAuditCursor,
  type AuditEventRecord,
} from '../db/auditEvents.js'

export { parseAuditEvent } from './auditEventParser.js'

/** RPC caps a single page; anything larger is silently truncated. */
const PAGE_SIZE = 1000

/** Guards against a cursor that never advances. */
const MAX_PAGES = 50

export interface SyncResult {
  synced: boolean
  inserted: number
  lastLedger: number
  syncedAt: number
}

export class IdentityContractNotConfigured extends Error {
  constructor() {
    super('IDENTITY_CONTRACT_ID is not configured')
    this.name = 'IdentityContractNotConfigured'
  }
}

/**
 * Pulls new events into the cache. Resumes from the stored cursor so a warm
 * cache only ever fetches the ledgers it has not seen; a cold one reaches back
 * `auditBackfillLedgers`.
 *
 * `force` skips the TTL check, which is what a caller wanting a strongly
 * consistent read passes.
 */
export async function syncAuditEvents(options: { force?: boolean } = {}): Promise<SyncResult> {
  const contractId = config.identityContractId
  if (!contractId) throw new IdentityContractNotConfigured()

  const cursor = getAuditCursor(contractId)
  const now = Date.now()

  if (!options.force && cursor && now - cursor.synced_at < config.auditCacheTtlMs) {
    return { synced: false, inserted: 0, lastLedger: cursor.last_ledger, syncedAt: cursor.synced_at }
  }

  const latest = await server.getLatestLedger()
  const startLedger = cursor
    ? Math.min(cursor.last_ledger + 1, latest.sequence)
    : Math.max(1, latest.sequence - config.auditBackfillLedgers)

  const filters = [{ type: 'contract' as const, contractIds: [contractId] }]

  let inserted = 0
  let pageCursor: string | undefined
  let seenLedger = cursor?.last_ledger ?? 0

  for (let page = 0; page < MAX_PAGES; page++) {
    // startLedger and cursor are mutually exclusive in the RPC request.
    const request = pageCursor
      ? { filters, cursor: pageCursor, limit: PAGE_SIZE }
      : { filters, startLedger, limit: PAGE_SIZE }

    const response = await server.getEvents(request as never)
    const events = (response?.events ?? []) as RawEvent[]
    if (events.length === 0) break

    const parsed = events
      .map(parseAuditEvent)
      .filter((e): e is AuditEventRecord => e !== null)

    inserted += insertAuditEvents(parsed)

    for (const event of events) {
      if (typeof event.ledger === 'number' && event.ledger > seenLedger) seenLedger = event.ledger
    }

    if (events.length < PAGE_SIZE) break
    const nextCursor = events[events.length - 1]?.id
    if (!nextCursor || nextCursor === pageCursor) break
    pageCursor = nextCursor
  }

  // Advance to the ledger actually scanned, not just the last one with a hit,
  // otherwise a quiet contract re-scans the same empty range forever.
  const lastLedger = Math.max(seenLedger, latest.sequence)
  const syncedAt = Date.now()
  setAuditCursor(contractId, lastLedger, syncedAt)

  return { synced: true, inserted, lastLedger, syncedAt }
}
