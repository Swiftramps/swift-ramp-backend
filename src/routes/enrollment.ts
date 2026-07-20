import { FastifyInstance } from 'fastify'
import { computeProofHash, verifyProofHash } from '../lib/proofHash'
import { createEnrollment, getEnrollment, getEnrollmentsByAddress } from '../lib/enrollment'

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

const createSchema = {
  body: {
    type: 'object',
    required: ['address'],
    properties: {
      address: { type: 'string', pattern: '^G[A-Z0-9]{55}$' },
      data: { type: 'object' },
    },
  },
}

const getSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'integer' },
    },
  },
}

const addressSchema = {
  params: {
    type: 'object',
    required: ['address'],
    properties: {
      address: { type: 'string', pattern: '^G[A-Z0-9]{55}$' },
    },
  },
}

export async function enrollmentRoutes(app: FastifyInstance) {
  app.post<{
    Body: { timestampSec: number; identity: string; queueId: string }
  }>('/enrollment', { schema: enrollSchema }, async (request) => {
    const { timestampSec, identity, queueId } = request.body
    const proofHash = computeProofHash(timestampSec, identity, queueId)
    return { proofHash }
  })

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

  app.post<{ Body: { address: string; data?: Record<string, unknown> } }>(
    '/enrollments',
    { schema: createSchema },
    async (request, reply) => {
      const enrollment = createEnrollment({
        address: request.body.address,
        data: request.body.data,
      })
      reply.code(201)
      return enrollment
    }
  )

  app.get<{ Params: { id: number } }>(
    '/enrollments/:id',
    { schema: getSchema },
    async (request, reply) => {
      const enrollment = getEnrollment(request.params.id)
      if (!enrollment) {
        reply.code(404)
        return { error: 'Enrollment not found' }
      }
      return enrollment
    }
  )

  app.get<{ Params: { address: string } }>(
    '/enrollments/address/:address',
    { schema: addressSchema },
    async (request, reply) => {
      const enrollments = getEnrollmentsByAddress(request.params.address)
      return { address: request.params.address, enrollments }
    }
  )
}
