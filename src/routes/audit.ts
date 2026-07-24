import type { FastifyInstance } from 'fastify'
import { getContractRates, getContractAdmin, getOracleInfo } from '../lib/stellar'
import { getEnrollmentsByAddress, getAllEnrollments, getEnrollmentByProofHash } from '../lib/enrollment'

const addressSchema = {
  params: {
    type: 'object',
    required: ['address'],
    properties: {
      address: { type: 'string', pattern: '^G[A-Z0-9]{55}$' },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      limit: { type: 'number', minimum: 1, maximum: 100 },
      offset: { type: 'number', minimum: 0 },
    },
  },
}

const proofHashSchema = {
  params: {
    type: 'object',
    required: ['proofHash'],
    properties: {
      proofHash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
    },
  },
}

const paginationSchema = {
  querystring: {
    type: 'object',
    properties: {
      limit: { type: 'number', minimum: 1, maximum: 100 },
      offset: { type: 'number', minimum: 0 },
    },
  },
}

export async function auditRoutes(app: FastifyInstance) {
  app.get('/audit/contract', async () => {
    const rates = await getContractRates()
    const admin = await getContractAdmin()
    return { admin, rates }
  })

  app.get('/audit/oracle', async () => {
    const oracleInfo = await getOracleInfo()
    return oracleInfo
  })

  app.get<{ Params: { address: string }, Querystring: { limit?: number, offset?: number } }>(
    '/audit/enrollments/:address',
    { schema: addressSchema },
    async (request) => {
      const { address } = request.params
      const { limit, offset } = request.query
      
      let enrollments = getEnrollmentsByAddress(address)
      
      if (offset) {
        enrollments = enrollments.slice(offset)
      }
      if (limit) {
        enrollments = enrollments.slice(0, limit)
      }
      
      return { address, enrollments, count: enrollments.length }
    }
  )

  app.get<{ Params: { proofHash: string } }>(
    '/audit/enrollment/:proofHash',
    { schema: proofHashSchema },
    async (request, reply) => {
      const { proofHash } = request.params
      
      const enrollment = getEnrollmentByProofHash(proofHash)
      if (!enrollment) {
        return reply.status(404).send({ error: 'Enrollment not found' })
      }
      return enrollment
    }
  )

  app.get<{ Querystring: { limit?: number, offset?: number } }>(
    '/audit/enrollments',
    { schema: paginationSchema },
    async (request) => {
      const { limit, offset } = request.query
      
      let enrollments = getAllEnrollments()
      
      if (offset) {
        enrollments = enrollments.slice(offset)
      }
      if (limit) {
        enrollments = enrollments.slice(0, limit)
      }
      
      return { enrollments, count: enrollments.length }
    }
  )
}
