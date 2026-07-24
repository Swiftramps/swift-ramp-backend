import { getDb } from './database.js';

export type AuditEventType = 'enrolled' | 'cancelled';

export interface AuditEventRecord {
  id?: number;
  event_id: string;
  identity: string;
  event_type: AuditEventType;
  proof_hash: string | null;
  ledger: number;
  ledger_closed_at: string;
  timestamp: number;
  tx_hash: string;
}

export interface AuditEventFilters {
  limit?: number;
  offset?: number;
  from?: number;
  to?: number;
}

/**
 * Idempotent by `event_id`, so an overlapping re-sync is a no-op rather than a
 * duplicated trail. Written in one transaction so a partial batch never lands.
 */
export function insertAuditEvents(events: AuditEventRecord[]): number {
  if (events.length === 0) return 0;

  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO audit_events
      (event_id, identity, event_type, proof_hash, ledger, ledger_closed_at, timestamp, tx_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction((batch: AuditEventRecord[]) => {
    let inserted = 0;
    for (const e of batch) {
      const result = stmt.run(
        e.event_id,
        e.identity,
        e.event_type,
        e.proof_hash,
        e.ledger,
        e.ledger_closed_at,
        e.timestamp,
        e.tx_hash,
      );
      inserted += result.changes;
    }
    return inserted;
  });

  return insertAll(events);
}

function buildWhere(identity: string, filters: AuditEventFilters) {
  let where = 'WHERE identity = ?';
  const params: (string | number)[] = [identity];

  if (filters.from !== undefined) {
    where += ' AND timestamp >= ?';
    params.push(filters.from);
  }
  if (filters.to !== undefined) {
    where += ' AND timestamp <= ?';
    params.push(filters.to);
  }

  return { where, params };
}

/**
 * Chronological (oldest first) — an audit trail is read forwards, and a stable
 * order is what makes `offset` paging safe. `id` breaks ties within a ledger,
 * preserving the order the events were emitted in.
 */
export function getAuditEvents(identity: string, filters: AuditEventFilters = {}): AuditEventRecord[] {
  const db = getDb();
  const { where, params } = buildWhere(identity, filters);

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const query = `SELECT * FROM audit_events ${where} ORDER BY ledger ASC, id ASC LIMIT ? OFFSET ?`;
  return db.prepare(query).all(...params, limit, offset) as AuditEventRecord[];
}

export function countAuditEvents(identity: string, filters: AuditEventFilters = {}): number {
  const db = getDb();
  const { where, params } = buildWhere(identity, filters);
  const row = db.prepare(`SELECT COUNT(*) as c FROM audit_events ${where}`).get(...params) as { c: number };
  return row.c;
}

export interface AuditCursor {
  contract_id: string;
  last_ledger: number;
  synced_at: number;
}

export function getAuditCursor(contractId: string): AuditCursor | undefined {
  const db = getDb();
  return db
    .prepare('SELECT * FROM audit_cursor WHERE contract_id = ?')
    .get(contractId) as AuditCursor | undefined;
}

export function setAuditCursor(contractId: string, lastLedger: number, syncedAt: number): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_cursor (contract_id, last_ledger, synced_at)
    VALUES (?, ?, ?)
    ON CONFLICT(contract_id) DO UPDATE SET last_ledger = excluded.last_ledger, synced_at = excluded.synced_at
  `).run(contractId, lastLedger, syncedAt);
}
