import { createHash } from 'node:crypto'

/**
 * Encodes the proof preimage in the same byte layout the Soroban contract uses:
 *   [ timestamp: 8 bytes big-endian u64 ]
 *   [ identity:  variable UTF-8 bytes   ]
 *   [ queue_id:  variable UTF-8 bytes   ]
 *
 * Returns the SHA-256 digest as a lowercase hex string.
 */
export function computeProofHash(
  timestampSec: number | bigint,
  identity: string,
  queueId: string,
): string {
  // 8-byte big-endian unsigned 64-bit integer for the timestamp
  const tsBuf = Buffer.allocUnsafe(8)
  const tsBI = BigInt(timestampSec)
  tsBuf.writeBigUInt64BE(tsBI)

  const identityBuf = Buffer.from(identity, 'utf8')
  const queueIdBuf = Buffer.from(queueId, 'utf8')

  const preimage = Buffer.concat([tsBuf, identityBuf, queueIdBuf])
  return createHash('sha256').update(preimage).digest('hex')
}

/**
 * Recomputes the proof hash from the supplied inputs and compares it
 * to the provided `expectedHash` (hex string, case-insensitive).
 * Returns `true` only when the hashes match exactly.
 */
export function verifyProofHash(
  timestampSec: number | bigint,
  identity: string,
  queueId: string,
  expectedHash: string,
): boolean {
  const computed = computeProofHash(timestampSec, identity, queueId)
  return computed === expectedHash.toLowerCase()
}
