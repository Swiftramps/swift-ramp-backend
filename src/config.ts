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

  oracleSecretKey: required('ORACLE_SECRET_KEY'),

  currencyTokens: JSON.parse(process.env['CURRENCY_TOKENS_JSON'] || '{}') as Record<string, string>,

  oracleIntervalMs: Number(process.env['ORACLE_INTERVAL_MS'] || 5 * 60 * 1000),

  nodeEnv,
  allowedOrigins: parseAllowedOrigins(nodeEnv, process.env['ALLOWED_ORIGINS']),
}

export type AppConfig = typeof config
