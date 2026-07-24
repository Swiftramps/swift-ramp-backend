import { scValToNative } from '@stellar/stellar-sdk'
import type { AuditEventRecord, AuditEventType } from '../db/auditEvents.js'

/**
 * Pure decoding of contract events into audit trail rows. Deliberately free of
 * any RPC dependency so it can be exercised on its own.
 */

/**
 * The identity contract is free to spell these either way; both forms normalise
 * to the canonical type stored in the cache and returned by the API.
 */
const EVENT_TYPE_ALIASES: Record<string, AuditEventType> = {
  enrolled: 'enrolled',
  enroll: 'enrolled',
  enrollment: 'enrolled',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  cancel: 'cancelled',
}

export type RawEvent = {
  id?: string
  ledger?: number
  ledgerClosedAt?: string
  txHash?: string
  topic?: unknown[]
  value?: unknown
}

function toHex(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (Buffer.isBuffer(value)) return value.toString('hex')
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex')
  return null
}

function native(value: unknown): unknown {
  if (value === null || value === undefined) return null
  try {
    return scValToNative(value as never)
  } catch {
    // Already-native values (and anything unparseable) pass through untouched
    // so a single malformed field cannot sink the whole event.
    return value
  }
}

function isAddress(value: unknown): value is string {
  return typeof value === 'string' && /^[GC][A-Z0-9]{55}$/.test(value)
}

function pick(record: unknown, keys: string[]): unknown {
  if (typeof record !== 'object' || record === null) return undefined
  for (const key of keys) {
    const found = (record as Record<string, unknown>)[key]
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * Maps one RPC event onto a cache row, or null when it is not part of the audit
 * trail. Returning null rather than throwing keeps an unrelated event emitted by
 * the same contract from aborting a sync.
 */
export function parseAuditEvent(event: RawEvent): AuditEventRecord | null {
  const topics = (event.topic ?? []).map(native)

  const rawType = topics[0]
  if (typeof rawType !== 'string') return null
  const eventType = EVENT_TYPE_ALIASES[rawType.toLowerCase()]
  if (!eventType) return null

  const value = native(event.value)

  // The identity is conventionally the second topic, which keeps it indexable
  // on chain, but accept it from the payload too.
  const identity = topics.slice(1).find(isAddress) ?? pick(value, ['identity', 'user', 'address'])
  if (!isAddress(identity)) return null

  const proofSource = pick(value, ['proof_hash', 'proofHash', 'hash'])
  // A payload that is just the hash is the other shape worth supporting.
  const proof_hash = toHex(proofSource ?? (typeof value === 'object' ? null : value))

  const ledgerClosedAt = event.ledgerClosedAt ?? ''
  const parsedTime = Date.parse(ledgerClosedAt)

  return {
    event_id: event.id ?? `${event.txHash ?? 'unknown'}-${event.ledger ?? 0}-${rawType}`,
    identity,
    event_type: eventType,
    proof_hash,
    ledger: event.ledger ?? 0,
    ledger_closed_at: ledgerClosedAt,
    // Ledger close time, not ingest time, so the trail stays true across replays.
    timestamp: Number.isNaN(parsedTime) ? 0 : parsedTime,
    tx_hash: event.txHash ?? '',
  }
}
