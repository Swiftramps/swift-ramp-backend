import { createHash } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import { enrollmentRoutes } from '../routes/enrollment'
import { computeProofHash, verifyProofHash } from './proofHash'

// ---------------------------------------------------------------------------
// Helper — mirrors the exact preimage the contract encodes on-chain:
//   [ timestamp: 8 bytes big-endian u64 ] ++ [ identity UTF-8 ] ++ [ queueId UTF-8 ]
// ---------------------------------------------------------------------------
function expectedHash(timestampSec: number, identity: string, queueId: string): string {
  const tsBuf = Buffer.allocUnsafe(8)
  tsBuf.writeBigUInt64BE(BigInt(timestampSec))
  const preimage = Buffer.concat([
    tsBuf,
    Buffer.from(identity, 'utf8'),
    Buffer.from(queueId, 'utf8'),
  ])
  return createHash('sha256').update(preimage).digest('hex')
}

// ---------------------------------------------------------------------------
// Unit tests — pure utility functions (no network / no Fastify)
// ---------------------------------------------------------------------------
describe('computeProofHash', () => {
  it('produces a 64-character lowercase hex string', () => {
    const hash = computeProofHash(1_700_000_000, 'alice', 'queue-1')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('matches the SHA-256 of the contract preimage encoding', () => {
    const ts = 1_700_000_000
    const identity = 'alice'
    const queueId = 'queue-1'
    expect(computeProofHash(ts, identity, queueId)).toBe(expectedHash(ts, identity, queueId))
  })

  it('encodes timestamp as big-endian u64 (byte-level check)', () => {
    // timestamp 1 → 0x0000000000000001 in big-endian
    const ts = 1
    const tsBuf = Buffer.allocUnsafe(8)
    tsBuf.writeBigUInt64BE(1n)
    const preimage = Buffer.concat([tsBuf, Buffer.from('id', 'utf8'), Buffer.from('q', 'utf8')])
    const want = createHash('sha256').update(preimage).digest('hex')
    expect(computeProofHash(ts, 'id', 'q')).toBe(want)
  })

  it('accepts a BigInt timestamp', () => {
    const ts = 1_700_000_000n
    expect(computeProofHash(ts, 'bob', 'queue-2')).toBe(
      computeProofHash(Number(ts), 'bob', 'queue-2'),
    )
  })

  it('is sensitive to timestamp value', () => {
    const a = computeProofHash(1_000_000, 'alice', 'q')
    const b = computeProofHash(1_000_001, 'alice', 'q')
    expect(a).not.toBe(b)
  })

  it('is sensitive to identity value', () => {
    const a = computeProofHash(1_700_000_000, 'alice', 'q')
    const b = computeProofHash(1_700_000_000, 'bob', 'q')
    expect(a).not.toBe(b)
  })

  it('is sensitive to queueId value', () => {
    const a = computeProofHash(1_700_000_000, 'alice', 'queue-1')
    const b = computeProofHash(1_700_000_000, 'alice', 'queue-2')
    expect(a).not.toBe(b)
  })
})

describe('verifyProofHash', () => {
  it('returns true when the hash matches', () => {
    const ts = 1_700_000_000
    const identity = 'alice'
    const queueId = 'queue-1'
    const hash = computeProofHash(ts, identity, queueId)
    expect(verifyProofHash(ts, identity, queueId, hash)).toBe(true)
  })

  it('returns false on hash mismatch (wrong timestamp)', () => {
    const hash = computeProofHash(1_700_000_000, 'alice', 'queue-1')
    expect(verifyProofHash(1_700_000_001, 'alice', 'queue-1', hash)).toBe(false)
  })

  it('returns false on hash mismatch (wrong identity)', () => {
    const hash = computeProofHash(1_700_000_000, 'alice', 'queue-1')
    expect(verifyProofHash(1_700_000_000, 'bob', 'queue-1', hash)).toBe(false)
  })

  it('returns false on hash mismatch (wrong queueId)', () => {
    const hash = computeProofHash(1_700_000_000, 'alice', 'queue-1')
    expect(verifyProofHash(1_700_000_000, 'alice', 'queue-2', hash)).toBe(false)
  })

  it('is case-insensitive for the provided hash', () => {
    const ts = 1_700_000_000
    const identity = 'alice'
    const queueId = 'queue-1'
    const hashLower = computeProofHash(ts, identity, queueId)
    const hashUpper = hashLower.toUpperCase()
    expect(verifyProofHash(ts, identity, queueId, hashUpper)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Integration tests — Fastify routes (no external network calls)
// ---------------------------------------------------------------------------
describe('POST /enrollment', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = Fastify()
    await app.register(enrollmentRoutes)
    await app.ready()
  })

  afterAll(() => app.close())

  it('returns the correct proof hash for known inputs', async () => {
    const ts = 1_700_000_000
    const identity = 'alice'
    const queueId = 'queue-1'

    const res = await app.inject({
      method: 'POST',
      url: '/enrollment',
      payload: { timestampSec: ts, identity, queueId },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ proofHash: string }>()
    expect(body.proofHash).toBe(expectedHash(ts, identity, queueId))
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/enrollment',
      payload: { timestampSec: 1_700_000_000 }, // missing identity and queueId
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns different hashes for different inputs', async () => {
    const base = { timestampSec: 1_700_000_000, identity: 'alice', queueId: 'queue-1' }

    const [r1, r2] = await Promise.all([
      app.inject({ method: 'POST', url: '/enrollment', payload: base }),
      app.inject({
        method: 'POST',
        url: '/enrollment',
        payload: { ...base, queueId: 'queue-2' },
      }),
    ])

    expect(r1.json<{ proofHash: string }>().proofHash).not.toBe(
      r2.json<{ proofHash: string }>().proofHash,
    )
  })
})

describe('POST /enrollment/verify', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = Fastify()
    await app.register(enrollmentRoutes)
    await app.ready()
  })

  afterAll(() => app.close())

  it('returns valid:true when the proof hash matches the enrollment inputs', async () => {
    const ts = 1_700_000_000
    const identity = 'alice'
    const queueId = 'queue-1'
    const proofHash = expectedHash(ts, identity, queueId)

    const res = await app.inject({
      method: 'POST',
      url: '/enrollment/verify',
      payload: { timestampSec: ts, identity, queueId, proofHash },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json<{ valid: boolean }>().valid).toBe(true)
  })

  it('returns 400 when the hash does not match (hash mismatch)', async () => {
    const ts = 1_700_000_000
    // Use a hash computed with different inputs to force a mismatch
    const wrongHash = expectedHash(ts, 'eve', 'queue-99')

    const res = await app.inject({
      method: 'POST',
      url: '/enrollment/verify',
      payload: { timestampSec: ts, identity: 'alice', queueId: 'queue-1', proofHash: wrongHash },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json<{ error: string }>().error).toBe('proof hash mismatch')
  })

  it('returns 400 when the proofHash is not a 64-character hex string', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/enrollment/verify',
      payload: {
        timestampSec: 1_700_000_000,
        identity: 'alice',
        queueId: 'queue-1',
        proofHash: 'not-a-hash',
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('accepts an uppercase hash (case-insensitive comparison)', async () => {
    const ts = 1_700_000_000
    const identity = 'alice'
    const queueId = 'queue-1'
    const proofHash = expectedHash(ts, identity, queueId).toUpperCase()

    const res = await app.inject({
      method: 'POST',
      url: '/enrollment/verify',
      payload: { timestampSec: ts, identity, queueId, proofHash },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json<{ valid: boolean }>().valid).toBe(true)
  })
})
