import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config'
import { quoteRoutes } from './routes/quote'
import { swapRoutes } from './routes/swap'
import { historyRoutes } from './routes/history'
import { startRateOracle } from './oracle/rateOracle'

async function main() {
  const app = Fastify({ logger: true })

  app.setErrorHandler((err, request, reply) => {
    request.log.error(err)
    const statusCode = err.statusCode ?? 502
    reply.code(statusCode).send({ error: err.message ?? 'Internal server error' })
  })

  await app.register(cors, { origin: true })

  app.get('/health', async () => ({ ok: true }))

  await app.register(quoteRoutes)
  await app.register(swapRoutes)
  await app.register(historyRoutes)

  startRateOracle(app.log)

  await app.listen({ port: config.port, host: '0.0.0.0' })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
