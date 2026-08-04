-- Rollback for 003_enrollments.sql (issue #23).
-- Provided for environments that need to revert the enrollments audit schema.
DROP INDEX IF EXISTS idx_enrollments_address;
DROP INDEX IF EXISTS idx_enrollments_proof_hash;
DROP TABLE IF EXISTS enrollments;