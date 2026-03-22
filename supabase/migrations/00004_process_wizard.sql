-- 00004_process_wizard.sql
-- Extends process table for wizard: type, support config, priority, certifications

ALTER TABLE process ADD COLUMN IF NOT EXISTS process_type VARCHAR(20) DEFAULT 'productive';
ALTER TABLE process ADD COLUMN IF NOT EXISTS support_type VARCHAR(20);
ALTER TABLE process ADD COLUMN IF NOT EXISTS parent_process_id UUID REFERENCES process(id) ON DELETE SET NULL;
ALTER TABLE process ADD COLUMN IF NOT EXISTS support_ratio_self INTEGER DEFAULT 1;
ALTER TABLE process ADD COLUMN IF NOT EXISTS support_ratio_parent INTEGER DEFAULT 1;
ALTER TABLE process ADD COLUMN IF NOT EXISTS fixed_headcount INTEGER;
ALTER TABLE process ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'important';
ALTER TABLE process ADD COLUMN IF NOT EXISTS conversion_input_uom VARCHAR(30);
ALTER TABLE process ADD COLUMN IF NOT EXISTS conversion_output_qty DECIMAL(8,2);
ALTER TABLE process ADD COLUMN IF NOT EXISTS certifications_required TEXT[] DEFAULT '{}';
