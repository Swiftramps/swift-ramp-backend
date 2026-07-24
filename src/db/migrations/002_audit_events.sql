-- Read-through cache of the identity contract's audit trail.
-- Contract events are the source of truth; nothing is ever written here that
-- was not first observed on chain, so this table can be dropped and rebuilt.

CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- RPC event id, globally unique. Makes re-syncing an overlapping ledger
    -- range idempotent via INSERT OR IGNORE.
    event_id TEXT NOT NULL UNIQUE,
    identity TEXT NOT NULL,
    event_type TEXT NOT NULL,
    proof_hash TEXT,
    ledger INTEGER NOT NULL,
    ledger_closed_at TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    tx_hash TEXT NOT NULL
);

-- Serves the endpoint's only access pattern: one identity, chronological.
CREATE INDEX IF NOT EXISTS idx_audit_events_identity ON audit_events(identity, ledger, id);

CREATE TABLE IF NOT EXISTS audit_cursor (
    contract_id TEXT PRIMARY KEY,
    last_ledger INTEGER NOT NULL,
    synced_at INTEGER NOT NULL
);
