import cron from 'node-cron'
import { config } from '../config'
import { pushRate } from '../lib/stellar'
import { toScaledRate } from '../lib/rates'

// Free, no-API-key exchange rate source, base USD. Swap this out for a paid
// provider (or your own aggregated feed) if you need tighter SLAs — this is
// meant as a working default, not a guaranteed-uptime dependency.
const FX_SOURCE_URL = 'https://open.er-api.com/v6/latest/USD'

async function fetchUsdRates(): Promise<Record<string, number>> {
  const res = await fetch(FX_SOURCE_URL)
  if (!res.ok) throw new Error(`FX source returned ${res.status}`)
  const data = (await res.json()) as { result: string; rates: Record<string, number> }
  if (data.result !== 'success') throw new Error('FX source reported failure')
  return data.rates
}

export async function runOracleOnce(log: { info: (msg: string) => void; error: (msg: unknown) => void }) {
  const currencies = Object.keys(config.currencyTokens)
  if (currencies.length === 0) {
    log.error('No currencies configured in CURRENCY_TOKENS_JSON — skipping oracle run')
    return
  }

  let rates: Record<string, number>
  try {
    rates = await fetchUsdRates()
  } catch (err) {
    log.error(`Failed to fetch FX rates: ${err instanceof Error ? err.message : err}`)
    return
  }

  for (const currency of currencies) {
    const rateVsUsd = currency === 'USD' ? 1 : rates[currency]
    if (rateVsUsd === undefined) {
      log.error(`No FX rate found for ${currency}, skipping`)
      continue
    }
    try {
      const hash = await pushRate(currency, toScaledRate(rateVsUsd))
      log.info(`Updated ${currency} rate to ${rateVsUsd} (tx ${hash})`)
    } catch (err) {
      log.error(`Failed to push rate for ${currency}: ${err instanceof Error ? err.message : err}`)
    }
  }
}

export function startRateOracle(log: { info: (msg: string) => void; error: (msg: unknown) => void }) {
  const intervalMinutes = Math.max(1, Math.round(config.oracleIntervalMs / 60_000))
  const cronExpr = `*/${intervalMinutes} * * * *`

  log.info(`Rate oracle scheduled every ${intervalMinutes} minute(s)`)
  cron.schedule(cronExpr, () => {
    runOracleOnce(log).catch(err => log.error(err))
  })

  // Also run once immediately on startup rather than waiting for the first tick.
  runOracleOnce(log).catch(err => log.error(err))
}
