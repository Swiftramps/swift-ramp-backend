import { FastifyInstance } from 'fastify'
import { getQuote } from '../lib/stellar'
import { toScaledAmount, fromScaledAmount } from '../lib/rates'
import { config } from '../config'

const quoteSchema = {
  querystring: {
    type: 'object',
    required: ['from', 'to', 'amount'],
    properties: {
      from: { type: 'string', minLength: 3, maxLength: 3 },
      to: { type: 'string', minLength: 3, maxLength: 3 },
      amount: { type: 'string', pattern: '^\\d+(\\.\\d+)?$' },
    },
  },
}

export async function quoteRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { from: string; to: string; amount: string } }>(
    '/quote',
    {
      schema: quoteSchema,
      config: {
        rateLimit: {
          max: config.auditRateLimitMax,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { from, to, amount } = request.query
      const scaledReceive = await getQuote(from, to, toScaledAmount(amount))
      return { from, to, sendAmount: amount, receiveAmount: fromScaledAmount(scaledReceive) }
    }
  )
}
