import type { FastifyInstance } from 'fastify'
import { submitSignedSwap, getSwapStatus } from '../lib/stellar'

const submitSchema = {
  body: {
    type: 'object',
    required: ['signedTxXdr'],
    properties: {
      signedTxXdr: { type: 'string', minLength: 1 },
    },
  },
}

const statusSchema = {
  params: {
    type: 'object',
    required: ['hash'],
    properties: {
      hash: { type: 'string', minLength: 1 },
    },
  },
}

export async function swapRoutes(app: FastifyInstance) {
  app.post<{ Body: { signedTxXdr: string } }>('/swap/submit', { schema: submitSchema }, async request => {
    const result = await submitSignedSwap(request.body.signedTxXdr)
    return result
  })

  app.get<{ Params: { hash: string } }>('/swap/:hash/status', { schema: statusSchema }, async request => {
    const status = await getSwapStatus(request.params.hash)
    return status
  })
}
