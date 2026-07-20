import { describe, it, expect, beforeEach } from 'vitest';
import { getSwaps, insertSwap, getSwapByHash, getRecentOracleRates, insertOracleRate, getDbStats } from '../models.js';
import { getDb, initDb } from '../database.js';

describe('DB Models', () => {
  beforeEach(() => {
    process.env.DB_FILE = ':memory:';
    initDb();
    const db = getDb();
    db.exec('DELETE FROM swaps; DELETE FROM oracle_rates;');
  });

  it('handles unknown address and empty history', () => {
    const swaps = getSwaps('UNKNOWN_ADDR');
    expect(swaps).toEqual([]);
    
    const single = getSwapByHash('UNKNOWN_ADDR', 'FAKE_HASH');
    expect(single).toBeUndefined();
  });

  it('persists and retrieves a swap event', () => {
    insertSwap({
      address: 'GABC',
      from_currency: 'USD',
      to_currency: 'EUR',
      amount_in: '100',
      amount_out: '90',
      tx_hash: 'hash1',
      timestamp: 1000,
      status: 'SUCCESS'
    });

    const swaps = getSwaps('GABC');
    expect(swaps.length).toBe(1);
    expect(swaps[0].tx_hash).toBe('hash1');

    const single = getSwapByHash('GABC', 'hash1');
    expect(single).toBeDefined();
    expect(single?.address).toBe('GABC');
  });

  it('paginates correctly', () => {
    for (let i = 0; i < 5; i++) {
      insertSwap({
        address: 'GPAG',
        from_currency: 'USD',
        to_currency: 'EUR',
        amount_in: '100',
        amount_out: '90',
        tx_hash: `hash${i}`,
        timestamp: 1000 + i,
        status: 'SUCCESS'
      });
    }

    const all = getSwaps('GPAG');
    expect(all.length).toBe(5);

    const page1 = getSwaps('GPAG', { limit: 2, offset: 0 });
    expect(page1.length).toBe(2);
    expect(page1[0].tx_hash).toBe('hash4'); // ordered by timestamp DESC
    expect(page1[1].tx_hash).toBe('hash3');

    const page2 = getSwaps('GPAG', { limit: 2, offset: 2 });
    expect(page2.length).toBe(2);
    expect(page2[0].tx_hash).toBe('hash2');
    expect(page2[1].tx_hash).toBe('hash1');
  });
});
