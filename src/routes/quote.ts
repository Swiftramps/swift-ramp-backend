import { FastifyInstance } from 'fastify'
import { getQuote } from '../lib/stellar'
import { toScaledAmount, fromScaledAmount } from '../lib/rates'

export async function quoteRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { from: string; to: string; amount: string } }>('/quote', async (request, reply) => {
    const { from, to, amount } = request.query
    if (!from || !to || !amount) {
      return reply.code(400).send({ error: 'from, to, and amount are required query params' })
    }
    try {
      const scaledReceive = await getQuote(from, to, toScaledAmount(amount))
      return { from, to, sendAmount: amount, receiveAmount: fromScaledAmount(scaledReceive) }
    } catch (err) {
      request.log.error(err)
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Quote failed' })
    }
  })
}
