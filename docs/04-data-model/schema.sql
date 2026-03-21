-- =============================================================================
-- AstraPlanner Database Schema
-- PostgreSQL DDL for Supabase
-- =============================================================================
-- This schema defines all tables, constraints, indexes, RLS policies, and
-- triggers for the AstraPlanner workforce planning platform.
--
-- Prerequisites:
--   - Supabase project with PostgreSQL 15+
--   - pgcrypto extension (for gen_random_uuid())
--   - Supabase Auth configured
--
-- Usage:
--   Paste this entire file into the Supabase SQL Editor and execute.
--   Tables are created in dependency order — no forward references.
--
-- Domain Modules:
--   1. Organizational (organization, site, department, process)
--   2. Demand (demand_type, demand_forecast, demand_type_process_mapping)
--   3. Workforce (employee, employee_skill, employee_availability_override, shift_pattern)
--   4. Planning (plan_version, scenario, workload_plan, shift_assignment, shift_assignment_staging)
--   5. System (audit_log, notification, integration_config, labor_rule)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- for full-text / fuzzy search
CREATE EXTENSION IF NOT EXISTS btree_gist;      -- for exclusion constraints (overlap prevention)

-- ---------------------------------------------------------------------------
-- Custom ENUM Types
-- ---------------------------------------------------------------------------
CREATE TYPE subscription_tier AS ENUM ('starter', 'professional', 'enterprise');
CREATE TYPE org_status AS ENUM ('active', 'suspended', 'cancelled', 'trial');
CREATE TYPE site_type AS ENUM (
    'warehouse', 'distribution_center', 'fulfillment_center',
    'cross_dock', 'store', 'manufacturing', 'office'
);
CREATE TYPE site_status AS ENUM ('active', 'inactive', 'onboarding', 'decommissioned');
CREATE TYPE dept_status AS ENUM ('active', 'inactive');
CREATE TYPE process_category AS ENUM ('inbound', 'outbound', 'value_added', 'support', 'returns');
CREATE TYPE hazard_level AS ENUM ('none', 'low', 'medium', 'high');
CREATE TYPE pps_source AS ENUM ('engineered', 'historical', 'ai_estimated', 'manual');
CREATE TYPE demand_source AS ENUM ('wms_import', 'oms_import', 'csv_upload', 'ai_forecast', 'manual_entry');
-- demand_granularity ENUM removed (Blocker 1+6: replaced by period_start/period_end TIMESTAMPTZ)
CREATE TYPE demand_category AS ENUM ('inbound', 'outbound', 'returns', 'internal');
CREATE TYPE contract_type AS ENUM ('full_time', 'part_time', 'temporary', 'seasonal', 'contractor');
CREATE TYPE employee_status AS ENUM ('active', 'on_leave', 'suspended', 'terminated');
CREATE TYPE skill_status AS ENUM ('active', 'expired', 'suspended', 'in_training');
CREATE TYPE shift_type AS ENUM ('regular', 'overtime', 'on_call', 'training', 'flex');
CREATE TYPE assignment_type AS ENUM ('scheduled', 'overtime', 'on_call', 'training', 'transfer');
CREATE TYPE assignment_source AS ENUM ('optimizer', 'manual', 'swap', 'ai_suggested');
CREATE TYPE assignment_status AS ENUM (
    'draft', 'published', 'confirmed', 'in_progress',
    'completed', 'cancelled', 'no_show'
);
CREATE TYPE labor_rule_type AS ENUM (
    'max_daily_hours', 'max_weekly_hours', 'min_rest_between_shifts',
    'max_consecutive_days', 'overtime_threshold_daily', 'overtime_threshold_weekly',
    'mandatory_break', 'min_age', 'certification_required', 'union_seniority'
);
CREATE TYPE rule_severity AS ENUM ('hard_constraint', 'soft_constraint', 'warning');
CREATE TYPE plan_generated_by AS ENUM ('ai_optimizer', 'manual', 'hybrid', 'import', 'clone');
-- approval_status ENUM removed (Blocker 8: replaced by plan_status)
CREATE TYPE plan_status AS ENUM (
    'draft', 'optimized', 'proposed', 'approved',
    'published', 'stale', 'superseded', 'rejected'
);
CREATE TYPE scenario_status AS ENUM ('draft', 'running', 'completed', 'approved', 'rejected', 'archived');
CREATE TYPE workload_status AS ENUM ('draft', 'computed', 'optimized', 'approved', 'locked');
CREATE TYPE actor_type AS ENUM ('user', 'system', 'api_integration', 'ai_optimizer');
CREATE TYPE notif_severity AS ENUM ('info', 'warning', 'critical', 'action_required');
CREATE TYPE integration_direction AS ENUM ('inbound', 'outbound', 'bidirectional');
CREATE TYPE sync_status AS ENUM ('success', 'partial_success', 'failed', 'never_run');

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- MODULE 1: ORGANIZATIONAL
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1.1 Organization
-- ---------------------------------------------------------------------------
CREATE TABLE organization (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255)        NOT NULL,
    slug            VARCHAR(100)        NOT NULL,
    subscription_tier subscription_tier NOT NULL DEFAULT 'starter',
    billing_email   VARCHAR(255)        NOT NULL,
    primary_contact_name  VARCHAR(255),
    primary_contact_phone VARCHAR(50),
    logo_url        TEXT,
    default_timezone  VARCHAR(50)       NOT NULL DEFAULT 'UTC',
    default_locale    VARCHAR(10)       NOT NULL DEFAULT 'en-US',
    default_currency  CHAR(3)           NOT NULL DEFAULT 'USD',
    settings_json   JSONB               NOT NULL DEFAULT '{}',
    feature_flags   JSONB               NOT NULL DEFAULT '{}',
    max_sites       INTEGER             NOT NULL DEFAULT 10,
    max_employees   INTEGER             NOT NULL DEFAULT 500,
    data_residency_region VARCHAR(20)   NOT NULL DEFAULT 'us-east',
    sso_provider    VARCHAR(50),
    sso_config_json JSONB,
    status          org_status          NOT NULL DEFAULT 'trial',
    trial_ends_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ         NOT NULL DEFAULT now(),

    CONSTRAINT uq_organization_slug UNIQUE (slug),
    CONSTRAINT ck_organization_max_sites CHECK (max_sites > 0),
    CONSTRAINT ck_organization_max_employees CHECK (max_employees > 0)
);

COMMENT ON TABLE organization IS 'Root tenant entity. Every data record in AstraPlanner belongs to exactly one Organization.';
COMMENT ON COLUMN organization.slug IS 'URL-safe unique identifier used in routes and API calls.';
COMMENT ON COLUMN organization.settings_json IS 'Org-wide config overrides: planning horizons, approval workflows, AI parameters.';
COMMENT ON COLUMN organization.sso_config_json IS 'SSO connection parameters — encrypted at rest by Supabase.';
COMMENT ON COLUMN organization.data_residency_region IS 'Region constraint for data storage to satisfy GDPR/data-residency requirements.';

CREATE TRIGGER trg_organization_updated_at
    BEFORE UPDATE ON organization
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- 1.2 Site
-- ---------------------------------------------------------------------------
CREATE TABLE site (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID                NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    name            VARCHAR(255)        NOT NULL,
    code            VARCHAR(20)         NOT NULL,
    site_type       site_type           NOT NULL,
    address_line1   VARCHAR(255)        NOT NULL,
    address_line2   VARCHAR(255),
    city            VARCHAR(100)        NOT NULL,
    state_province  VARCHAR(100),
    postal_code     VARCHAR(20)         NOT NULL,
    country_code    CHAR(2)             NOT NULL,
    latitude        DECIMAL(10,7),
    longitude       DECIMAL(10,7),
    timezone        VARCHAR(50)         NOT NULL,
    operating_hours_json JSONB          NOT NULL,
    capacity_sqft   INTEGER,
    max_headcount   INTEGER,
    labor_market_zone VARCHAR(50),
    cost_center_code  VARCHAR(50),
    settings_json   JSONB               NOT NULL DEFAULT '{}',
    status          site_status         NOT NULL DEFAULT 'onboarding',
    go_live_date    DATE,
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ         NOT NULL DEFAULT now(),

    CONSTRAINT uq_site_org_code UNIQUE (organization_id, code),
    CONSTRAINT ck_site_max_headcount CHECK (max_headcount > 0 OR max_headcount IS NULL)
);

COMMENT ON TABLE site IS 'Physical or virtual operational location — warehouse, DC, fulfillment hub, store.';
COMMENT ON COLUMN site.organization_id IS 'Tenant partition key. All queries filter on this via RLS.';
COMMENT ON COLUMN site.operating_hours_json IS 'Weekly operating schedule keyed by day name.';

CREATE TRIGGER trg_site_updated_at
    BEFORE UPDATE ON site
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- 1.3 Department
-- ---------------------------------------------------------------------------
CREATE TABLE department (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    site_id             UUID            NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    name                VARCHAR(100)    NOT NULL,
    code                VARCHAR(20)     NOT NULL,
    budget_center       VARCHAR(50),
    manager_employee_id UUID,           -- FK added after employee table exists
    parent_department_id UUID           REFERENCES department(id) ON DELETE SET NULL,
    headcount_target    INTEGER,
    description         TEXT,
    status              dept_status     NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_department_org_site_code UNIQUE (organization_id, site_id, code)
);

COMMENT ON TABLE department IS 'Organizational subdivision within a Site (e.g., Receiving, Picking, Packing).';

CREATE TRIGGER trg_department_updated_at
    BEFORE UPDATE ON department
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- 1.4 Process
-- ---------------------------------------------------------------------------
CREATE TABLE process (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    department_id           UUID            REFERENCES department(id) ON DELETE SET NULL,
    name                    VARCHAR(100)    NOT NULL,
    code                    VARCHAR(30)     NOT NULL,
    category                process_category NOT NULL,
    applicable_site_types   TEXT[]          NOT NULL,
    unit_of_measure         VARCHAR(30)     NOT NULL,
    requires_certification  BOOLEAN         NOT NULL DEFAULT false,
    min_skill_level         SMALLINT        NOT NULL DEFAULT 1,
    hazard_level            hazard_level    NOT NULL DEFAULT 'none',
    equipment_required      TEXT[],
    description             TEXT,
    display_order           SMALLINT        NOT NULL DEFAULT 0,
    is_active               BOOLEAN         NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_process_org_code UNIQUE (organization_id, code),
    CONSTRAINT ck_process_min_skill CHECK (min_skill_level BETWEEN 1 AND 5)
);

COMMENT ON TABLE process IS 'Discrete operational activity — the atomic unit of work in the demand-to-workforce chain.';
COMMENT ON COLUMN process.applicable_site_types IS 'Array of site_type values where this process is relevant.';

CREATE TRIGGER trg_process_updated_at
    BEFORE UPDATE ON process
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- 1.5 ProcessProductivityStandard
-- ---------------------------------------------------------------------------
CREATE TABLE process_productivity_standard (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    process_id      UUID            NOT NULL REFERENCES process(id) ON DELETE CASCADE,
    site_id         UUID            REFERENCES site(id) ON DELETE CASCADE,
    skill_level     SMALLINT        NOT NULL,
    units_per_hour  DECIMAL(10,2)   NOT NULL,
    unit_of_measure VARCHAR(30)     NOT NULL,
    effective_date  DATE            NOT NULL,
    expiry_date     DATE,
    source          pps_source      NOT NULL DEFAULT 'manual',
    confidence_score DECIMAL(3,2),
    sample_size     INTEGER,
    notes           TEXT,
    created_by      UUID            NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_pps_combo UNIQUE (organization_id, process_id, site_id, skill_level, effective_date),
    CONSTRAINT ck_pps_skill_level CHECK (skill_level BETWEEN 1 AND 5),
    CONSTRAINT ck_pps_uph CHECK (units_per_hour > 0),
    CONSTRAINT ck_pps_expiry CHECK (expiry_date IS NULL OR expiry_date > effective_date),
    CONSTRAINT ck_pps_confidence CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

COMMENT ON TABLE process_productivity_standard IS 'Expected throughput rate per process/skill level/site. Key input to workload calculation.';
COMMENT ON COLUMN process_productivity_standard.units_per_hour IS 'Expected UPH — the conversion factor: hours_needed = demand_volume / units_per_hour.';

CREATE TRIGGER trg_pps_updated_at
    BEFORE UPDATE ON process_productivity_standard
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- MODULE 2: DEMAND
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2.1 DemandType
-- ---------------------------------------------------------------------------
CREATE TABLE demand_type (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    name                    VARCHAR(100)    NOT NULL,
    code                    VARCHAR(30)     NOT NULL,
    unit_of_measure         VARCHAR(30)     NOT NULL,
    category                demand_category NOT NULL,
    conversion_factors_json JSONB,
    description             TEXT,
    is_active               BOOLEAN         NOT NULL DEFAULT true,
    display_order           SMALLINT        NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_demand_type_org_code UNIQUE (organization_id, code)
);

COMMENT ON TABLE demand_type IS 'Organization-configurable classification of demand (e.g., Outbound Orders, Inbound Pallets).';

CREATE TRIGGER trg_demand_type_updated_at
    BEFORE UPDATE ON demand_type
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2.2 demand_type_process_mapping (join table)
-- ---------------------------------------------------------------------------
CREATE TABLE demand_type_process_mapping (
    demand_type_id  UUID            NOT NULL REFERENCES demand_type(id) ON DELETE CASCADE,
    process_id      UUID            NOT NULL REFERENCES process(id) ON DELETE CASCADE,
    organization_id UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    conversion_ratio DECIMAL(8,4)   NOT NULL,
    is_primary      BOOLEAN         NOT NULL DEFAULT false,

    CONSTRAINT pk_demand_type_process PRIMARY KEY (demand_type_id, process_id),
    CONSTRAINT ck_dtpm_ratio CHECK (conversion_ratio > 0)
);

COMMENT ON TABLE demand_type_process_mapping IS 'Maps demand types to processes with a conversion ratio for workload calculation.';
COMMENT ON COLUMN demand_type_process_mapping.conversion_ratio IS 'Units of process work per unit of demand (e.g., 1 order = 1.0 picks).';

-- ---------------------------------------------------------------------------
-- 2.3 DemandForecast
-- (plan_version_id FK added after plan_version table is created)
-- Blocker 1+6: forecast_date replaced by period_start/period_end TIMESTAMPTZ;
--              granularity column removed.
-- ---------------------------------------------------------------------------
CREATE TABLE demand_forecast (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID                NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    site_id             UUID                NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    demand_type_id      UUID                NOT NULL REFERENCES demand_type(id) ON DELETE RESTRICT,
    period_start        TIMESTAMPTZ         NOT NULL,
    period_end          TIMESTAMPTZ         NOT NULL,
    volume              DECIMAL(12,2)       NOT NULL,
    volume_lower_bound  DECIMAL(12,2),
    volume_upper_bound  DECIMAL(12,2),
    confidence_interval DECIMAL(3,2),
    source              demand_source       NOT NULL,
    source_reference    VARCHAR(255),
    is_actual           BOOLEAN             NOT NULL DEFAULT false,
    plan_version_id     UUID,               -- FK added below after plan_version is created
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),

    CONSTRAINT ck_df_volume CHECK (volume >= 0),
    CONSTRAINT ck_df_lower_bound CHECK (volume_lower_bound IS NULL OR volume_lower_bound <= volume),
    CONSTRAINT ck_df_upper_bound CHECK (volume_upper_bound IS NULL OR volume_upper_bound >= volume),
    CONSTRAINT ck_df_period CHECK (period_end > period_start)
);

COMMENT ON TABLE demand_forecast IS 'Time-series forecasted or actual demand volume per site/type/period. Top of the planning chain.';
COMMENT ON COLUMN demand_forecast.plan_version_id IS 'NULL for baseline forecasts; set for scenario-specific overrides.';
COMMENT ON COLUMN demand_forecast.period_start IS 'Start of the forecast period (inclusive). Replaces the former forecast_date + granularity model.';
COMMENT ON COLUMN demand_forecast.period_end IS 'End of the forecast period (exclusive). Duration encodes granularity implicitly.';

CREATE TRIGGER trg_demand_forecast_updated_at
    BEFORE UPDATE ON demand_forecast
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- MODULE 3: WORKFORCE
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3.1 Employee
-- ---------------------------------------------------------------------------
CREATE TABLE employee (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    employee_number         VARCHAR(30)     NOT NULL,
    first_name              VARCHAR(100)    NOT NULL,
    last_name               VARCHAR(100)    NOT NULL,
    email                   VARCHAR(255),
    phone                   VARCHAR(50),
    home_site_id            UUID            NOT NULL REFERENCES site(id) ON DELETE RESTRICT,
    department_id           UUID            REFERENCES department(id) ON DELETE SET NULL,
    contract_type           contract_type   NOT NULL,
    hire_date               DATE            NOT NULL,
    termination_date        DATE,
    status                  employee_status NOT NULL DEFAULT 'active',
    weekly_hours_contracted DECIMAL(4,1)    NOT NULL,
    hourly_rate             DECIMAL(8,2),
    pay_grade               VARCHAR(20),
    seniority_date          DATE,
    is_multi_site_eligible  BOOLEAN         NOT NULL DEFAULT false,
    preferences_json        JSONB           NOT NULL DEFAULT '{}',
    metadata_json           JSONB           NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_employee_org_number UNIQUE (organization_id, employee_number),
    CONSTRAINT ck_employee_weekly_hours CHECK (weekly_hours_contracted > 0 AND weekly_hours_contracted <= 168),
    CONSTRAINT ck_employee_hourly_rate CHECK (hourly_rate > 0 OR hourly_rate IS NULL)
);

COMMENT ON TABLE employee IS 'Worker record — the workforce supply side of the planning equation.';
COMMENT ON COLUMN employee.hourly_rate IS 'Base hourly pay rate. Sensitive PII — access controlled via RLS.';
COMMENT ON COLUMN employee.preferences_json IS 'Shift preferences, days-off preferences, max overtime tolerance.';
COMMENT ON COLUMN employee.is_multi_site_eligible IS 'Whether this employee can be assigned to sites other than home_site_id.';

CREATE TRIGGER trg_employee_updated_at
    BEFORE UPDATE ON employee
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Now add the deferred FK from department.manager_employee_id
ALTER TABLE department
    ADD CONSTRAINT fk_department_manager
    FOREIGN KEY (manager_employee_id) REFERENCES employee(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3.2 EmployeeSkill
-- ---------------------------------------------------------------------------
CREATE TABLE employee_skill (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    employee_id             UUID            NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
    process_id              UUID            NOT NULL REFERENCES process(id) ON DELETE CASCADE,
    proficiency_level       SMALLINT        NOT NULL,
    certification_date      DATE,
    expiry_date             DATE,
    is_primary_skill        BOOLEAN         NOT NULL DEFAULT false,
    training_hours_completed DECIMAL(6,1),
    assessed_by             UUID            REFERENCES employee(id) ON DELETE SET NULL,
    assessment_notes        TEXT,
    status                  skill_status    NOT NULL DEFAULT 'active',
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_employee_skill UNIQUE (organization_id, employee_id, process_id),
    CONSTRAINT ck_es_proficiency CHECK (proficiency_level BETWEEN 1 AND 5),
    CONSTRAINT ck_es_expiry CHECK (expiry_date IS NULL OR certification_date IS NULL OR expiry_date > certification_date)
);

COMMENT ON TABLE employee_skill IS 'Maps employee to process with proficiency level (1-5). Bridge between supply and demand.';
COMMENT ON COLUMN employee_skill.proficiency_level IS
    '1 = Novice (0.6x multiplier — requires supervision, ~60%% of standard UPH). '
    '2 = Basic (0.8x multiplier — can work independently on simple tasks). '
    '3 = Competent (1.0x multiplier — meets the engineered standard). '
    '4 = Proficient (1.15x multiplier — consistently exceeds standard). '
    '5 = Expert (1.3x multiplier — top performer, can train others). '
    'Multiplier is applied to process_productivity_standard.units_per_hour when computing weighted UPH.';

CREATE TRIGGER trg_employee_skill_updated_at
    BEFORE UPDATE ON employee_skill
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3.3 EmployeeAvailabilityOverride (Blocker 2: absence entity)
-- ---------------------------------------------------------------------------
CREATE TABLE employee_availability_override (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    employee_id     UUID            NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
    start_date      DATE            NOT NULL,
    end_date        DATE            NOT NULL,
    start_time      TIME,           -- NULL = full day
    end_time        TIME,           -- NULL = full day
    override_type   VARCHAR(30)     NOT NULL,
    status          VARCHAR(20)     NOT NULL DEFAULT 'planned',
    reason          TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT ck_eao_dates CHECK (end_date >= start_date),
    CONSTRAINT ck_eao_override_type CHECK (override_type IN (
        'leave', 'absence', 'training', 'unavailable', 'extra_availability'
    )),
    CONSTRAINT ck_eao_status CHECK (status IN ('planned', 'confirmed', 'cancelled'))
);

COMMENT ON TABLE employee_availability_override IS 'Leave, absence, training, and extra-availability overrides for workforce planning.';
COMMENT ON COLUMN employee_availability_override.start_time IS 'NULL indicates a full-day override; set for partial-day overrides.';

CREATE INDEX idx_eao_employee_dates
    ON employee_availability_override (employee_id, start_date, end_date);

CREATE TRIGGER trg_eao_updated_at
    BEFORE UPDATE ON employee_availability_override
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3.4 ShiftPattern
-- ---------------------------------------------------------------------------
CREATE TABLE shift_pattern (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    name            VARCHAR(100)    NOT NULL,
    code            VARCHAR(20)     NOT NULL,
    start_time      TIME            NOT NULL,
    end_time        TIME            NOT NULL,
    duration_hours  DECIMAL(4,2)    NOT NULL,
    paid_hours      DECIMAL(4,2)    NOT NULL,
    break_rules_json JSONB          NOT NULL,
    days_of_week    SMALLINT[]      NOT NULL,
    is_overnight    BOOLEAN         NOT NULL DEFAULT false,
    shift_type      shift_type      NOT NULL DEFAULT 'regular',
    color_hex       CHAR(7),
    min_staffing    INTEGER,
    is_active       BOOLEAN         NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_shift_pattern_org_code UNIQUE (organization_id, code),
    CONSTRAINT ck_sp_duration CHECK (duration_hours > 0 AND duration_hours <= 24),
    CONSTRAINT ck_sp_paid CHECK (paid_hours > 0 AND paid_hours <= duration_hours)
);

COMMENT ON TABLE shift_pattern IS 'Reusable shift template defining start/end times, breaks, and applicable days.';

CREATE TRIGGER trg_shift_pattern_updated_at
    BEFORE UPDATE ON shift_pattern
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- MODULE 4: PLANNING
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4.1 Scenario
-- (parent_plan_version_id FK added after plan_version is created)
-- ---------------------------------------------------------------------------
CREATE TABLE scenario (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    name                    VARCHAR(255)    NOT NULL,
    description             TEXT,
    parent_plan_version_id  UUID,           -- FK added below
    assumptions_json        JSONB           NOT NULL DEFAULT '{}',
    status                  scenario_status NOT NULL DEFAULT 'draft',
    created_by              UUID            NOT NULL,
    comparison_metrics_json JSONB,
    tags                    TEXT[],
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON TABLE scenario IS 'What-if container for exploring alternative plans without modifying the baseline.';
COMMENT ON COLUMN scenario.assumptions_json IS 'Structured assumptions: demand adjustments, staffing changes, process modifications.';

CREATE TRIGGER trg_scenario_updated_at
    BEFORE UPDATE ON scenario
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4.2 PlanVersion
-- Blocker 8: approval_status replaced by plan_status enum
-- ---------------------------------------------------------------------------
CREATE TABLE plan_version (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    site_id             UUID            REFERENCES site(id) ON DELETE SET NULL,
    version_number      INTEGER         NOT NULL,
    name                VARCHAR(255)    NOT NULL,
    plan_period_start   DATE            NOT NULL,
    plan_period_end     DATE            NOT NULL,
    scenario_id         UUID            REFERENCES scenario(id) ON DELETE SET NULL,
    generated_by        plan_generated_by NOT NULL,
    optimizer_config_json JSONB,
    status              plan_status     NOT NULL DEFAULT 'draft',
    approved_by         UUID,
    approved_at         TIMESTAMPTZ,
    is_published        BOOLEAN         NOT NULL DEFAULT false,
    is_locked           BOOLEAN         NOT NULL DEFAULT false,
    summary_metrics_json JSONB,
    notes               TEXT,
    parent_version_id   UUID            REFERENCES plan_version(id) ON DELETE SET NULL,
    created_by          UUID            NOT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_plan_version_org_site_num UNIQUE (organization_id, site_id, version_number),
    CONSTRAINT ck_pv_period CHECK (plan_period_end >= plan_period_start)
);

COMMENT ON TABLE plan_version IS 'Versioned, immutable snapshot of a workforce plan. Container for workload plans and shift assignments.';
COMMENT ON COLUMN plan_version.is_locked IS 'When true, child records (workload plans, shift assignments) are immutable.';
COMMENT ON COLUMN plan_version.summary_metrics_json IS 'Aggregate KPIs: total hours, coverage %, overtime %, labor cost.';

CREATE TRIGGER trg_plan_version_updated_at
    BEFORE UPDATE ON plan_version
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Plan transition validation trigger (Blocker 8)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validate_plan_transition()
RETURNS TRIGGER AS $$
DECLARE
    valid BOOLEAN;
BEGIN
    -- Allow no-op transitions (status unchanged)
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Define the valid state machine transitions
    valid := CASE OLD.status
        WHEN 'draft'       THEN NEW.status IN ('optimized', 'proposed', 'stale', 'superseded')
        WHEN 'optimized'   THEN NEW.status IN ('proposed', 'draft', 'stale', 'superseded')
        WHEN 'proposed'    THEN NEW.status IN ('approved', 'rejected', 'stale', 'superseded')
        WHEN 'approved'    THEN NEW.status IN ('published', 'stale', 'superseded')
        WHEN 'published'   THEN NEW.status IN ('stale', 'superseded')
        WHEN 'rejected'    THEN NEW.status IN ('draft', 'superseded')
        WHEN 'stale'       THEN NEW.status IN ('draft', 'superseded')
        WHEN 'superseded'  THEN FALSE   -- terminal state
        ELSE FALSE
    END;

    IF NOT valid THEN
        RAISE EXCEPTION 'Invalid plan_version status transition: % -> %', OLD.status, NEW.status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_plan_version_validate_transition
    BEFORE UPDATE OF status ON plan_version
    FOR EACH ROW EXECUTE FUNCTION fn_validate_plan_transition();

-- Now add deferred FKs
ALTER TABLE scenario
    ADD CONSTRAINT fk_scenario_parent_plan_version
    FOREIGN KEY (parent_plan_version_id) REFERENCES plan_version(id) ON DELETE RESTRICT;

ALTER TABLE demand_forecast
    ADD CONSTRAINT fk_demand_forecast_plan_version
    FOREIGN KEY (plan_version_id) REFERENCES plan_version(id) ON DELETE CASCADE;

-- Add the unique constraint on demand_forecast now that plan_version_id FK is defined
-- Blocker 1+6: updated to use period_start/period_end instead of forecast_date
CREATE UNIQUE INDEX uq_demand_forecast_combo
    ON demand_forecast (
        organization_id, site_id, demand_type_id,
        period_start, period_end,
        COALESCE(plan_version_id, '00000000-0000-0000-0000-000000000000')
    );

-- ---------------------------------------------------------------------------
-- 4.3 WorkloadPlan
-- Blocker 1+6: plan_date replaced by period_start/period_end TIMESTAMPTZ
-- ---------------------------------------------------------------------------
CREATE TABLE workload_plan (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    site_id             UUID            NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    process_id          UUID            NOT NULL REFERENCES process(id) ON DELETE RESTRICT,
    period_start        TIMESTAMPTZ     NOT NULL,
    period_end          TIMESTAMPTZ     NOT NULL,
    plan_version_id     UUID            NOT NULL REFERENCES plan_version(id) ON DELETE CASCADE,
    demand_forecast_id  UUID            REFERENCES demand_forecast(id) ON DELETE SET NULL,
    demand_volume       DECIMAL(12,2)   NOT NULL,
    conversion_ratio    DECIMAL(8,4)    NOT NULL,
    process_volume      DECIMAL(12,2)   NOT NULL,
    weighted_uph        DECIMAL(10,2)   NOT NULL,
    hours_needed        DECIMAL(8,2)    NOT NULL,
    fte_needed          DECIMAL(6,2)    NOT NULL,
    hours_assigned      DECIMAL(8,2)    NOT NULL DEFAULT 0,
    fte_assigned        DECIMAL(6,2)    NOT NULL DEFAULT 0,
    coverage_pct        DECIMAL(5,2)    NOT NULL DEFAULT 0,
    status              workload_status NOT NULL DEFAULT 'draft',
    computed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_workload_plan_combo UNIQUE (organization_id, site_id, process_id, period_start, period_end, plan_version_id),
    CONSTRAINT ck_wp_hours_needed CHECK (hours_needed >= 0),
    CONSTRAINT ck_wp_coverage CHECK (coverage_pct >= 0),
    CONSTRAINT ck_wp_period CHECK (period_end > period_start)
);

COMMENT ON TABLE workload_plan IS 'Computed labor hours needed per process/site/period. Output of demand-to-workload calculation.';
COMMENT ON COLUMN workload_plan.weighted_uph IS 'Weighted average UPH based on available skill mix for this process.';
COMMENT ON COLUMN workload_plan.coverage_pct IS 'hours_assigned / hours_needed * 100. Below 95% triggers alerts.';

CREATE TRIGGER trg_workload_plan_updated_at
    BEFORE UPDATE ON workload_plan
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4.4 ShiftAssignment
-- Blocker 7: exclusion constraint to prevent overlapping assignments
-- ---------------------------------------------------------------------------
CREATE TABLE shift_assignment (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID                NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    employee_id             UUID                NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
    shift_pattern_id        UUID                NOT NULL REFERENCES shift_pattern(id) ON DELETE RESTRICT,
    site_id                 UUID                NOT NULL REFERENCES site(id) ON DELETE RESTRICT,
    process_id              UUID                NOT NULL REFERENCES process(id) ON DELETE RESTRICT,
    department_id           UUID                REFERENCES department(id) ON DELETE SET NULL,
    assignment_date         DATE                NOT NULL,
    plan_version_id         UUID                NOT NULL REFERENCES plan_version(id) ON DELETE CASCADE,
    start_time              TIMESTAMPTZ         NOT NULL,
    end_time                TIMESTAMPTZ         NOT NULL,
    scheduled_hours         DECIMAL(4,2)        NOT NULL,
    actual_hours            DECIMAL(4,2),
    overtime_hours          DECIMAL(4,2)        NOT NULL DEFAULT 0,
    assignment_type         assignment_type     NOT NULL DEFAULT 'scheduled',
    assignment_source       assignment_source   NOT NULL DEFAULT 'optimizer',
    status                  assignment_status   NOT NULL DEFAULT 'draft',
    employee_acknowledged   BOOLEAN             NOT NULL DEFAULT false,
    override_reason         TEXT,
    cost_estimate           DECIMAL(8,2),
    created_at              TIMESTAMPTZ         NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ         NOT NULL DEFAULT now(),

    CONSTRAINT uq_shift_assignment_no_double_book
        UNIQUE (organization_id, employee_id, assignment_date, plan_version_id, start_time),
    CONSTRAINT ck_sa_scheduled_hours CHECK (scheduled_hours > 0),
    -- Blocker 7: prevent overlapping shifts for the same employee within a plan version
    CONSTRAINT excl_sa_no_overlap
        EXCLUDE USING gist (
            employee_id WITH =,
            plan_version_id WITH =,
            tstzrange(start_time, end_time) WITH &&
        )
);

COMMENT ON TABLE shift_assignment IS 'Core optimization output. Assigns employee to shift/site/process on a date.';
COMMENT ON COLUMN shift_assignment.assignment_source IS 'How this assignment was created: optimizer, manual, swap, or AI-suggested.';
COMMENT ON COLUMN shift_assignment.cost_estimate IS 'Estimated labor cost including base pay and overtime premiums.';

CREATE TRIGGER trg_shift_assignment_updated_at
    BEFORE UPDATE ON shift_assignment
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4.5 ShiftAssignmentStaging (MD-09: staging table for optimizer output)
-- Identical schema to shift_assignment but WITHOUT exclusion constraint.
-- Staging allows temporary overlaps during solver writes; conflicts are
-- resolved before promoting rows to the main shift_assignment table.
-- ---------------------------------------------------------------------------
CREATE TABLE shift_assignment_staging (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID                NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    employee_id             UUID                NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
    shift_pattern_id        UUID                NOT NULL REFERENCES shift_pattern(id) ON DELETE RESTRICT,
    site_id                 UUID                NOT NULL REFERENCES site(id) ON DELETE RESTRICT,
    process_id              UUID                NOT NULL REFERENCES process(id) ON DELETE RESTRICT,
    department_id           UUID                REFERENCES department(id) ON DELETE SET NULL,
    assignment_date         DATE                NOT NULL,
    plan_version_id         UUID                NOT NULL REFERENCES plan_version(id) ON DELETE CASCADE,
    start_time              TIMESTAMPTZ         NOT NULL,
    end_time                TIMESTAMPTZ         NOT NULL,
    scheduled_hours         DECIMAL(4,2)        NOT NULL,
    actual_hours            DECIMAL(4,2),
    overtime_hours          DECIMAL(4,2)        NOT NULL DEFAULT 0,
    assignment_type         assignment_type     NOT NULL DEFAULT 'scheduled',
    assignment_source       assignment_source   NOT NULL DEFAULT 'optimizer',
    status                  assignment_status   NOT NULL DEFAULT 'draft',
    employee_acknowledged   BOOLEAN             NOT NULL DEFAULT false,
    override_reason         TEXT,
    cost_estimate           DECIMAL(8,2),
    created_at              TIMESTAMPTZ         NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ         NOT NULL DEFAULT now(),

    -- No exclusion constraint — staging allows temporary overlaps during solver writes
    CONSTRAINT ck_sas_scheduled_hours CHECK (scheduled_hours > 0)
);

COMMENT ON TABLE shift_assignment_staging IS 'Staging area for optimizer output. No overlap exclusion — conflicts resolved before promotion to shift_assignment.';

CREATE TRIGGER trg_shift_assignment_staging_updated_at
    BEFORE UPDATE ON shift_assignment_staging
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- MODULE 5: SYSTEM
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 5.1 LaborRule
-- ---------------------------------------------------------------------------
CREATE TABLE labor_rule (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    name                        VARCHAR(255)    NOT NULL,
    code                        VARCHAR(50)     NOT NULL,
    rule_type                   labor_rule_type NOT NULL,
    jurisdiction_country        CHAR(2),
    jurisdiction_state          VARCHAR(50),
    jurisdiction_site_id        UUID            REFERENCES site(id) ON DELETE CASCADE,
    parameters_json             JSONB           NOT NULL,
    applies_to_contract_types   TEXT[]          NOT NULL DEFAULT '{full_time,part_time,temporary,seasonal,contractor}',
    severity                    rule_severity   NOT NULL DEFAULT 'hard_constraint',
    penalty_score               DECIMAL(6,2),
    effective_date              DATE            NOT NULL,
    expiry_date                 DATE,
    source                      VARCHAR(100),
    is_active                   BOOLEAN         NOT NULL DEFAULT true,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_labor_rule_org_code UNIQUE (organization_id, code),
    CONSTRAINT ck_lr_penalty CHECK (penalty_score >= 0 OR penalty_score IS NULL)
);

COMMENT ON TABLE labor_rule IS 'Labor regulations, union rules, and company policies that constrain the optimization engine.';
COMMENT ON COLUMN labor_rule.severity IS 'hard_constraint = must not violate; soft_constraint = penalized in cost function; warning = informational.';
COMMENT ON COLUMN labor_rule.parameters_json IS 'Rule-specific parameters (threshold hours, multipliers, rest periods, etc.).';

CREATE TRIGGER trg_labor_rule_updated_at
    BEFORE UPDATE ON labor_rule
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- 5.2 AuditLog
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    actor_id        UUID,
    actor_type      actor_type      NOT NULL,
    actor_ip_address INET,
    action          VARCHAR(50)     NOT NULL,
    entity_type     VARCHAR(50)     NOT NULL,
    entity_id       UUID            NOT NULL,
    before_state    JSONB,
    after_state     JSONB,
    changes_json    JSONB,
    metadata_json   JSONB,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
    -- No updated_at — audit logs are immutable
);

COMMENT ON TABLE audit_log IS 'Immutable, append-only record of every significant state change. Never updated or deleted.';
COMMENT ON COLUMN audit_log.entity_type IS 'Polymorphic reference: table name of the affected record.';
COMMENT ON COLUMN audit_log.entity_id IS 'Polymorphic reference: primary key of the affected record (no FK constraint).';

-- Prevent updates and deletes on audit_log
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log records are immutable. UPDATE and DELETE operations are prohibited.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- ---------------------------------------------------------------------------
-- 5.3 Notification
-- ---------------------------------------------------------------------------
CREATE TABLE notification (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    target_user_id  UUID            NOT NULL,
    type            VARCHAR(50)     NOT NULL,
    severity        notif_severity  NOT NULL DEFAULT 'info',
    title           VARCHAR(255)    NOT NULL,
    body            TEXT            NOT NULL,
    payload_json    JSONB,
    channels        TEXT[]          NOT NULL DEFAULT '{in_app}',
    read_status     BOOLEAN         NOT NULL DEFAULT false,
    read_at         TIMESTAMPTZ,
    dismissed_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON TABLE notification IS 'User-targeted notification records with multi-channel delivery and read tracking.';
COMMENT ON COLUMN notification.payload_json IS 'Structured data for deep-linking: entity_type, entity_id, action_url.';

-- ---------------------------------------------------------------------------
-- 5.4 IntegrationConfig
-- ---------------------------------------------------------------------------
CREATE TABLE integration_config (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             UUID            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    name                        VARCHAR(255)    NOT NULL,
    source_system               VARCHAR(50)     NOT NULL,
    integration_type            integration_direction NOT NULL,
    connection_params_encrypted BYTEA           NOT NULL,
    sync_schedule_cron          VARCHAR(100)    NOT NULL,
    field_mapping_json          JSONB           NOT NULL,
    transform_rules_json        JSONB,
    site_scope                  UUID[],
    entity_scope                TEXT[]          NOT NULL,
    last_sync_at                TIMESTAMPTZ,
    last_sync_status            sync_status     NOT NULL DEFAULT 'never_run',
    last_sync_records_processed INTEGER,
    last_sync_error_message     TEXT,
    retry_count                 SMALLINT        NOT NULL DEFAULT 0,
    max_retries                 SMALLINT        NOT NULL DEFAULT 3,
    is_active                   BOOLEAN         NOT NULL DEFAULT true,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_integration_org_name UNIQUE (organization_id, name)
);

COMMENT ON TABLE integration_config IS 'Configuration for external system integrations (WMS, OMS, HRIS, payroll).';
COMMENT ON COLUMN integration_config.connection_params_encrypted IS 'AES-256-GCM encrypted connection credentials. Per-tenant encryption keys.';

CREATE TRIGGER trg_integration_config_updated_at
    BEFORE UPDATE ON integration_config
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- GENERIC AUDIT TRIGGER FUNCTION (MD-10)
-- =============================================================================
-- Automatically writes to audit_log on INSERT, UPDATE, DELETE for tracked tables.

CREATE OR REPLACE FUNCTION fn_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
    v_action VARCHAR(50);
    v_org_id UUID;
    v_entity_id UUID;
BEGIN
    v_action := TG_OP;

    IF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD);
        v_new := NULL;
        v_org_id := OLD.organization_id;
        v_entity_id := OLD.id;
    ELSIF TG_OP = 'INSERT' THEN
        v_old := NULL;
        v_new := to_jsonb(NEW);
        v_org_id := NEW.organization_id;
        v_entity_id := NEW.id;
    ELSE -- UPDATE
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
        v_org_id := NEW.organization_id;
        v_entity_id := NEW.id;
    END IF;

    INSERT INTO audit_log (
        organization_id, actor_id, actor_type, action,
        entity_type, entity_id, before_state, after_state
    ) VALUES (
        v_org_id,
        NULLIF(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::UUID,
        'user',
        v_action,
        TG_TABLE_NAME,
        v_entity_id,
        v_old,
        v_new
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_audit_trigger() IS 'Generic audit trigger: captures before/after state for INSERT/UPDATE/DELETE and writes to audit_log.';

-- Apply audit trigger to tracked tables
CREATE TRIGGER trg_audit_employee
    AFTER INSERT OR UPDATE OR DELETE ON employee
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_employee_skill
    AFTER INSERT OR UPDATE OR DELETE ON employee_skill
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_plan_version
    AFTER INSERT OR UPDATE OR DELETE ON plan_version
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_shift_assignment
    AFTER INSERT OR UPDATE OR DELETE ON shift_assignment
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_labor_rule
    AFTER INSERT OR UPDATE OR DELETE ON labor_rule
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_employee_availability_override
    AFTER INSERT OR UPDATE OR DELETE ON employee_availability_override
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();


-- =============================================================================
-- INDEXES
-- =============================================================================
-- Indexes are designed around the key query patterns documented in
-- scalability-design.md. Partial indexes are used where applicable to
-- reduce index size and improve scan performance.

-- Pattern 1: Get all active employees for a site
CREATE INDEX idx_employee_org_site_status
    ON employee (organization_id, home_site_id, status)
    WHERE status = 'active';

-- Pattern 2: Get demand forecast for a site and period range
CREATE INDEX idx_demand_forecast_org_site_period
    ON demand_forecast (organization_id, site_id, period_start, period_end);

-- Pattern 3: Get shift assignments for a site for a week
CREATE INDEX idx_shift_assignment_org_site_date_version
    ON shift_assignment (organization_id, site_id, assignment_date, plan_version_id);

-- Pattern 4: Get employee schedule for a date range
CREATE INDEX idx_shift_assignment_org_employee_date
    ON shift_assignment (organization_id, employee_id, assignment_date);

-- Pattern 5: Get workload coverage gaps
CREATE INDEX idx_workload_plan_org_site_version_coverage
    ON workload_plan (organization_id, site_id, plan_version_id, coverage_pct);

-- Pattern 6: Audit log lookup by entity
CREATE INDEX idx_audit_log_org_entity
    ON audit_log (organization_id, entity_type, entity_id, created_at DESC);

-- Pattern 7: Unread notifications for user (partial index)
CREATE INDEX idx_notification_org_user_unread
    ON notification (organization_id, target_user_id, created_at DESC)
    WHERE read_status = false;

-- Additional audit log indexes
CREATE INDEX idx_audit_log_org_created
    ON audit_log (organization_id, created_at DESC);

CREATE INDEX idx_audit_log_org_actor
    ON audit_log (organization_id, actor_id, created_at DESC)
    WHERE actor_id IS NOT NULL;

-- Employee search: full-text on name
CREATE INDEX idx_employee_name_trgm
    ON employee USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- Plan version lookup by org and site
CREATE INDEX idx_plan_version_org_site
    ON plan_version (organization_id, site_id, plan_period_start DESC);

-- Scenario lookup by org
CREATE INDEX idx_scenario_org_status
    ON scenario (organization_id, status);

-- Labor rule jurisdiction resolution
CREATE INDEX idx_labor_rule_jurisdiction
    ON labor_rule (organization_id, jurisdiction_country, jurisdiction_state, jurisdiction_site_id)
    WHERE is_active = true;

-- Workload plan by period for planning views
CREATE INDEX idx_workload_plan_org_site_period
    ON workload_plan (organization_id, site_id, period_start);

-- Employee skill lookup for optimizer
CREATE INDEX idx_employee_skill_org_process
    ON employee_skill (organization_id, process_id, proficiency_level)
    WHERE status = 'active';

-- Process productivity standard resolution
CREATE INDEX idx_pps_process_site_skill
    ON process_productivity_standard (organization_id, process_id, site_id, skill_level)
    WHERE expiry_date IS NULL;

-- Department hierarchy
CREATE INDEX idx_department_org_site
    ON department (organization_id, site_id);

-- Integration config active check
CREATE INDEX idx_integration_config_org_active
    ON integration_config (organization_id)
    WHERE is_active = true;


-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
-- Every table with organization_id gets RLS enabled. Policies enforce that
-- authenticated users can only access rows belonging to their organization.
--
-- The user's organization_id is extracted from the JWT claim via
-- public.get_organization_id() (Decision D-02).

-- Helper function to extract org_id from JWT (Decision D-02)
-- NOTE: Uses public schema because Supabase restricts writes to auth schema.
-- All RLS policies reference public.get_organization_id() instead of public.get_organization_id().
CREATE OR REPLACE FUNCTION public.get_organization_id()
RETURNS UUID AS $$
    SELECT COALESCE(
        (current_setting('request.jwt.claims', true)::json ->> 'organization_id')::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid
    );
$$ LANGUAGE sql STABLE;

-- Helper function to extract user role from JWT
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
    SELECT COALESCE(
        current_setting('request.jwt.claims', true)::jsonb ->> 'user_role',
        'viewer'
    );
$$ LANGUAGE sql STABLE;

-- Enable RLS on all tables
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE site ENABLE ROW LEVEL SECURITY;
ALTER TABLE department ENABLE ROW LEVEL SECURITY;
ALTER TABLE process ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_productivity_standard ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_type_process_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_forecast ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_skill ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_availability_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_pattern ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE workload_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignment_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_config ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS Policies: Organization
-- ---------------------------------------------------------------------------
CREATE POLICY org_select ON organization
    FOR SELECT USING (id = public.get_organization_id());

CREATE POLICY org_update ON organization
    FOR UPDATE USING (id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'owner'));

-- ---------------------------------------------------------------------------
-- RLS Policies: Standard tenant-scoped tables
-- Macro pattern: SELECT allowed for all org members; INSERT/UPDATE/DELETE
-- restricted to admin/planner roles.
-- ---------------------------------------------------------------------------

-- Site
CREATE POLICY site_select ON site
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY site_insert ON site
    FOR INSERT WITH CHECK (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'owner'));
CREATE POLICY site_update ON site
    FOR UPDATE USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'owner'));
CREATE POLICY site_delete ON site
    FOR DELETE USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'owner'));

-- Department
CREATE POLICY dept_select ON department
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY dept_modify ON department
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'owner', 'planner'));

-- Process
CREATE POLICY process_select ON process
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY process_modify ON process
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'owner', 'planner'));

-- ProcessProductivityStandard
CREATE POLICY pps_select ON process_productivity_standard
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY pps_modify ON process_productivity_standard
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'planner'));

-- DemandType
CREATE POLICY dt_select ON demand_type
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY dt_modify ON demand_type
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'planner'));

-- demand_type_process_mapping
CREATE POLICY dtpm_select ON demand_type_process_mapping
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY dtpm_modify ON demand_type_process_mapping
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'planner'));

-- DemandForecast
CREATE POLICY df_select ON demand_forecast
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY df_modify ON demand_forecast
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'planner'));

-- Employee (sensitive — restrict write access)
CREATE POLICY emp_select ON employee
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY emp_modify ON employee
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'owner'));

-- EmployeeSkill
CREATE POLICY es_select ON employee_skill
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY es_modify ON employee_skill
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'planner', 'manager'));

-- EmployeeAvailabilityOverride (Blocker 2)
CREATE POLICY eao_select ON employee_availability_override
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY eao_modify ON employee_availability_override
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'planner', 'manager'));

-- ShiftPattern
CREATE POLICY sp_select ON shift_pattern
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY sp_modify ON shift_pattern
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'planner'));

-- Scenario
CREATE POLICY scen_select ON scenario
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY scen_modify ON scenario
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'planner'));

-- PlanVersion
CREATE POLICY pv_select ON plan_version
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY pv_modify ON plan_version
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'planner'));

-- WorkloadPlan
CREATE POLICY wp_select ON workload_plan
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY wp_modify ON workload_plan
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'planner'));

-- ShiftAssignment
CREATE POLICY sa_select ON shift_assignment
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY sa_modify ON shift_assignment
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'planner'));

-- ShiftAssignmentStaging (MD-09)
CREATE POLICY sas_select ON shift_assignment_staging
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY sas_modify ON shift_assignment_staging
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'planner'));

-- LaborRule
CREATE POLICY lr_select ON labor_rule
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY lr_modify ON labor_rule
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'owner'));

-- AuditLog (read-only for users; insert via service role)
CREATE POLICY al_select ON audit_log
    FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY al_insert ON audit_log
    FOR INSERT WITH CHECK (organization_id = public.get_organization_id());

-- Notification (users see only their own)
CREATE POLICY notif_select ON notification
    FOR SELECT USING (
        organization_id = public.get_organization_id()
        AND target_user_id = auth.uid()
    );
CREATE POLICY notif_update ON notification
    FOR UPDATE USING (
        organization_id = public.get_organization_id()
        AND target_user_id = auth.uid()
    );
CREATE POLICY notif_insert ON notification
    FOR INSERT WITH CHECK (organization_id = public.get_organization_id());

-- IntegrationConfig (admin only — contains encrypted credentials)
CREATE POLICY ic_select ON integration_config
    FOR SELECT USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'owner'));
CREATE POLICY ic_modify ON integration_config
    FOR ALL USING (organization_id = public.get_organization_id() AND public.get_user_role() IN ('admin', 'owner'));


-- =============================================================================
-- SERVICE ROLE BYPASS
-- =============================================================================
-- The Supabase service_role key bypasses RLS by default. This is used by:
--   - Edge Functions (optimizer, sync jobs, notification sender)
--   - Database triggers that write audit logs
--   - Migration scripts
-- No additional policy needed; service_role has full access.


-- =============================================================================
-- MATERIALIZED VIEWS (for dashboard performance)
-- =============================================================================
-- These are defined in scalability-design.md and created here for completeness.
-- Refresh is managed by pg_cron or external scheduler.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_site_dashboard AS
SELECT
    sa.organization_id,
    sa.site_id,
    s.name AS site_name,
    sa.assignment_date,
    sa.plan_version_id,
    COUNT(DISTINCT sa.employee_id) AS headcount,
    SUM(sa.scheduled_hours) AS total_scheduled_hours,
    SUM(sa.actual_hours) AS total_actual_hours,
    SUM(sa.overtime_hours) AS total_overtime_hours,
    SUM(sa.cost_estimate) AS total_labor_cost,
    COUNT(CASE WHEN sa.status = 'no_show' THEN 1 END) AS no_show_count,
    COUNT(CASE WHEN sa.status = 'cancelled' THEN 1 END) AS cancelled_count
FROM shift_assignment sa
JOIN site s ON sa.site_id = s.id
WHERE sa.assignment_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY sa.organization_id, sa.site_id, s.name,
         sa.assignment_date, sa.plan_version_id;

CREATE UNIQUE INDEX idx_mv_site_dashboard
    ON mv_site_dashboard (organization_id, site_id, assignment_date, plan_version_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_coverage_gaps AS
SELECT
    wp.organization_id,
    wp.site_id,
    wp.process_id,
    p.name AS process_name,
    wp.period_start,
    wp.plan_version_id,
    wp.hours_needed,
    wp.hours_assigned,
    wp.coverage_pct,
    wp.fte_needed,
    wp.fte_assigned,
    (wp.fte_needed - wp.fte_assigned) AS fte_gap,
    CASE
        WHEN wp.coverage_pct >= 100 THEN 'over_staffed'
        WHEN wp.coverage_pct >= 95 THEN 'adequate'
        WHEN wp.coverage_pct >= 85 THEN 'at_risk'
        ELSE 'critical'
    END AS coverage_status
FROM workload_plan wp
JOIN process p ON wp.process_id = p.id
WHERE wp.period_start >= CURRENT_DATE
  AND wp.period_start <= CURRENT_DATE + INTERVAL '28 days';

CREATE UNIQUE INDEX idx_mv_coverage_gaps
    ON mv_coverage_gaps (organization_id, site_id, process_id, period_start, plan_version_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_skill_matrix AS
SELECT
    es.organization_id,
    e.home_site_id AS site_id,
    es.process_id,
    p.name AS process_name,
    es.proficiency_level,
    COUNT(*) AS employee_count,
    COUNT(CASE WHEN es.status = 'active' THEN 1 END) AS active_count,
    COUNT(CASE WHEN es.expiry_date < CURRENT_DATE + INTERVAL '30 days'
               AND es.expiry_date IS NOT NULL THEN 1 END) AS expiring_soon_count
FROM employee_skill es
JOIN employee e ON es.employee_id = e.id
JOIN process p ON es.process_id = p.id
WHERE e.status = 'active'
GROUP BY es.organization_id, e.home_site_id, es.process_id,
         p.name, es.proficiency_level;

CREATE UNIQUE INDEX idx_mv_skill_matrix
    ON mv_skill_matrix (organization_id, site_id, process_id, proficiency_level);


-- =============================================================================
-- SEED: Refresh schedule comments (implement via pg_cron)
-- =============================================================================
-- Schedule these in Supabase Dashboard > Database > Extensions > pg_cron:
--
--   SELECT cron.schedule('refresh-site-dashboard', '*/15 * * * *',
--     'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_site_dashboard');
--
--   SELECT cron.schedule('refresh-coverage-gaps', '*/5 * * * *',
--     'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_coverage_gaps');
--
--   SELECT cron.schedule('refresh-skill-matrix', '0 * * * *',
--     'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_skill_matrix');


-- =============================================================================
-- SCHEMA COMPLETE
-- =============================================================================
-- Total tables: 20 (+ 1 join table + 3 materialized views)
--
-- To verify:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
--   ORDER BY table_name;
