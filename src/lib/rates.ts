export const RATE_SCALE = 10_000_000n

export function toScaledAmount(decimalAmount: string): bigint {
  const [whole, frac = ''] = decimalAmount.split('.')
  const fracPadded = (frac + '0000000').slice(0, 7)
  return BigInt(whole || '0') * RATE_SCALE + BigInt(fracPadded || '0')
}

export function fromScaledAmount(scaled: bigint): string {
  const whole = scaled / RATE_SCALE
  const frac = (scaled % RATE_SCALE).toString().padStart(7, '0')
  return `${whole}.${frac}`
}

export function toScaledRate(rateVsUsd: number): bigint {
  return BigInt(Math.round(rateVsUsd * Number(RATE_SCALE)))
}
