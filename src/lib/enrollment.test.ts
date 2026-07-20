import { describe, it, expect, beforeEach } from 'vitest'
import crypto from 'node:crypto'
import { createEnrollment, getEnrollment, getEnrollmentsByAddress, getAllEnrollments } from './enrollment'
import { resetDb } from './database'

beforeEach(() => {
  resetDb()
})

describe('createEnrollment', () => {
  it('stores an enrollment with a proof_hash', () => {
    const enrollment = createEnrollment({
      address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    })

    expect(enrollment.id).toBeGreaterThan(0)
    expect(enrollment.address).toBe('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF')
    expect(enrollment.proof_hash).toBeTruthy()
    expect(enrollment.proof_hash).toHaveLength(64)
    expect(enrollment.created_at).toBeTruthy()
  })

  it('proof_hash is the hex-encoded SHA-256 of the enrollment data', () => {
    const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
    const enrollment = createEnrollment({ address, data: { foo: 'bar' } })

    const expectedPayload = JSON.stringify({
      address: enrollment.address,
      data: enrollment.data,
      created_at: enrollment.created_at,
    })
    const expectedHash = crypto.createHash('sha256').update(expectedPayload).digest('hex')

    expect(enrollment.proof_hash).toBe(expectedHash)
  })

  it('proof_hash is 64 hex characters (32 bytes)', () => {
    const enrollment = createEnrollment({
      address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    })

    expect(enrollment.proof_hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('stores custom data payload', () => {
    const data = { name: 'Alice', role: 'user' }
    const enrollment = createEnrollment({
      address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      data,
    })

    expect(JSON.parse(enrollment.data)).toEqual(data)
  })

  it('stores multiple enrollments for the same address', () => {
    const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
    const e1 = createEnrollment({ address })
    const e2 = createEnrollment({ address })

    const enrollments = getEnrollmentsByAddress(address)
    expect(enrollments).toHaveLength(2)
    expect(enrollments[0].id).toBe(e2.id)
    expect(enrollments[1].id).toBe(e1.id)
  })
})

describe('getEnrollment', () => {
  it('returns the enrollment for a given id', () => {
    const created = createEnrollment({
      address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    })

    const fetched = getEnrollment(created.id)
    expect(fetched).toBeDefined()
    expect(fetched!.id).toBe(created.id)
    expect(fetched!.proof_hash).toBe(created.proof_hash)
  })

  it('returns undefined for non-existent id', () => {
    expect(getEnrollment(9999)).toBeUndefined()
  })
})

describe('getAllEnrollments', () => {
  it('returns all enrollments ordered by created_at desc', () => {
    const e1 = createEnrollment({ address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' })
    const e2 = createEnrollment({ address: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWHF' })

    const all = getAllEnrollments()
    expect(all).toHaveLength(2)
    expect(all[0].id).toBe(e2.id)
    expect(all[1].id).toBe(e1.id)
  })
})
