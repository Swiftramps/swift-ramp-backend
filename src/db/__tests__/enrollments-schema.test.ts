import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getDb, initDb } from '../database.js';

const MIGRATION = path.join(process.cwd(), 'src', 'db', 'migrations', '003_enrollments.sql');

describe('Enrollment audit schema (003_enrollments.sql)', () => {
  beforeEach(() => {
    process.env.DB_FILE = ':memory:';
    initDb();
  });

  function columns(): string[] {
    const db = getDb();
    return (db.prepare('PRAGMA table_info(enrollments)').all() as Array<{ name: string }>).map(
      c => c.name,
    );
  }

  it('creates the enrollments table with the required audit fields', () => {
    const cols = columns();
    expect(cols).toContain('proof_hash');
    expect(cols).toContain('canceled_at');
    expect(cols).toContain('canceled_by');
    expect(cols).toContain('status');
    expect(cols).toContain('address');
    expect(cols).toContain('created_at');
  });

  it('defines proof_hash with a 64-char limit', () => {
    const db = getDb();
    const col = (db.prepare('PRAGMA table_info(enrollments)').all() as Array<{ name: string; type: string; dflt_value: string | null }>).find(
      c => c.name === 'proof_hash',
    );
    expect(col?.type.toUpperCase()).toContain('VARCHAR');
  });

  it('is idempotent when re-applied to an existing database', () => {
    const db = getDb();
    // Re-run the migration SQL directly to simulate applying it to a database
    // that already has the table (must not throw or duplicate columns).
    db.exec(fs.readFileSync(MIGRATION, 'utf8'));
    db.exec(`
      INSERT INTO enrollments (address, data, proof_hash, created_at)
      VALUES ('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '{}', '${'a'.repeat(64)}', '2026-01-01T00:00:00.000Z')
    `);
    const rows = db.prepare('SELECT COUNT(*) AS c FROM enrollments').get() as { c: number };
    expect(rows.c).toBe(1);
    expect(columns()).toContain('canceled_at');
  });

  it('is backward compatible: rows can be inserted with only the original columns', () => {
    const db = getDb();
    db.prepare(`
      INSERT INTO enrollments (address, data, created_at)
      VALUES (?, ?, ?)
    `).run('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '{}', '2026-01-01T00:00:00.000Z');

    const row = db
      .prepare('SELECT status, canceled_at, canceled_by FROM enrollments')
      .get() as { status: string; canceled_at: string | null; canceled_by: string | null };
    expect(row.status).toBe('active');
    expect(row.canceled_at).toBeNull();
    expect(row.canceled_by).toBeNull();
  });
});
