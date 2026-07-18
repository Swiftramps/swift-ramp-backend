import { FastifyInstance } from 'fastify'
import { submitSignedSwap, getSwapStatus } from '../lib/stellar'

export async function swapRoutes(app: FastifyInstance) {
  app.post<{ Body: { signedTxXdr: string } }>('/swap/submit', async (request, reply) => {
    const { signedTxXdr } = request.body
    if (!signedTxXdr) {
      return reply.code(400).send({ error: 'signedTxXdr is required' })
    }
    const result = await submitSignedSwap(signedTxXdr)
    return result
  })

  app.get<{ Params: { hash: string } }>('/swap/:hash/status', async (request, reply) => {
    const status = await getSwapStatus(request.params.hash)
    return status
  })
}
