import crypto from 'node:crypto'
import { getDb } from './database'

export interface Enrollment {
  id: number
  address: string
  data: string
  proof_hash: string | null
  created_at: string
}

export interface CreateEnrollmentInput {
  address: string
  data?: Record<string, unknown>
}

export function createEnrollment(input: CreateEnrollmentInput): Enrollment {
  const db = getDb()
  const now = new Date().toISOString()
  const data = JSON.stringify(input.data ?? {})
  const payload = JSON.stringify({ address: input.address, data, created_at: now })
  const proof_hash = crypto.createHash('sha256').update(payload).digest('hex')

  const stmt = db.prepare(`
    INSERT INTO enrollments (address, data, proof_hash, created_at)
    VALUES (?, ?, ?, ?)
  `)
  const result = stmt.run(input.address, data, proof_hash, now)

  return {
    id: result.lastInsertRowid as number,
    address: input.address,
    data,
    proof_hash,
    created_at: now,
  }
}

export function getEnrollment(id: number): Enrollment | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM enrollments WHERE id = ?').get(id) as Enrollment | undefined
}

export function getEnrollmentsByAddress(address: string): Enrollment[] {
  const db = getDb()
  return db.prepare('SELECT * FROM enrollments WHERE address = ? ORDER BY created_at DESC').all(address) as Enrollment[]
}

export function getAllEnrollments(): Enrollment[] {
  const db = getDb()
  return db.prepare('SELECT * FROM enrollments ORDER BY created_at DESC').all() as Enrollment[]
}
