-- =============================================================================
-- Migration 00020: Employee anonymization for AVG art. 17 (right to erasure)
-- =============================================================================
--
-- Context
-- -------
-- The existing employee flow has two paths:
--   1. Archive: `status = 'terminated'`, data untouched, used when someone
--      leaves employment normally. The data is preserved for payroll history,
--      audit trail, and the wettelijke bewaarplicht (fiscaal 7 jaar, etc.).
--   2. Hard delete: only possible when there is NO shift_assignment history.
--      Effectively an "oops, never should have been created" escape hatch.
--
-- Neither path implements the AVG art. 17 recht op vergetelheid: a
-- data-subject request to remove all directly identifying personal data
-- while preserving the non-personal, aggregate-only references needed for
-- historical planning KPIs, payroll reconciliation, and the immutable
-- audit log.
--
-- This migration introduces two small, additive columns on the employee
-- table so that an application-level `eraseEmployee` procedure can record
-- *when* and *by whom* the erasure happened. No existing column is removed
-- or constrained differently — all existing queries continue to work.
--
-- The actual anonymization happens in the application layer (see
-- src/server/routers/workforce.ts `eraseEmployee`) so that the same
-- transaction can both rewrite the PII columns and insert an explicit
-- audit_log entry with entity_type = 'employee' / action = 'ERASE'.
--
-- Columns added
-- -------------
--   deleted_at  TIMESTAMPTZ  NULL  — set to now() at erasure time
--   deleted_by  UUID         NULL  — set to the erasing tenant_admin user id
--
-- An index is added so a later UI filter ("show only AVG-erased employees")
-- can run cheaply, and a CHECK constraint enforces that deleted_by is
-- populated whenever deleted_at is.
-- =============================================================================

ALTER TABLE employee
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID;

COMMENT ON COLUMN employee.deleted_at IS
  'Timestamp when the employee was anonymised under AVG art. 17 (right to '
  'erasure). NULL for normal employees. Populated together with deleted_by.';

COMMENT ON COLUMN employee.deleted_by IS
  'UUID of the user (tenant_admin or super_admin) who executed the '
  'AVG erasure. NULL unless deleted_at is set. Needed for audit trail.';

ALTER TABLE employee
    ADD CONSTRAINT employee_deletion_consistency
    CHECK (
        (deleted_at IS NULL AND deleted_by IS NULL)
        OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
    );

-- Partial index: only the (small) set of erased rows. A regular b-tree
-- on deleted_at would have to index every NULL row, which is wasteful.
CREATE INDEX IF NOT EXISTS idx_employee_erased
    ON employee (organization_id, deleted_at DESC)
    WHERE deleted_at IS NOT NULL;
