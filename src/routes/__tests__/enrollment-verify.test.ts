import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import { getDb, resetDb } from '../../lib/database.js';
import { createEnrollment } from '../../lib/enrollment.js';
import { computeProofHash } from '../../lib/proofHash.js';

// Mock stellar functions to avoid contract initialization issues
vi.mock('../../lib/stellar.js', () => ({
  getContractRates: vi.fn(() => Promise.resolve({ USD: '10000000', NGN: '1580000000' })),
  getContractAdmin: vi.fn(() => Promise.resolve('GADMIN')),
  getOracleInfo: vi.fn(() => Promise.resolve({ address: 'GORACLE', intervalMs: 300000 })),
}));

describe('GET /enrollments/:hash/verify', () => {
  let app: any;

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    
    const { enrollmentRoutes } = await import('../enrollment.js');
    
    app = Fastify();
    await app.register(enrollmentRoutes);
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

  describe('Match cases', () => {
    it('returns valid:true when proof hash matches computed hash', async () => {
      const timestampSec = 1_700_000_000;
      const identity = 'alice';
      const queueId = 'queue-1';
      const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      
      // Create enrollment with contract preimage components
      const enrollment = createEnrollment({
        address,
        data: { custom: 'data' },
        timestampSec,
        identity,
        queueId,
      });

      // Compute the expected contract-style proof hash
      const expectedHash = computeProofHash(timestampSec, identity, queueId);
      
      // Update the enrollment to use the contract-style hash instead of the enrollment-style hash
      const db = getDb();
      db.prepare('UPDATE enrollments SET proof_hash = ? WHERE id = ?').run(expectedHash, enrollment.id);

      const response = await app.inject({
        method: 'GET',
        url: `/enrollments/${expectedHash}/verify`,
      });

      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.valid).toBe(true);
      expect(body.proof_hash).toBe(expectedHash);
      expect(body.computed_hash).toBe(expectedHash);
    });

    it('is case-insensitive for hash parameter', async () => {
      const timestampSec = 1_700_000_000;
      const identity = 'alice';
      const queueId = 'queue-1';
      const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      
      const enrollment = createEnrollment({
        address,
        data: { custom: 'data' },
        timestampSec,
        identity,
        queueId,
      });

      const expectedHash = computeProofHash(timestampSec, identity, queueId);
      const db = getDb();
      db.prepare('UPDATE enrollments SET proof_hash = ? WHERE id = ?').run(expectedHash, enrollment.id);

      // Test with uppercase hash
      const response = await app.inject({
        method: 'GET',
        url: `/enrollments/${expectedHash.toUpperCase()}/verify`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.valid).toBe(true);
    });
  });

  describe('Mismatch cases', () => {
    it('returns valid:false when proof hash does not match computed hash', async () => {
      const timestampSec = 1_700_000_000;
      const identity = 'alice';
      const queueId = 'queue-1';
      const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      
      const enrollment = createEnrollment({
        address,
        data: { custom: 'data' },
        timestampSec,
        identity,
        queueId,
      });

      // Use a different hash (computed with different queueId)
      const wrongHash = computeProofHash(timestampSec, identity, 'queue-2');
      const db = getDb();
      db.prepare('UPDATE enrollments SET proof_hash = ? WHERE id = ?').run(wrongHash, enrollment.id);

      const response = await app.inject({
        method: 'GET',
        url: `/enrollments/${wrongHash}/verify`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.valid).toBe(false);
      expect(body.proof_hash).toBe(wrongHash);
      expect(body.computed_hash).not.toBe(wrongHash);
    });

    it('returns valid:false when timestampSec does not match', async () => {
      const timestampSec = 1_700_000_000;
      const identity = 'alice';
      const queueId = 'queue-1';
      const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      
      const enrollment = createEnrollment({
        address,
        data: { custom: 'data' },
        timestampSec,
        identity,
        queueId,
      });

      const expectedHash = computeProofHash(timestampSec, identity, queueId);
      const db = getDb();
      db.prepare('UPDATE enrollments SET proof_hash = ? WHERE id = ?').run(expectedHash, enrollment.id);

      // Modify the stored timestampSec to cause mismatch
      const modifiedData = JSON.parse(enrollment.data);
      modifiedData.timestampSec = 1_700_000_001;
      db.prepare('UPDATE enrollments SET data = ? WHERE id = ?').run(JSON.stringify(modifiedData), enrollment.id);

      const response = await app.inject({
        method: 'GET',
        url: `/enrollments/${expectedHash}/verify`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.valid).toBe(false);
    });
  });

  describe('Error cases', () => {
    it('returns 404 for non-existent enrollment', async () => {
      const fakeHash = 'a'.repeat(64);

      const response = await app.inject({
        method: 'GET',
        url: `/enrollments/${fakeHash}/verify`,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Enrollment not found');
    });

    it('returns 400 for invalid hash format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/enrollments/invalid-hash/verify',
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when enrollment data missing required fields', async () => {
      const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      
      // Create enrollment without contract preimage components
      const enrollment = createEnrollment({
        address,
        data: { custom: 'data' },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/enrollments/${enrollment.proof_hash}/verify`,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Enrollment data missing required fields for verification');
    });
  });

  describe('Integration test with contract preimage format', () => {
    it('correctly computes hash matching contract preimage format', async () => {
      const timestampSec = 1_700_000_000;
      const identity = 'alice';
      const queueId = 'queue-1';
      const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      
      // Create enrollment with contract preimage components
      const enrollment = createEnrollment({
        address,
        data: { custom: 'data' },
        timestampSec,
        identity,
        queueId,
      });

      // Compute the expected contract-style proof hash
      const expectedHash = computeProofHash(timestampSec, identity, queueId);
      
      // Update the enrollment to use the contract-style hash
      const db = getDb();
      db.prepare('UPDATE enrollments SET proof_hash = ? WHERE id = ?').run(expectedHash, enrollment.id);

      const response = await app.inject({
        method: 'GET',
        url: `/enrollments/${expectedHash}/verify`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.valid).toBe(true);
      expect(body.proof_hash).toBe(expectedHash);
      expect(body.computed_hash).toBe(expectedHash);
    });

    it('handles big-endian timestamp encoding correctly', async () => {
      // Test with a specific timestamp to verify big-endian encoding
      const timestampSec = 1; // 1 in big-endian: 0x0000000000000001
      const identity = 'test';
      const queueId = 'q';
      const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      
      const enrollment = createEnrollment({
        address,
        data: {},
        timestampSec,
        identity,
        queueId,
      });

      const expectedHash = computeProofHash(timestampSec, identity, queueId);
      const db = getDb();
      db.prepare('UPDATE enrollments SET proof_hash = ? WHERE id = ?').run(expectedHash, enrollment.id);

      const response = await app.inject({
        method: 'GET',
        url: `/enrollments/${expectedHash}/verify`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.valid).toBe(true);
    });
  });
});
