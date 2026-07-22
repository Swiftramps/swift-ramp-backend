import { describe, it, expect, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'

process.env.DB_FILE = ':memory:'
process.env.IDENTITY_CONTRACT_ID = 'CA3D5KFYF6J7YJ4CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6'
process.env.AUDIT_CACHE_TTL_MS = '0'

const getEvents = vi.fn()
const getLatestLedger = vi.fn()

// The contract is the source of truth, so the RPC is the only thing stubbed.
// Everything below it (parsing, the SQLite cache, paging) is the real code.
vi.mock('../../lib/stellar.js', () => ({
  server: { getEvents, getLatestLedger },
  getContractRates: vi.fn(),
  getContractAdmin: vi.fn(),
  getOracleInfo: vi.fn(),
}))
vi.mock('../../lib/stellar', () => ({
  server: { getEvents, getLatestLedger },
  getContractRates: vi.fn(),
  getContractAdmin: vi.fn(),
  getOracleInfo: vi.fn(),
}))

const { auditRoutes } = await import('../audit')
const { initDb, getDb } = await import('../../db/database')

const IDENTITY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
const OTHER = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'

/**
 * Shaped like a Soroban RPC event. `scValToNative` is not mocked, so values are
 * given already-native and pass through the parser's fallback path.
 */
function event(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '0000000001-0000000001',
    ledger: 100,
    ledgerClosedAt: '2026-01-01T00:00:00Z',
    txHash: 'tx1',
    topic: ['enrolled', IDENTITY],
    value: { proof_hash: 'a'.repeat(64) },
    ...overrides,
  }
}

async function build() {
  const app = Fastify()
  await app.register(auditRoutes)
  await app.ready()
  return app
}

describe('GET /audit/:identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initDb()
    const db = getDb()
    db.exec('DELETE FROM audit_events; DELETE FROM audit_cursor;')
    getLatestLedger.mockResolvedValue({ sequence: 1000 })
    getEvents.mockResolvedValue({ events: [] })
  })

  it('returns each event with proof_hash, type and timestamp', async () => {
    getEvents.mockResolvedValue({ events: [event()] })
    const app = await build()

    const res = await app.inject({ method: 'GET', url: `/audit/${IDENTITY}` })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.identity).toBe(IDENTITY)
    expect(body.events).toHaveLength(1)
    expect(body.events[0]).toMatchObject({
      type: 'enrolled',
      proof_hash: 'a'.repeat(64),
      timestamp: Date.parse('2026-01-01T00:00:00Z'),
      ledger: 100,
      tx_hash: 'tx1',
    })
    await app.close()
  })

  it('orders events chronologically, oldest first', async () => {
    getEvents.mockResolvedValue({
      events: [
        event({ id: 'c', ledger: 300, ledgerClosedAt: '2026-03-01T00:00:00Z', topic: ['cancelled', IDENTITY], txHash: 'tx3' }),
        event({ id: 'a', ledger: 100, ledgerClosedAt: '2026-01-01T00:00:00Z', txHash: 'tx1' }),
        event({ id: 'b', ledger: 200, ledgerClosedAt: '2026-02-01T00:00:00Z', txHash: 'tx2' }),
      ],
    })
    const app = await build()

    const res = await app.inject({ method: 'GET', url: `/audit/${IDENTITY}` })
    const body = JSON.parse(res.payload)

    expect(body.events.map((e: { tx_hash: string }) => e.tx_hash)).toEqual(['tx1', 'tx2', 'tx3'])
    const timestamps = body.events.map((e: { timestamp: number }) => e.timestamp)
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b))
    expect(body.events[2].type).toBe('cancelled')
    await app.close()
  })

  it('paginates with limit and offset', async () => {
    getEvents.mockResolvedValue({
      events: Array.from({ length: 5 }, (_, i) =>
        event({ id: `e${i}`, ledger: 100 + i, txHash: `tx${i}`, ledgerClosedAt: `2026-01-0${i + 1}T00:00:00Z` }),
      ),
    })
    const app = await build()

    const first = JSON.parse((await app.inject({ method: 'GET', url: `/audit/${IDENTITY}?limit=2` })).payload)
    expect(first.events.map((e: { tx_hash: string }) => e.tx_hash)).toEqual(['tx0', 'tx1'])
    expect(first.pagination).toMatchObject({ limit: 2, offset: 0, total: 5, has_more: true })

    const second = JSON.parse((await app.inject({ method: 'GET', url: `/audit/${IDENTITY}?limit=2&offset=2` })).payload)
    expect(second.events.map((e: { tx_hash: string }) => e.tx_hash)).toEqual(['tx2', 'tx3'])
    expect(second.pagination.has_more).toBe(true)

    const last = JSON.parse((await app.inject({ method: 'GET', url: `/audit/${IDENTITY}?limit=2&offset=4` })).payload)
    expect(last.events.map((e: { tx_hash: string }) => e.tx_hash)).toEqual(['tx4'])
    expect(last.pagination.has_more).toBe(false)
    await app.close()
  })

  it('scopes the trail to the requested identity', async () => {
    getEvents.mockResolvedValue({
      events: [event({ id: 'mine', txHash: 'mine' }), event({ id: 'theirs', topic: ['enrolled', OTHER], txHash: 'theirs' })],
    })
    const app = await build()

    const body = JSON.parse((await app.inject({ method: 'GET', url: `/audit/${IDENTITY}` })).payload)
    expect(body.events).toHaveLength(1)
    expect(body.events[0].tx_hash).toBe('mine')
    await app.close()
  })

  it('returns an empty trail rather than 404 for an identity with no events', async () => {
    const app = await build()

    const res = await app.inject({ method: 'GET', url: `/audit/${IDENTITY}` })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.events).toEqual([])
    expect(body.pagination).toMatchObject({ total: 0, has_more: false })
    await app.close()
  })

  it('does not duplicate events when the same ledger range is synced twice', async () => {
    getEvents.mockResolvedValue({ events: [event()] })
    const app = await build()

    await app.inject({ method: 'GET', url: `/audit/${IDENTITY}` })
    const body = JSON.parse((await app.inject({ method: 'GET', url: `/audit/${IDENTITY}` })).payload)

    expect(body.events).toHaveLength(1)
    await app.close()
  })

  it('serves the cached trail flagged stale when the RPC is down', async () => {
    getEvents.mockResolvedValue({ events: [event()] })
    const app = await build()
    await app.inject({ method: 'GET', url: `/audit/${IDENTITY}` })

    getLatestLedger.mockRejectedValue(new Error('rpc unreachable'))
    const res = await app.inject({ method: 'GET', url: `/audit/${IDENTITY}` })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.stale).toBe(true)
    expect(body.events).toHaveLength(1)
    await app.close()
  })

  it('rejects a malformed identity and an out-of-range limit', async () => {
    const app = await build()

    expect((await app.inject({ method: 'GET', url: '/audit/not-an-address' })).statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: `/audit/${IDENTITY}?limit=5000` })).statusCode).toBe(400)
    await app.close()
  })

  it('does not shadow the existing static audit routes', async () => {
    const app = await build()

    // Would 400 on the identity pattern if the param route captured them.
    expect((await app.inject({ method: 'GET', url: '/audit/contract' })).statusCode).not.toBe(400)
    expect((await app.inject({ method: 'GET', url: '/audit/oracle' })).statusCode).not.toBe(400)
    await app.close()
  })
})
