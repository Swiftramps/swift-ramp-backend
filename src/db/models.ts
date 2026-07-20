import { getDb } from './database.js';

export interface SwapRecord {
  id?: number;
  address: string;
  from_currency: string;
  to_currency: string;
  amount_in: string;
  amount_out: string;
  tx_hash: string;
  timestamp: number;
  status: string;
}

export interface OracleRateRecord {
  id?: number;
  from_currency: string;
  to_currency: string;
  rate: string;
  source: string;
  timestamp: number;
}

export function insertSwap(swap: SwapRecord) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO swaps (address, from_currency, to_currency, amount_in, amount_out, tx_hash, timestamp, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(swap.address, swap.from_currency, swap.to_currency, swap.amount_in, swap.amount_out, swap.tx_hash, swap.timestamp, swap.status);
}

export function getSwaps(address: string, filters: { limit?: number; offset?: number; from?: number; to?: number } = {}) {
  const db = getDb();
  let query = 'SELECT * FROM swaps WHERE address = ?';
  const params: any[] = [address];

  if (filters.from) {
    query += ' AND timestamp >= ?';
    params.push(filters.from);
  }
  if (filters.to) {
    query += ' AND timestamp <= ?';
    params.push(filters.to);
  }
  
  query += ' ORDER BY timestamp DESC';

  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }
  }

  return db.prepare(query).all(...params) as SwapRecord[];
}

export function getSwapByHash(address: string, txHash: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM swaps WHERE address = ? AND tx_hash = ?').get(address, txHash) as SwapRecord | undefined;
}

export function insertOracleRate(rate: OracleRateRecord) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO oracle_rates (from_currency, to_currency, rate, source, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(rate.from_currency, rate.to_currency, rate.rate, rate.source, rate.timestamp);
}

export function getRecentOracleRates(limit: number = 100) {
  const db = getDb();
  return db.prepare('SELECT * FROM oracle_rates ORDER BY timestamp DESC LIMIT ?').all(limit) as OracleRateRecord[];
}

export function getDbStats() {
  const db = getDb();
  const swapCount = (db.prepare('SELECT COUNT(*) as c FROM swaps').get() as any).c;
  const rateCount = (db.prepare('SELECT COUNT(*) as c FROM oracle_rates').get() as any).c;
  const lastSwap = (db.prepare('SELECT MAX(timestamp) as m FROM swaps').get() as any).m;
  return { swapCount, rateCount, lastSwap };
}
