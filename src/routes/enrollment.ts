import { FastifyInstance } from 'fastify'
import { computeProofHash, verifyProofHash } from '../lib/proofHash'

const enrollSchema = {
  body: {
    type: 'object',
    required: ['timestampSec', 'identity', 'queueId'],
    properties: {
      timestampSec: { type: 'integer', minimum: 0 },
      identity: { type: 'string', minLength: 1 },
      queueId: { type: 'string', minLength: 1 },
    },
  },
}

const verifySchema = {
  body: {
    type: 'object',
    required: ['timestampSec', 'identity', 'queueId', 'proofHash'],
    properties: {
      timestampSec: { type: 'integer', minimum: 0 },
      identity: { type: 'string', minLength: 1 },
      queueId: { type: 'string', minLength: 1 },
      proofHash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
    },
  },
}

export async function enrollmentRoutes(app: FastifyInstance) {
  /**
   * POST /enrollment
   * Accepts enrollment inputs, computes the SHA-256 proof hash in the same
   * preimage format as the on-chain contract, and returns it.
   */
  app.post<{
    Body: { timestampSec: number; identity: string; queueId: string }
  }>('/enrollment', { schema: enrollSchema }, async (request) => {
    const { timestampSec, identity, queueId } = request.body
    const proofHash = computeProofHash(timestampSec, identity, queueId)
    return { proofHash }
  })

  /**
   * POST /enrollment/verify
   * Re-derives the proof hash from the supplied inputs and compares it to
   * the provided `proofHash`. Returns `{ valid: true }` on match.
   */
  app.post<{
    Body: { timestampSec: number; identity: string; queueId: string; proofHash: string }
  }>('/enrollment/verify', { schema: verifySchema }, async (request, reply) => {
    const { timestampSec, identity, queueId, proofHash } = request.body
    const valid = verifyProofHash(timestampSec, identity, queueId, proofHash)
    if (!valid) {
      return reply.code(400).send({ error: 'proof hash mismatch' })
    }
    return { valid: true }
  })
}
