import { describe, it, expect, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'

process.env.IDENTITY_CONTRACT_ID = 'CA3D5KFYF6J7YJ4CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6CJ6'

const { getIdentityStatus, IdentityNotFoundError } = vi.hoisted(() => ({
  getIdentityStatus: vi.fn(),
  IdentityNotFoundError: class IdentityNotFoundError extends Error {},
}))

vi.mock('../../lib/stellar', () => ({
  getIdentityStatus,
  IdentityNotFoundError,
}))

const ADDRESS = (filler: string) => `GC${filler.repeat(54)}`
const ACTIVE = ADDRESS('A')
const REVOKED = ADDRESS('B')
const UNREGISTERED = ADDRESS('C')

async function build() {
  const { identityRoutes } = await import('../identities.js')
  const app = Fastify()
  app.setErrorHandler((err, _request, reply) => {
    const statusCode = err.statusCode ?? 502
    reply.code(statusCode).send({ error: err.message ?? 'Internal server error' })
  })
  await app.register(identityRoutes)
  await app.ready()
  return app
}

describe('GET /identities/:address/status', () => {
  beforeEach(() => {
    getIdentityStatus.mockReset()
  })

  it('returns active for a registered identity', async () => {
    getIdentityStatus.mockResolvedValue('active')
    const app = await build()

    const res = await app.inject({ method: 'GET', url: `/identities/${ACTIVE}/status` })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ address: ACTIVE, status: 'active' })
    await app.close()
  })

  it('returns revoked for a revoked identity', async () => {
    getIdentityStatus.mockResolvedValue('revoked')
    const app = await build()

    const res = await app.inject({ method: 'GET', url: `/identities/${REVOKED}/status` })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ address: REVOKED, status: 'revoked' })
    await app.close()
  })

  it('returns 404 for an unregistered identity', async () => {
    getIdentityStatus.mockRejectedValue(new IdentityNotFoundError(UNREGISTERED))
    const app = await build()

    const res = await app.inject({ method: 'GET', url: `/identities/${UNREGISTERED}/status` })

    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.payload)).toEqual({ error: 'Identity not found' })
    await app.close()
  })

  it('returns 400 for a malformed address', async () => {
    const app = await build()

    const res = await app.inject({ method: 'GET', url: '/identities/not-an-address/status' })

    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('returns 502 when the contract call fails unexpectedly', async () => {
    getIdentityStatus.mockRejectedValue(new Error('rpc unreachable'))
    const app = await build()

    const res = await app.inject({ method: 'GET', url: `/identities/${ACTIVE}/status` })

    expect(res.statusCode).toBe(502)
    await app.close()
  })
})
