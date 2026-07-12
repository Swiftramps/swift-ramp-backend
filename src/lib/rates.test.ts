import { describe, it, expect } from 'vitest'
import { toScaledAmount, fromScaledAmount, toScaledRate } from './rates'

describe('toScaledAmount', () => {
  it('converts a whole number', () => {
    expect(toScaledAmount('100')).toBe(100n * 10_000_000n)
  })

  it('converts with decimal places', () => {
    expect(toScaledAmount('1.5')).toBe(15_000_000n)
  })

  it('pads fractional part to 7 digits', () => {
    expect(toScaledAmount('0.1234567')).toBe(1_234_567n)
  })

  it('truncates excess fractional digits', () => {
    expect(toScaledAmount('0.123456789')).toBe(1_234_567n)
  })

  it('handles zero', () => {
    expect(toScaledAmount('0')).toBe(0n)
  })
})

describe('fromScaledAmount', () => {
  it('converts back to decimal string', () => {
    expect(fromScaledAmount(15_000_000n)).toBe('1.5000000')
  })

  it('handles whole number', () => {
    expect(fromScaledAmount(100n * 10_000_000n)).toBe('100.0000000')
  })

  it('pads fractional part', () => {
    expect(fromScaledAmount(1_234_567n)).toBe('0.1234567')
  })
})

describe('toScaledRate', () => {
  it('converts USD rate', () => {
    expect(toScaledRate(1)).toBe(10_000_000n)
  })

  it('converts NGN rate', () => {
    expect(toScaledRate(1587.15)).toBe(15_871_500_000n)
  })
})
