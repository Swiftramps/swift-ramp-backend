-- Enrollment audit schema (issue #23).
-- Canonical definition of the enrollments table including the audit fields
-- added for the cancellation trail. Kept idempotent (CREATE TABLE IF NOT
-- EXISTS) so it can be applied safely on an existing database, and additive so
-- nothing already stored is dropped.

CREATE TABLE IF NOT EXISTS enrollments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    address     TEXT    NOT NULL,
    data        TEXT    NOT NULL DEFAULT '{}',
    proof_hash  VARCHAR(64),
    status      TEXT    NOT NULL DEFAULT 'active',
    canceled_at TIMESTAMP,
    canceled_by VARCHAR(56),
    created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_enrollments_address ON enrollments(address);
CREATE INDEX IF NOT EXISTS idx_enrollments_proof_hash ON enrollments(proof_hash);
