import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(process.cwd(), 'src', 'db', 'migrations');

let db: Database.Database;

export function initDb() {
  // Read at call time, not module load: tests set DB_FILE before initialising,
  // and at load time the value would already have been captured.
  const dbFile = process.env['DB_FILE'] ?? 'swiftramp.db';
  db = new Database(dbFile);
  if (dbFile !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }

  // Initialize migrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  runMigrations();
}

function runMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return;

  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  const appliedMigrations = new Set(
    db.prepare('SELECT name FROM migrations').all().map((r: any) => r.name)
  );

  for (const file of files) {
    if (!appliedMigrations.has(file)) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
      })();
      console.log(`Applied migration: ${file}`);
    }
  }
}

export function getDb(): Database.Database {
  if (!db) initDb();
  return db;
}
