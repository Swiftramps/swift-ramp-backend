import type { FastifyInstance } from 'fastify'
import { getRecentOracleRates } from '../db/models.js'

export async function oracleRoutes(app: FastifyInstance) {
  app.get(
    '/oracle/rates',
    async () => {
      const rates = getRecentOracleRates(100);
      return { rates };
    }
  );
}
