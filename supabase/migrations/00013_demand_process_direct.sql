-- Allow direct process-based demand (no demand_type required)
ALTER TABLE demand_forecast ADD COLUMN IF NOT EXISTS process_id UUID REFERENCES process(id);
ALTER TABLE demand_forecast ALTER COLUMN demand_type_id DROP NOT NULL;

-- Add unit_of_measure to forecast for display
ALTER TABLE demand_forecast ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(30);

-- Unique constraint for process-based upserts
CREATE UNIQUE INDEX IF NOT EXISTS uq_df_process_period
  ON demand_forecast(organization_id, site_id, process_id, period_start, plan_version_id)
  WHERE process_id IS NOT NULL;
