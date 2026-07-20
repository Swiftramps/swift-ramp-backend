import Fastify, { type FastifyError } from 'fastify'
import cors from '@fastify/cors'
import { config } from './config'
import { quoteRoutes } from './routes/quote'
import { swapRoutes } from './routes/swap'
import { historyRoutes } from './routes/history'
import { auditRoutes } from './routes/audit'
import { enrollmentRoutes } from './routes/enrollment'
import { startRateOracle } from './oracle/rateOracle'
import type { AppConfig } from './config'

export async function buildServer(
  appConfig: AppConfig = config,
  logger: boolean = true,
) {
  const app = Fastify({ logger })

  app.setErrorHandler((err: FastifyError, request, reply) => {
    request.log.error(err)
    const statusCode = err.statusCode ?? 502
    reply.code(statusCode).send({ error: err.message ?? 'Internal server error' })
  })

  await app.register(cors, { origin: appConfig.allowedOrigins })

  if (appConfig.nodeEnv === 'production') {
    const allowedOrigins = appConfig.allowedOrigins === true ? [] : appConfig.allowedOrigins

    app.addHook('onRequest', async (request, reply) => {
      const origin = request.headers.origin
      const path = request.url.split('?')[0]

      if (path !== '/health' && origin && !allowedOrigins.includes(origin)) {
        request.log.warn({ origin, path }, 'Rejected request from disallowed origin')
        return reply.code(403).send({ error: 'Origin not allowed' })
      }
    })

    const rateLimit = await import('@fastify/rate-limit')
    await app.register(rateLimit.default, {
      max: appConfig.standardRateLimitMax,
      timeWindow: '1 minute',
      keyGenerator: request => request.headers.origin ?? request.ip,
    })
  }

  app.get('/health', async () => ({ ok: true }))

  await app.register(quoteRoutes)
  await app.register(swapRoutes)
  await app.register(historyRoutes)
  await app.register(auditRoutes)
  await app.register(enrollmentRoutes)

  return app
}

async function main() {
  const app = await buildServer()

  startRateOracle(app.log)

  await app.listen({ port: config.port, host: '0.0.0.0' })
}

if (process.env['NODE_ENV'] !== 'test') {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
