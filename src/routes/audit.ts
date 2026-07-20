import type { FastifyInstance } from 'fastify'
import { getContractRates, getContractAdmin, getOracleInfo } from '../lib/stellar'

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
}
