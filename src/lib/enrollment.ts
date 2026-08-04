import crypto from 'node:crypto'
import { getDb } from './database'
import { computeProofHash } from './proofHash'

export interface Enrollment {
  id: number
  address: string
  data: string
  proof_hash: string | null
  status: 'active' | 'cancelled'
  created_at: string
}

export interface CancelEnrollmentResult {
  id: number
  proof_hash: string
  cancelled_at: string
}

export interface CreateEnrollmentInput {
  address: string
  data?: Record<string, unknown> | undefined
  timestampSec?: number | bigint
  identity?: string
  queueId?: string
}

export function createEnrollment(input: CreateEnrollmentInput): Enrollment {
  const db = getDb()
  const now = new Date().toISOString()
  
  // Merge contract preimage components with custom data
  // Convert BigInt to string for JSON serialization
  const mergedData = {
    ...input.data,
    timestampSec: typeof input.timestampSec === 'bigint' ? input.timestampSec.toString() : input.timestampSec,
    identity: input.identity,
    queueId: input.queueId,
  }
  
  const data = JSON.stringify(mergedData)
  
  // Use contract-compatible encoding when all preimage components are present
  let proof_hash: string
  if (input.timestampSec !== undefined && input.identity && input.queueId) {
    proof_hash = computeProofHash(input.timestampSec, input.identity, input.queueId)
  } else {
    // Fallback to JSON-based hashing for backward compatibility
    const payload = JSON.stringify({ address: input.address, data, created_at: now })
    proof_hash = crypto.createHash('sha256').update(payload).digest('hex')
  }

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
    status: 'active',
    created_at: now,
  }
}

export function getEnrollment(id: number): Enrollment | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM enrollments WHERE id = ?').get(id) as Enrollment | undefined
}

export function getEnrollmentsByAddress(address: string): Enrollment[] {
  const db = getDb()
  return db.prepare('SELECT * FROM enrollments WHERE address = ? ORDER BY created_at DESC, id DESC').all(address) as Enrollment[]
}

export function getAllEnrollments(): Enrollment[] {
  const db = getDb()
  return db.prepare('SELECT * FROM enrollments ORDER BY created_at DESC, id DESC').all() as Enrollment[]
}

export function getEnrollmentByProofHash(proofHash: string): Enrollment | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM enrollments WHERE proof_hash = ?').get(proofHash) as Enrollment | undefined
}

export function cancelEnrollment(id: number): CancelEnrollmentResult {
  const db = getDb()
  const enrollment = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(id) as Enrollment | undefined

  if (!enrollment) {
    throw new Error('Enrollment not found')
  }
  if (enrollment.status === 'cancelled') {
    throw new Error('Already cancelled')
  }

  const cancelledAt = new Date().toISOString()
  db.prepare("UPDATE enrollments SET status = 'cancelled' WHERE id = ?").run(id)

  return {
    id: enrollment.id,
    proof_hash: enrollment.proof_hash ?? '',
    cancelled_at: cancelledAt,
  }
}

export interface VerifyEnrollmentResult {
  valid: boolean
  proof_hash: string
  computed_hash: string
}

export function verifyEnrollmentProofHash(proofHash: string): VerifyEnrollmentResult {
  // Try to find enrollment with case-insensitive hash comparison
  const db = getDb()
  const enrollment = db.prepare('SELECT * FROM enrollments WHERE LOWER(proof_hash) = LOWER(?)').get(proofHash) as Enrollment | undefined
  
  if (!enrollment) {
    throw new Error('Enrollment not found')
  }

  // Parse the enrollment data to extract contract preimage components
  const data = JSON.parse(enrollment.data) as Record<string, unknown>
  
  // Extract timestampSec, identity, and queueId from the data
  // These should match the contract preimage format
  // Handle string conversion for BigInt values
  const timestampSecRaw = data['timestampSec']
  const timestampSec = typeof timestampSecRaw === 'string' ? BigInt(timestampSecRaw) : (timestampSecRaw as number | bigint)
  const identity = data['identity'] as string
  const queueId = data['queueId'] as string
  
  if (timestampSec === undefined || !identity || !queueId) {
    throw new Error('Enrollment data missing required fields for verification')
  }

  // Compute the contract-style proof hash
  const computedHash = computeProofHash(timestampSec, identity, queueId)
  
  return {
    valid: computedHash === proofHash.toLowerCase(),
    proof_hash: proofHash,
    computed_hash: computedHash
  }
}
