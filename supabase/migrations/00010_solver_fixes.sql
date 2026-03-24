-- 00010_solver_fixes.sql
-- Pre-solver fixes from sanity check

-- Fix #1: Rotation anchor date — needed to calculate date → week number → shift
ALTER TABLE rotation_schedule ADD COLUMN IF NOT EXISTS rotation_start_date DATE;

-- Fix #11: Default employee_skill.status to 'active' for solver filtering
-- (existing records that have NULL status need to be set)
UPDATE employee_skill SET status = 'active' WHERE status IS NULL;
