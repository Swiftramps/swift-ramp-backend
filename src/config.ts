import 'dotenv/config'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

export const config = {
  port: Number(process.env.PORT || 4000),
  sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
  networkPassphrase: process.env.NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
  swapContractId: required('SWAP_CONTRACT_ID'),

  oracleSecretKey: required('ORACLE_SECRET_KEY'),

  currencyTokens: JSON.parse(process.env.CURRENCY_TOKENS_JSON || '{}') as Record<string, string>,

  oracleIntervalMs: Number(process.env.ORACLE_INTERVAL_MS || 5 * 60 * 1000),

  nodeEnv: process.env.NODE_ENV || 'development',
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : true,
}
