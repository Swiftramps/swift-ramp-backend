import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import { resetDb, getDb } from '../../lib/database.js';
import { createEnrollment } from '../../lib/enrollment.js';

// Mock stellar functions to avoid contract initialization issues
vi.mock('../../lib/stellar.js', () => ({
  getContractRates: vi.fn(() => Promise.resolve({ USD: '10000000', NGN: '1580000000' })),
  getContractAdmin: vi.fn(() => Promise.resolve('GADMIN')),
  getOracleInfo: vi.fn(() => Promise.resolve({ address: 'GORACLE', intervalMs: 300000 })),
  submitCancelToContract: vi.fn(() => Promise.resolve(true)),
}));

const ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('POST /enrollments/:id/cancel', () => {
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
    vi.clearAllMocks();
  });

  it('cancels an enrollment and returns an audit trail with the original proof_hash', async () => {
    const enrollment = createEnrollment({ address: ADDRESS, data: { name: 'Alice' } });

    const response = await app.inject({
      method: 'POST',
      url: `/enrollments/${enrollment.id}/cancel`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.message).toBe('Cancelled successfully');
    expect(body.audit_trail).toBeDefined();
    expect(body.audit_trail.proof_hash).toBe(enrollment.proof_hash);
    expect(body.audit_trail.cancelled_at).toBeTruthy();

    const { submitCancelToContract } = await import('../../lib/stellar.js');
    expect(submitCancelToContract).toHaveBeenCalledWith(enrollment.proof_hash);
  });

  it('returns 400 when cancelling an already-cancelled enrollment', async () => {
    const enrollment = createEnrollment({ address: ADDRESS });

    await app.inject({
      method: 'POST',
      url: `/enrollments/${enrollment.id}/cancel`,
    });

    const second = await app.inject({
      method: 'POST',
      url: `/enrollments/${enrollment.id}/cancel`,
    });

    expect(second.statusCode).toBe(400);
    expect(second.json().error).toBe('Already cancelled');
  });

  it('returns 404 for a non-existent enrollment', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/enrollments/999999/cancel',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('Enrollment not found');
  });
});
