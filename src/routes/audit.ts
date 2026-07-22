import type { FastifyInstance } from 'fastify'
import { getContractRates, getContractAdmin, getOracleInfo } from '../lib/stellar'
import { config } from '../config'
import { syncAuditEvents, IdentityContractNotConfigured } from '../lib/auditLog'
import { getAuditEvents, countAuditEvents, getAuditCursor, type AuditEventFilters } from '../db/auditEvents'

const MAX_PAGE_SIZE = 200
const DEFAULT_PAGE_SIZE = 50

const auditTrailSchema = {
  params: {
    type: 'object',
    required: ['identity'],
    properties: {
      identity: { type: 'string', pattern: '^[GC][A-Z0-9]{55}$' },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE },
      offset: { type: 'integer', minimum: 0, default: 0 },
      from: { type: 'integer', minimum: 0 },
      to: { type: 'integer', minimum: 0 },
    },
  },
}

interface AuditTrailQuery {
  limit?: number
  offset?: number
  from?: number
  to?: number
}

export async function auditRoutes(app: FastifyInstance) {
  app.get('/audit/contract', async () => {
    const rates = await getContractRates()
    const admin = await getContractAdmin()
    return { admin, rates }
  })

  app.get('/audit/oracle', async () => {
    const oracleInfo = await getOracleInfo()
    return oracleInfo
  })

  /**
   * Full audit trail for one identity, oldest event first.
   *
   * Contract events are the source of truth. This is a read-through cache over
   * them: each request tops the local copy up from the chain, then answers from
   * SQLite, so paging deep into a long trail costs no extra RPC calls.
   *
   * If the RPC is unreachable the cached trail is still served, flagged with
   * `stale: true`, because a stale audit trail beats no audit trail. Callers
   * that cannot accept that should reject on the flag.
   */
  app.get<{ Params: { identity: string }; Querystring: AuditTrailQuery }>(
    '/audit/:identity',
    {
      schema: auditTrailSchema,
      config: {
        rateLimit: {
          max: config.auditRateLimitMax,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { identity } = request.params
      const { from, to } = request.query
      const limit = request.query.limit ?? DEFAULT_PAGE_SIZE
      const offset = request.query.offset ?? 0

      let stale = false
      try {
        await syncAuditEvents()
      } catch (err) {
        if (err instanceof IdentityContractNotConfigured) {
          return reply.status(503).send({ error: 'Audit trail unavailable: identity contract not configured' })
        }
        request.log.warn(`Audit sync failed, serving cached trail: ${err}`)
        stale = true
      }

      // Built up conditionally: exactOptionalPropertyTypes rejects an explicit
      // `undefined` for an optional property.
      const filters: AuditEventFilters = {}
      if (from !== undefined) filters.from = from
      if (to !== undefined) filters.to = to

      const total = countAuditEvents(identity, filters)
      const events = getAuditEvents(identity, { ...filters, limit, offset })
      const cursor = getAuditCursor(config.identityContractId)

      // Safe to cache for as long as the next sync would be a no-op anyway.
      reply.header('Cache-Control', `public, max-age=${Math.floor(config.auditCacheTtlMs / 1000)}`)

      return {
        identity,
        events: events.map(event => ({
          type: event.event_type,
          proof_hash: event.proof_hash,
          timestamp: event.timestamp,
          ledger_closed_at: event.ledger_closed_at,
          ledger: event.ledger,
          tx_hash: event.tx_hash,
          event_id: event.event_id,
        })),
        pagination: {
          limit,
          offset,
          total,
          has_more: offset + events.length < total,
        },
        stale,
        synced_at: cursor?.synced_at ?? null,
        last_ledger: cursor?.last_ledger ?? null,
      }
    },
  )
}
