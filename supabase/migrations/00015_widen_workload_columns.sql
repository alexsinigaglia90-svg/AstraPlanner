-- 00015_widen_workload_columns.sql
-- Widen numeric columns to prevent overflow with high-volume demand

ALTER TABLE workload_plan
  ALTER COLUMN weighted_uph TYPE DECIMAL(12,2),
  ALTER COLUMN hours_needed TYPE DECIMAL(12,2),
  ALTER COLUMN fte_needed TYPE DECIMAL(10,2),
  ALTER COLUMN hours_assigned TYPE DECIMAL(12,2),
  ALTER COLUMN fte_assigned TYPE DECIMAL(10,2);

-- Also make weighted_uph nullable (null when no employees with skill)
ALTER TABLE workload_plan
  ALTER COLUMN weighted_uph DROP NOT NULL;
