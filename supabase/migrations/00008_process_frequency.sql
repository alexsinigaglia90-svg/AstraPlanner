-- 00008_process_frequency.sql
-- Frequency settings for supportive processes

ALTER TABLE process ADD COLUMN IF NOT EXISTS frequency_type VARCHAR(20) DEFAULT 'daily';
ALTER TABLE process ADD COLUMN IF NOT EXISTS frequency_days SMALLINT[];
ALTER TABLE process ADD COLUMN IF NOT EXISTS frequency_count INTEGER;
ALTER TABLE process ADD COLUMN IF NOT EXISTS duration_type VARCHAR(20) DEFAULT 'full_shift';  -- 'full_shift' | 'hours'
ALTER TABLE process ADD COLUMN IF NOT EXISTS duration_hours DECIMAL(4,1);  -- only when duration_type = 'hours'
