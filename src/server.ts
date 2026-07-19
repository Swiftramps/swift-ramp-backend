import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config'
import { quoteRoutes } from './routes/quote'
import { swapRoutes } from './routes/swap'
import { historyRoutes } from './routes/history'
import { auditRoutes } from './routes/audit'
import { oracleRoutes } from './routes/oracle'
import { startRateOracle } from './oracle/rateOracle'
import { initDb } from './db/database'
import { getDbStats } from './db/models'
import { backfillSwaps, startIndexer } from './db/indexer'

async function main() {
  const app = Fastify({ logger: true })

  app.setErrorHandler((err, request, reply) => {
    request.log.error(err)
    const statusCode = err.statusCode ?? 502
    reply.code(statusCode).send({ error: err.message ?? 'Internal server error' })
  })

  await app.register(cors, { origin: config.allowedOrigins })

  if (config.nodeEnv === 'production') {
    const rateLimit = await import('@fastify/rate-limit')
    await app.register(rateLimit.default, {
      max: config.standardRateLimitMax,
      timeWindow: '1 minute',
    })
  }

  app.get('/health', async () => ({ ok: true }))
  app.get('/health/db', async () => {
    try {
      const stats = getDbStats()
      return { status: 'ok', ...stats }
    } catch (err) {
      return { status: 'error', error: err instanceof Error ? err.message : err }
    }
  })

  // Initialize DB and background jobs
  initDb()
  await backfillSwaps(app.log)
  startIndexer(app.log)

  await app.register(quoteRoutes)
  await app.register(swapRoutes)
  await app.register(historyRoutes)
  await app.register(auditRoutes)
  await app.register(oracleRoutes)

  startRateOracle(app.log)

  await app.listen({ port: config.port, host: '0.0.0.0' })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
