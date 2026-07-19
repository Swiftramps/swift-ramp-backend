import { FastifyInstance } from 'fastify'
import { getSwapHistory } from '../lib/stellar'
import { config } from '../config'

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
  app.get<{ Params: { address: string } }>(
    '/history/:address',
    {
      schema: historySchema,
      config: {
        rateLimit: {
          max: config.auditRateLimitMax,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { address } = request.params
      const history = await getSwapHistory(address)
      return { address, swaps: history }
    }
  )
}
