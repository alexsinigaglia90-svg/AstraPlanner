-- 00007_process_constraints.sql
-- Add trained-only restriction + min/max staffing constraints to process

ALTER TABLE process ADD COLUMN IF NOT EXISTS restrict_to_trained BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE process ADD COLUMN IF NOT EXISTS min_staffing INTEGER;
ALTER TABLE process ADD COLUMN IF NOT EXISTS max_staffing INTEGER;
