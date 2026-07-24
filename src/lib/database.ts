import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

function getDbPath(): string {
  return path.join(os.tmpdir(), `enrollments-${Date.now()}-${process.pid}.db`);
}

let db: Database.Database;
let dbPath: string;

export function getDb(): Database.Database {
  if (!db) {
    dbPath = getDbPath()
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    migrate(db)
  }
  return db
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      address    TEXT    NOT NULL,
      data       TEXT    NOT NULL DEFAULT '{}',
      proof_hash TEXT,
      created_at TEXT    NOT NULL
    )
  `)
}

export function resetDb() {
  if (db) {
    db.close()
    db = undefined as unknown as Database.Database
  }
  if (dbPath && fs.existsSync(dbPath)) {
    try { fs.unlinkSync(dbPath) } catch {}
    try { fs.unlinkSync(dbPath + '-shm') } catch {}
    try { fs.unlinkSync(dbPath + '-wal') } catch {}
  }
  dbPath = ''
}