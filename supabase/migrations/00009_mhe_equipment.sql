-- 00009_mhe_equipment.sql
-- Material Handling Equipment (MHE) management

CREATE TABLE IF NOT EXISTS equipment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID         NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  site_id         UUID         NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  code            VARCHAR(20)  NOT NULL,
  category        VARCHAR(50)  NOT NULL DEFAULT 'mhe',  -- 'mhe' | 'tool' | 'station' | 'other'
  quantity        INTEGER      NOT NULL DEFAULT 1,
  description     TEXT,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_equipment_org_site_code UNIQUE (organization_id, site_id, code)
);

-- Process-Equipment linkage (which processes need which equipment)
CREATE TABLE IF NOT EXISTS process_equipment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id      UUID NOT NULL REFERENCES process(id) ON DELETE CASCADE,
  equipment_id    UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  units_per_person INTEGER NOT NULL DEFAULT 1,  -- how many units needed per person (usually 1)
  CONSTRAINT uq_process_equipment UNIQUE (process_id, equipment_id)
);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY equipment_select ON equipment FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY process_equipment_select ON process_equipment FOR SELECT USING (
  process_id IN (SELECT id FROM process WHERE organization_id = public.get_organization_id())
);
