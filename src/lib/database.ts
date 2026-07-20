import Database from 'better-sqlite3'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { config } from '../config'

function getDbPath(): string {
  if (config.nodeEnv === 'test') {
    return path.join(os.tmpdir(), `enrollments-${crypto.randomUUID()}.db`)
  }
  return path.resolve(process.cwd(), 'data/enrollments.db')
}

let db: Database.Database
let dbPath: string

export function getDb(): Database.Database {
  if (!db) {
    dbPath = getDbPath()
    db = new Database(dbPath)
    if (config.nodeEnv !== 'test') {
      db.pragma('journal_mode = WAL')
    }
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
    dbPath = ''
  }
}
