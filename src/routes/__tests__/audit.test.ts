import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import { getDb, resetDb } from '../../lib/database.js';
import { createEnrollment } from '../../lib/enrollment.js';

// Mock stellar functions to avoid contract initialization issues
vi.mock('../../lib/stellar.js', () => ({
  getContractRates: vi.fn(() => Promise.resolve({ USD: '10000000', NGN: '1580000000' })),
  getContractAdmin: vi.fn(() => Promise.resolve('GADMIN')),
  getOracleInfo: vi.fn(() => Promise.resolve({ address: 'GORACLE', intervalMs: 300000 })),
}));

describe('Audit Routes Validation', () => {
  let app: any;

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    
    const { auditRoutes } = await import('../audit.js');
    
    app = Fastify();
    await app.register(auditRoutes);
    await app.ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    resetDb();
    const db = getDb();
    db.exec('DELETE FROM enrollments;');
  });

  describe('Identity address validation', () => {
    it('rejects invalid Stellar address format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit/enrollments/invalid'
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects address with wrong length', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit/enrollments/GABC123'
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects address not starting with G', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit/enrollments/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      });

      expect(response.statusCode).toBe(400);
    });

    it('accepts valid Stellar G address', async () => {
      const validAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      
      const response = await app.inject({
        method: 'GET',
        url: `/audit/enrollments/${validAddress}`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.address).toBe(validAddress);
      expect(body.enrollments).toEqual([]);
      expect(body.count).toBe(0);
    });
  });

  describe('Proof hash validation', () => {
    it('rejects proof hash with invalid length', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit/enrollment/abc123'
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects proof hash with non-hex characters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit/enrollment/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'
      });

      expect(response.statusCode).toBe(400);
    });

    it('accepts valid 64-char hex proof hash', async () => {
      const validHash = 'a'.repeat(64);
      
      const response = await app.inject({
        method: 'GET',
        url: `/audit/enrollment/${validHash}`
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Pagination validation', () => {
    it('rejects negative limit', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit/enrollments?limit=-1'
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects limit greater than 100', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit/enrollments?limit=101'
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects negative offset', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit/enrollments?offset=-1'
      });

      expect(response.statusCode).toBe(400);
    });

    it('accepts valid pagination params', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit/enrollments?limit=10&offset=0'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.enrollments).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('applies pagination correctly with enrollments', async () => {
      const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      
      for (let i = 0; i < 5; i++) {
        createEnrollment({ address, data: { index: i } });
      }

      const response = await app.inject({
        method: 'GET',
        url: `/audit/enrollments/${address}?limit=2&offset=1`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.enrollments.length).toBe(2);
      expect(body.count).toBe(2);
    });
  });

  describe('Combined validation', () => {
    it('validates both address and pagination params', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit/enrollments/invalid?limit=10'
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
