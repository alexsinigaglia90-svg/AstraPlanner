-- 00006_job_roles.sql
-- Job roles (functies) for warehouse employees

CREATE TABLE IF NOT EXISTS job_role (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID         NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  site_id           UUID         NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  name              VARCHAR(100) NOT NULL,
  code              VARCHAR(20)  NOT NULL,
  parent_role_id    UUID         REFERENCES job_role(id) ON DELETE SET NULL,
  role_type         VARCHAR(20)  NOT NULL DEFAULT 'productive',
  productive_pct    SMALLINT     NOT NULL DEFAULT 100,
  follows_shifts    BOOLEAN      NOT NULL DEFAULT true,
  custom_start_time TIME,
  custom_end_time   TIME,
  custom_days       SMALLINT[],
  min_per_shift     SMALLINT,
  department_id     UUID         REFERENCES department(id) ON DELETE SET NULL,
  is_active         BOOLEAN      NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_job_role_org_site_code UNIQUE (organization_id, site_id, code),
  CONSTRAINT ck_productive_pct CHECK (productive_pct >= 0 AND productive_pct <= 100)
);

ALTER TABLE employee ADD COLUMN IF NOT EXISTS job_role_id UUID REFERENCES job_role(id) ON DELETE SET NULL;

ALTER TABLE job_role ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_role_select ON job_role FOR SELECT USING (organization_id = public.get_organization_id());
