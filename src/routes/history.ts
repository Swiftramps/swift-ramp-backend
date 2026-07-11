import { FastifyInstance } from 'fastify'
import { getSwapHistory } from '../lib/stellar'

const STELLAR_ADDRESS_RE = /^G[A-Z0-9]{55}$/

export async function historyRoutes(app: FastifyInstance) {
  app.get<{ Params: { address: string } }>('/history/:address', async (request, reply) => {
    const { address } = request.params
    if (!STELLAR_ADDRESS_RE.test(address)) {
      return reply.code(400).send({ error: 'Invalid Stellar public key' })
    }
    try {
      const history = await getSwapHistory(address)
      return { address, swaps: history }
    } catch (err) {
      request.log.error(err)
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'History lookup failed' })
    }
  })
}
