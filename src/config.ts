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

  // The oracle key is a SEPARATE identity from your CLI "admin" if you want,
  // but it must be the same address you passed as `admin` to `initialize`
  // on the contract, since only that address can call set_rate.
  oracleSecretKey: required('ORACLE_SECRET_KEY'),

  currencyTokens: JSON.parse(process.env.CURRENCY_TOKENS_JSON || '{}') as Record<string, string>,

  // How often the rate oracle polls a real FX source and pushes updates on-chain.
  oracleIntervalMs: Number(process.env.ORACLE_INTERVAL_MS || 5 * 60 * 1000),
}
