import {
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  Keypair,
  Address,
  rpc,
  xdr,
} from '@stellar/stellar-sdk'
import { config } from '../config'

export const server = new rpc.Server(config.sorobanRpcUrl)
export const contract = new Contract(config.swapContractId)
export const oracleKeypair = Keypair.fromSecret(config.oracleSecretKey)

/**
 * Read-only quote: simulates the contract's `quote` call using the oracle
 * account as a throwaway transaction source (no signature needed since we
 * never submit this transaction, only simulate it).
 */
export async function getQuote(fromCurrency: string, toCurrency: string, scaledAmount: bigint): Promise<bigint> {
  const account = await server.getAccount(oracleKeypair.publicKey())
  const op = contract.call(
    'quote',
    nativeToScVal(fromCurrency, { type: 'symbol' }),
    nativeToScVal(toCurrency, { type: 'symbol' }),
    nativeToScVal(scaledAmount, { type: 'i128' }),
  )
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: config.networkPassphrase })
    .addOperation(op)
    .setTimeout(30)
    .build()

  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`quote simulation failed: ${sim.error}`)
  }
  if (!sim.result) {
    throw new Error('quote simulation returned no result')
  }
  return BigInt(scValToNative(sim.result.retval))
}

/**
 * Oracle-signed rate update. Builds, signs with the oracle's own key
 * (no Freighter involved — this runs unattended on a schedule), and
 * submits+confirms a `set_rate` call.
 */
export async function pushRate(currency: string, rateScaled: bigint): Promise<string> {
  const account = await server.getAccount(oracleKeypair.publicKey())
  const op = contract.call(
    'set_rate',
    new Address(oracleKeypair.publicKey()).toScVal(),
    nativeToScVal(currency, { type: 'symbol' }),
    nativeToScVal(rateScaled, { type: 'i128' }),
  )
  const builtTx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: config.networkPassphrase })
    .addOperation(op)
    .setTimeout(60)
    .build()

  const preparedTx = await server.prepareTransaction(builtTx)
  preparedTx.sign(oracleKeypair)

  const sendResult = await server.sendTransaction(preparedTx)
  if (sendResult.status === 'ERROR') {
    throw new Error(`set_rate for ${currency} rejected before entering the ledger`)
  }
  return await pollUntilConfirmed(sendResult.hash)
}

/**
 * Submits an already-signed transaction (built + signed client-side via
 * Freighter, e.g. by the frontend's own stellar.ts helper) and waits for
 * confirmation. The backend never sees the user's private key.
 */
export async function submitSignedSwap(signedTxXdr: string): Promise<{ txHash: string; receivedAmount: string }> {
  const tx = TransactionBuilder.fromXDR(signedTxXdr, config.networkPassphrase)
  const sendResult = await server.sendTransaction(tx)
  if (sendResult.status === 'ERROR') {
    throw new Error('Soroban RPC rejected the transaction before it entered the ledger.')
  }
  const hash = await pollUntilConfirmed(sendResult.hash)
  const result = await server.getTransaction(hash)
  const receivedAmount =
    result.status === rpc.Api.GetTransactionStatus.SUCCESS && result.returnValue
      ? scValToNative(result.returnValue).toString()
      : '0'
  return { txHash: hash, receivedAmount }
}

export async function getSwapStatus(txHash: string) {
  const result = await server.getTransaction(txHash)
  if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    return {
      status: 'SUCCESS' as const,
      receivedAmount: result.returnValue ? scValToNative(result.returnValue).toString() : '0',
    }
  }
  if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
    return { status: 'FAILED' as const }
  }
  return { status: 'NOT_FOUND' as const }
}

/**
 * Pulls recent `swap` events emitted by the contract and filters them to
 * ones involving the given address, either as sender or recipient. This is
 * a read against the ledger's event stream, not a database — it only sees
 * events within the RPC provider's retention window (typically a week or
 * so on public infrastructure), which is fine for a recent-activity feed
 * but not a permanent record. For durable history, persist events to a
 * database as they're observed instead of re-querying the ledger each time.
 */
export async function getSwapHistory(address: string, limit = 20) {
  const latestLedger = await server.getLatestLedger()
  const startLedger = Math.max(1, latestLedger.sequence - 17280) // ~1 day of ledgers at 5s/ledger

  const events = await server.getEvents({
    startLedger,
    filters: [
      {
        type: 'contract',
        contractIds: [config.swapContractId],
        topics: [[xdr.ScVal.scvSymbol('swap').toXDR('base64'), '*', '*']],
      },
    ],
    limit: 100,
  })

  const matches: Array<{
    ledger: number
    txHash: string
    sender: string
    recipient: string
    receivedAmount: string
  }> = []

  for (const event of events.events) {
    try {
      const value = scValToNative(event.value) as unknown[]
      const [sender, recipient, receivedAmount] = value as [string, string, bigint]
      if (sender === address || recipient === address) {
        matches.push({
          ledger: event.ledger,
          txHash: event.txHash,
          sender,
          recipient,
          receivedAmount: receivedAmount.toString(),
        })
      }
    } catch {
      // Skip events that don't decode into the expected shape.
      continue
    }
  }

  return matches.slice(0, limit)
}

export async function getContractRates(): Promise<Record<string, string>> {
  const account = await server.getAccount(oracleKeypair.publicKey())
  const op = contract.call('get_rates')
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: config.networkPassphrase })
    .addOperation(op)
    .setTimeout(30)
    .build()

  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`get_rates simulation failed: ${sim.error}`)
  }
  if (!sim.result) {
    throw new Error('get_rates simulation returned no result')
  }
  const nativeResult = scValToNative(sim.result.retval) as Record<string, bigint>
  const rates: Record<string, string> = {}
  for (const [currency, rate] of Object.entries(nativeResult)) {
    rates[currency] = rate.toString()
  }
  return rates
}

export async function getContractAdmin(): Promise<string> {
  const account = await server.getAccount(oracleKeypair.publicKey())
  const op = contract.call('get_admin')
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: config.networkPassphrase })
    .addOperation(op)
    .setTimeout(30)
    .build()

  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`get_admin simulation failed: ${sim.error}`)
  }
  if (!sim.result) {
    throw new Error('get_admin simulation returned no result')
  }
  return scValToNative(sim.result.retval) as string
}

export async function getOracleInfo(): Promise<{ address: string; intervalMs: number }> {
  return {
    address: oracleKeypair.publicKey(),
    intervalMs: config.oracleIntervalMs,
  }
}

async function pollUntilConfirmed(hash: string, timeoutMs = 30_000): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const result = await server.getTransaction(hash)
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) return hash
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction ${hash} landed but failed on-chain`)
    }
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error(`Timed out waiting for ${hash} to confirm`)
}
