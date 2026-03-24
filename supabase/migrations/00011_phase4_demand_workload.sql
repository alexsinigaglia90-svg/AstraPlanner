-- Phase 4: Demand overrides + support process config

-- Per-process volume override (when planner overrides cascade calculation)
CREATE TABLE demand_process_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization(id),
  demand_forecast_id UUID NOT NULL REFERENCES demand_forecast(id) ON DELETE CASCADE,
  process_id UUID NOT NULL REFERENCES process(id),
  override_volume DECIMAL NOT NULL CHECK (override_volume >= 0 AND override_volume <= 999999),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (demand_forecast_id, process_id)
);

CREATE INDEX idx_dpo_forecast ON demand_process_override(demand_forecast_id);

-- Support process configuration
ALTER TABLE process ADD COLUMN IF NOT EXISTS support_method TEXT
  CHECK (support_method IN ('fixed_headcount', 'linked_ratio', 'frequency_based'));
ALTER TABLE process ADD COLUMN IF NOT EXISTS support_config_json JSONB DEFAULT '{}';

-- RLS policies (using admin client bypass pattern)
ALTER TABLE demand_process_override ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demand_process_override_org_isolation"
  ON demand_process_override FOR ALL
  USING (organization_id = current_setting('app.organization_id', true)::uuid);
