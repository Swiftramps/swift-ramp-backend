import { beforeAll, describe, expect, it } from 'vitest'

let parseAllowedOrigins: typeof import('./config').parseAllowedOrigins

beforeAll(async () => {
  process.env['SWAP_CONTRACT_ID'] = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM'
  process.env['ORACLE_SECRET_KEY'] = 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4'
  ;({ parseAllowedOrigins } = await import('./config'))
})

describe('parseAllowedOrigins', () => {
  it('allows mirrored origins only in development', () => {
    expect(parseAllowedOrigins('development', undefined)).toBe(true)
  })

  it('parses and trims multiple production origins', () => {
    expect(parseAllowedOrigins(
      'production',
      ' https://swiftramp.com,https://app.swiftramp.com ',
    )).toEqual(['https://swiftramp.com', 'https://app.swiftramp.com'])
  })

  it('denies browser origins by default in production', () => {
    expect(parseAllowedOrigins('production', undefined)).toEqual([])
  })
})
