import { FastifyInstance } from 'fastify'
import { submitSignedSwap, getSwapStatus } from '../lib/stellar'

export async function swapRoutes(app: FastifyInstance) {
  // Body: { signedTxXdr: string } — a transaction already built and signed
  // client-side (e.g. via Freighter), just relayed here so the frontend
  // doesn't need its own direct RPC connection and to centralize retries/logging.
  app.post<{ Body: { signedTxXdr: string } }>('/swap/submit', async (request, reply) => {
    const { signedTxXdr } = request.body
    if (!signedTxXdr) {
      return reply.code(400).send({ error: 'signedTxXdr is required' })
    }
    try {
      const result = await submitSignedSwap(signedTxXdr)
      return result
    } catch (err) {
      request.log.error(err)
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Swap submission failed' })
    }
  })

  app.get<{ Params: { hash: string } }>('/swap/:hash/status', async (request, reply) => {
    try {
      const status = await getSwapStatus(request.params.hash)
      return status
    } catch (err) {
      request.log.error(err)
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Status check failed' })
    }
  })
}
