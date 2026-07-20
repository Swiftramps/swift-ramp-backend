CREATE TABLE IF NOT EXISTS swaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL,
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    amount_in TEXT NOT NULL,
    amount_out TEXT NOT NULL,
    tx_hash TEXT NOT NULL UNIQUE,
    timestamp INTEGER NOT NULL,
    status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_swaps_address ON swaps(address);
CREATE INDEX IF NOT EXISTS idx_swaps_tx_hash ON swaps(tx_hash);

CREATE TABLE IF NOT EXISTS oracle_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate TEXT NOT NULL,
    source TEXT NOT NULL,
    timestamp INTEGER NOT NULL
);
