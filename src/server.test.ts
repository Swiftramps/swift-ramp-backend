import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AppConfig } from './config'
import { Keypair, StrKey } from '@stellar/stellar-sdk'

let buildServer: typeof import('./server').buildServer
const apps: FastifyInstance[] = []
const productionConfig: AppConfig = {
  auditRateLimitMax: 20,
  standardRateLimitMax: 100,
  port: 4000,
  sorobanRpcUrl: 'https://example.test',
  networkPassphrase: 'Test Network',
  swapContractId: 'C_TEST',
  oracleSecretKey: 'S_TEST',
  currencyTokens: {},
  oracleIntervalMs: 300_000,
  nodeEnv: 'production',
  allowedOrigins: ['https://swiftramp.com', 'https://app.swiftramp.com'],
}

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test'
  process.env['SWAP_CONTRACT_ID'] = StrKey.encodeContract(Buffer.alloc(32))
  process.env['ORACLE_SECRET_KEY'] = Keypair.random().secret()
  ;({ buildServer } = await import('./server'))
})

afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()))
})

async function createApp(overrides: Partial<AppConfig> = {}) {
  const app = await buildServer({ ...productionConfig, ...overrides }, false)
  apps.push(app)
  return app
}

describe('production CORS', () => {
  it('returns CORS headers for an allowed origin', async () => {
    const app = await createApp()
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://swiftramp.com' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBe('https://swiftramp.com')
  })

  it('rejects a disallowed origin with 403', async () => {
    const app = await createApp()
    const response = await app.inject({
      method: 'GET',
      url: '/quote?from=USD&to=NGN&amount=1',
      headers: { origin: 'https://evil.example' },
    })
    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'Origin not allowed' })
  })

  it('keeps health public for a disallowed origin', async () => {
    const app = await createApp()
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
  })

  it('applies rate limits independently per origin', async () => {
    const app = await createApp({ standardRateLimitMax: 1 })
    const request = (origin: string) => app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin },
    })
    expect((await request('https://swiftramp.com')).statusCode).toBe(200)
    expect((await request('https://swiftramp.com')).statusCode).toBe(429)
    expect((await request('https://app.swiftramp.com')).statusCode).toBe(200)
  })
})
