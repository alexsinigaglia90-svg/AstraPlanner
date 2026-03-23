-- 00005_shifts_crews_rotation.sql
-- Adds crew, rotation_schedule, rotation_entry tables
-- Adds site_id to shift_pattern, crew_id to employee

-- 1. Add site_id to shift_pattern
ALTER TABLE shift_pattern ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES site(id) ON DELETE CASCADE;

-- 2. Crew table
CREATE TABLE IF NOT EXISTS crew (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID         NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  site_id         UUID         NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  code            VARCHAR(20)  NOT NULL,
  color           VARCHAR(20)  DEFAULT 'indigo',
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_crew_org_site_code UNIQUE (organization_id, site_id, code)
);

-- 3. Rotation schedule (one per site)
CREATE TABLE IF NOT EXISTS rotation_schedule (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID     NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  site_id         UUID     NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  cycle_weeks     SMALLINT NOT NULL DEFAULT 2,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_rotation_site UNIQUE (organization_id, site_id)
);

-- 4. Rotation entries (crew x week -> shift)
CREATE TABLE IF NOT EXISTS rotation_entry (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotation_schedule_id UUID     NOT NULL REFERENCES rotation_schedule(id) ON DELETE CASCADE,
  crew_id              UUID     NOT NULL REFERENCES crew(id) ON DELETE CASCADE,
  shift_pattern_id     UUID     NOT NULL REFERENCES shift_pattern(id) ON DELETE CASCADE,
  week_number          SMALLINT NOT NULL,
  CONSTRAINT uq_rotation_crew_week UNIQUE (rotation_schedule_id, crew_id, week_number)
);

-- 5. Add crew_id to employee
ALTER TABLE employee ADD COLUMN IF NOT EXISTS crew_id UUID REFERENCES crew(id) ON DELETE SET NULL;

-- 6. Enable RLS on new tables
ALTER TABLE crew ENABLE ROW LEVEL SECURITY;
ALTER TABLE rotation_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE rotation_entry ENABLE ROW LEVEL SECURITY;

-- 7. RLS policies
CREATE POLICY crew_select ON crew FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY rotation_schedule_select ON rotation_schedule FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY rotation_entry_select ON rotation_entry FOR SELECT USING (
  rotation_schedule_id IN (SELECT id FROM rotation_schedule WHERE organization_id = public.get_organization_id())
);
