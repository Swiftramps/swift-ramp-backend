import { describe, it, expect } from 'vitest'
import { parseAuditEvent } from './auditEventParser'

const IDENTITY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
const HASH = 'b'.repeat(64)

const base = {
  id: 'evt-1',
  ledger: 42,
  ledgerClosedAt: '2026-01-01T00:00:00Z',
  txHash: 'tx-1',
  topic: ['enrolled', IDENTITY],
  value: { proof_hash: HASH },
}

describe('parseAuditEvent', () => {
  it('extracts identity, type, proof hash and ledger close time', () => {
    const parsed = parseAuditEvent(base)

    expect(parsed).toMatchObject({
      event_id: 'evt-1',
      identity: IDENTITY,
      event_type: 'enrolled',
      proof_hash: HASH,
      ledger: 42,
      tx_hash: 'tx-1',
      timestamp: Date.parse('2026-01-01T00:00:00Z'),
    })
  })

  it.each([
    ['enrolled', 'enrolled'],
    ['enroll', 'enrolled'],
    ['Enrolled', 'enrolled'],
    ['cancelled', 'cancelled'],
    ['canceled', 'cancelled'],
    ['cancel', 'cancelled'],
  ])('normalises the %s topic to %s', (topic, expected) => {
    expect(parseAuditEvent({ ...base, topic: [topic, IDENTITY] })?.event_type).toBe(expected)
  })

  it('ignores events that are not part of the audit trail', () => {
    expect(parseAuditEvent({ ...base, topic: ['transfer', IDENTITY] })).toBeNull()
    expect(parseAuditEvent({ ...base, topic: [] })).toBeNull()
  })

  it('ignores an event with no resolvable identity', () => {
    expect(parseAuditEvent({ ...base, topic: ['enrolled'], value: {} })).toBeNull()
    expect(parseAuditEvent({ ...base, topic: ['enrolled', 'not-an-address'], value: {} })).toBeNull()
  })

  it('accepts the identity from the payload when it is not a topic', () => {
    const parsed = parseAuditEvent({ ...base, topic: ['enrolled'], value: { user: IDENTITY, proof_hash: HASH } })
    expect(parsed?.identity).toBe(IDENTITY)
  })

  it('renders a byte-array proof hash as hex', () => {
    const bytes = Uint8Array.from([0xde, 0xad, 0xbe, 0xef])
    expect(parseAuditEvent({ ...base, value: { proof_hash: bytes } })?.proof_hash).toBe('deadbeef')
  })

  it('accepts a payload that is the proof hash itself', () => {
    expect(parseAuditEvent({ ...base, value: HASH })?.proof_hash).toBe(HASH)
  })

  it('keeps an event whose proof hash is missing, with a null hash', () => {
    // Dropping it would hide a real trail entry; a null hash is the honest answer.
    const parsed = parseAuditEvent({ ...base, value: {} })
    expect(parsed?.event_type).toBe('enrolled')
    expect(parsed?.proof_hash).toBeNull()
  })

  it('falls back to a derived id and a zero timestamp on a malformed event', () => {
    const parsed = parseAuditEvent({ topic: ['enrolled', IDENTITY], value: { proof_hash: HASH } })
    expect(parsed?.event_id).toBe('unknown-0-enrolled')
    expect(parsed?.timestamp).toBe(0)
  })
})
