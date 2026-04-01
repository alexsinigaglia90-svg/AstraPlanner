-- Demand forecast version history tracking
-- Captures every change to a forecast row for trend analysis

CREATE TABLE demand_forecast_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization(id),
  demand_forecast_id UUID NOT NULL REFERENCES demand_forecast(id) ON DELETE CASCADE,
  process_id UUID,
  demand_type_id UUID,
  site_id UUID NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  volume_old DECIMAL(12,2) NOT NULL,
  volume_new DECIMAL(12,2) NOT NULL,
  change_pct DECIMAL(6,2),
  weeks_ahead INT,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dfh_forecast ON demand_forecast_history(demand_forecast_id);
CREATE INDEX idx_dfh_org_site ON demand_forecast_history(organization_id, site_id);
CREATE INDEX idx_dfh_period ON demand_forecast_history(period_start, weeks_ahead);

ALTER TABLE demand_forecast_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY dfh_select ON demand_forecast_history
  FOR SELECT USING (organization_id = (
    SELECT (raw_app_meta_data->>'organization_id')::uuid
    FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY dfh_modify ON demand_forecast_history
  FOR ALL USING (organization_id = (
    SELECT (raw_app_meta_data->>'organization_id')::uuid
    FROM auth.users WHERE id = auth.uid()
  ));
