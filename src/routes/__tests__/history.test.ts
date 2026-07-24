import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { historyRoutes } from '../history.js';
import { getDb, initDb } from '../../db/database.js';
import { insertSwap } from '../../db/models.js';

describe('History Routes Integration', () => {
  let app: any;

  beforeAll(async () => {
    app = Fastify();
    await app.register(historyRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    process.env.DB_FILE = ':memory:';
    initDb();
    const db = getDb();
    db.exec('DELETE FROM swaps;');
  });

  it('persists a swap event and returns it via history endpoint', async () => {
    insertSwap({
      address: 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR',
      from_currency: 'USD',
      to_currency: 'EUR',
      amount_in: '100',
      amount_out: '90',
      tx_hash: 'tx_integ_1',
      timestamp: 1000,
      status: 'SUCCESS'
    });

    const response = await app.inject({
      method: 'GET',
      url: '/history/GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.address).toBe('GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR');
    expect(body.swaps.length).toBe(1);
    expect(body.swaps[0].tx_hash).toBe('tx_integ_1');
  });

  it('supports pagination via query params', async () => {
    for (let i = 0; i < 5; i++) {
      insertSwap({
        address: 'GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U',
        from_currency: 'USD',
        to_currency: 'EUR',
        amount_in: '100',
        amount_out: '90',
        tx_hash: `tx_p_${i}`,
        timestamp: 1000 + i,
        status: 'SUCCESS'
      });
    }

    const response = await app.inject({
      method: 'GET',
      url: '/history/GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U?limit=2&offset=1'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.swaps.length).toBe(2);
    expect(body.swaps[0].tx_hash).toBe('tx_p_3');
    expect(body.swaps[1].tx_hash).toBe('tx_p_2');
  });
});
