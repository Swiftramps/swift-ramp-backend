import { FastifyInstance } from 'fastify'
import { getSwapHistory } from '../lib/stellar'

export async function historyRoutes(app: FastifyInstance) {
  app.get<{ Params: { address: string } }>('/history/:address', async (request, reply) => {
    try {
      const history = await getSwapHistory(request.params.address)
      return { address: request.params.address, swaps: history }
    } catch (err) {
      request.log.error(err)
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'History lookup failed' })
    }
  })
}
