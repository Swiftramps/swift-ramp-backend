import { FastifyInstance } from 'fastify'
import { getSwapHistory } from '../lib/stellar'

const historySchema = {
  params: {
    type: 'object',
    required: ['address'],
    properties: {
      address: { type: 'string', pattern: '^G[A-Z0-9]{55}$' },
    },
  },
}

export async function historyRoutes(app: FastifyInstance) {
  app.get<{ Params: { address: string } }>('/history/:address', { schema: historySchema }, async (request, reply) => {
    const history = await getSwapHistory(request.params.address)
    return { address: request.params.address, swaps: history }
  })
}
