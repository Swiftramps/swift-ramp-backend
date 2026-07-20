import { FastifyInstance } from 'fastify'
import { createEnrollment, getEnrollment, getEnrollmentsByAddress } from '../lib/enrollment'

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
