-- 00003_process_kanban.sql
-- Adds department.color for kanban column coloring
-- Adds process.norm_uph for single-value norm display

-- 1. Add color to department
ALTER TABLE department ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT 'indigo';

-- 2. Add norm_uph to process
ALTER TABLE process ADD COLUMN IF NOT EXISTS norm_uph DECIMAL(8,2);

-- 3. Backfill norm_uph from process_productivity_standard
UPDATE process p
SET norm_uph = pps.units_per_hour
FROM (
  SELECT DISTINCT ON (process_id) process_id, units_per_hour
  FROM process_productivity_standard
  WHERE skill_level = 3
  ORDER BY process_id, effective_date DESC NULLS LAST
) pps
WHERE p.id = pps.process_id AND p.norm_uph IS NULL;

-- 4. Default norm_uph for any remaining processes
UPDATE process SET norm_uph = 0 WHERE norm_uph IS NULL;
