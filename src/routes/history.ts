import type { FastifyInstance } from 'fastify'
import { config } from '../config'
import { getSwaps, getSwapByHash } from '../db/models'

const historySchema = {
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
      from: { type: 'number' },
      to: { type: 'number' },
      limit: { type: 'number' },
      offset: { type: 'number' },
    }
  }
}

const historyItemSchema = {
  params: {
    type: 'object',
    required: ['address', 'tx_hash'],
    properties: {
      address: { type: 'string', pattern: '^G[A-Z0-9]{55}$' },
      tx_hash: { type: 'string' },
    },
  },
}

export async function historyRoutes(app: FastifyInstance) {
  app.get<{ Params: { address: string }, Querystring: { from?: number, to?: number, limit?: number, offset?: number } }>(
    '/history/:address',
    {
      schema: historySchema,
      config: {
        rateLimit: {
          max: config.auditRateLimitMax,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { from, to, limit, offset } = request.query;
      const swaps = getSwaps(address, { from, to, limit, offset });
      return { address, swaps };
    }
  );

  app.get<{ Params: { address: string, tx_hash: string } }>(
    '/history/:address/:tx_hash',
    {
      schema: historyItemSchema,
      config: {
        rateLimit: {
          max: config.auditRateLimitMax,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { address, tx_hash } = request.params;
      const swap = getSwapByHash(address, tx_hash);
      if (!swap) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return { address, swap };
    }
  );
}

