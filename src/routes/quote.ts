import { FastifyInstance } from 'fastify'
import { getQuote } from '../lib/stellar'

function toScaledAmount(decimalAmount: string): bigint {
  const [whole, frac = ''] = decimalAmount.split('.')
  const fracPadded = (frac + '0000000').slice(0, 7)
  return BigInt(whole || '0') * 10_000_000n + BigInt(fracPadded || '0')
}

function fromScaledAmount(scaled: bigint): string {
  const whole = scaled / 10_000_000n
  const frac = (scaled % 10_000_000n).toString().padStart(7, '0')
  return `${whole}.${frac}`
}

export async function quoteRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { from: string; to: string; amount: string } }>('/quote', async (request, reply) => {
    const { from, to, amount } = request.query
    if (!from || !to || !amount) {
      return reply.code(400).send({ error: 'from, to, and amount are required query params' })
    }
    const scaledReceive = await getQuote(from, to, toScaledAmount(amount))
    return { from, to, sendAmount: amount, receiveAmount: fromScaledAmount(scaledReceive) }
  })
}
