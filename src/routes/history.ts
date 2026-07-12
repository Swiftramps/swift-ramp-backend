import { FastifyInstance } from 'fastify'
import { getSwapHistory } from '../lib/stellar'

export async function historyRoutes(app: FastifyInstance) {
  app.get<{ Params: { address: string } }>('/history/:address', async (request, reply) => {
    const history = await getSwapHistory(request.params.address)
    return { address: request.params.address, swaps: history }
  })
}
