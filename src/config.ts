import 'dotenv/config'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

export function parseAllowedOrigins(
  nodeEnv: string,
  value: string | undefined,
): true | string[] {
  if (nodeEnv === 'development') return true

  return (value ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

const nodeEnv = process.env['NODE_ENV'] || 'development'

export const config = {
  auditRateLimitMax: Number(process.env['AUDIT_RATE_LIMIT_MAX'] || 20),
  standardRateLimitMax: Number(process.env['STANDARD_RATE_LIMIT_MAX'] || 100),
  port: Number(process.env['PORT'] || 4000),
  sorobanRpcUrl: process.env['SOROBAN_RPC_URL'] || 'https://soroban-testnet.stellar.org',
  networkPassphrase: process.env['NETWORK_PASSPHRASE'] || 'Test SDF Network ; September 2015',
  swapContractId: required('SWAP_CONTRACT_ID'),

  // Identity contract emitting the enrolled/cancelled audit events. Optional so
  // deployments that only run the swap side keep booting; /audit/:identity
  // reports 503 rather than guessing a contract when it is unset.
  identityContractId: process.env['IDENTITY_CONTRACT_ID'] || '',

  // How long a synced audit trail is served straight from cache before the
  // next read re-checks the chain.
  auditCacheTtlMs: Number(process.env['AUDIT_CACHE_TTL_MS'] || 30_000),

  // Ledgers to reach back on the first sync of a contract (~7 days at 5s/ledger).
  auditBackfillLedgers: Number(process.env['AUDIT_BACKFILL_LEDGERS'] || 120_960),

  oracleSecretKey: required('ORACLE_SECRET_KEY'),

  currencyTokens: JSON.parse(process.env['CURRENCY_TOKENS_JSON'] || '{}') as Record<string, string>,

  oracleIntervalMs: Number(process.env['ORACLE_INTERVAL_MS'] || 5 * 60 * 1000),

  nodeEnv,
  allowedOrigins: parseAllowedOrigins(nodeEnv, process.env['ALLOWED_ORIGINS']),
}

export type AppConfig = typeof config
