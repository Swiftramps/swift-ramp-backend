import type { FastifyInstance } from 'fastify'
import { getIdentityStatus, IdentityNotFoundError } from '../lib/stellar'
import { config } from '../config'

const identityStatusSchema = {
  params: {
    type: 'object',
    required: ['address'],
    properties: {
      address: { type: 'string', pattern: '^G[A-Z0-9]{55}$' },
    },
  },
}

export async function identityRoutes(app: FastifyInstance) {
  app.get<{ Params: { address: string } }>(
    '/identities/:address/status',
    { schema: identityStatusSchema },
    async (request, reply) => {
      const { address } = request.params

      if (!config.identityContractId) {
        return reply.status(503).send({ error: 'Identity contract not configured' })
      }

      try {
        const status = await getIdentityStatus(address)
        return { address, status }
      } catch (err) {
        if (err instanceof IdentityNotFoundError) {
          return reply.status(404).send({ error: 'Identity not found' })
        }
        throw err
      }
    },
  )
}