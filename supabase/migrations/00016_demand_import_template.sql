-- 00016_demand_import_template.sql
-- Reusable templates for demand forecast uploads

CREATE TABLE demand_import_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization(id),
  name TEXT NOT NULL,
  column_mappings JSONB NOT NULL DEFAULT '{}',
  header_row INT NOT NULL DEFAULT 0,
  data_start_row INT NOT NULL DEFAULT 1,
  data_end_row INT,
  skip_rows INT[] DEFAULT '{}',
  orientation TEXT NOT NULL DEFAULT 'rows_dates',
  unit_type TEXT NOT NULL DEFAULT 'units',
  sheet_name TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE demand_import_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY template_select ON demand_import_template
  FOR SELECT USING (organization_id = (
    SELECT (raw_app_meta_data->>'organization_id')::uuid
    FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY template_modify ON demand_import_template
  FOR ALL USING (organization_id = (
    SELECT (raw_app_meta_data->>'organization_id')::uuid
    FROM auth.users WHERE id = auth.uid()
  ));
