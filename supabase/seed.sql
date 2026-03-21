-- =============================================================================
-- AstraPlanner Seed Data
-- Development / testing dataset for AstraLogistics BV
-- =============================================================================
-- Usage:
--   Run AFTER 00001_initial_schema.sql has been applied.
--   paste into Supabase SQL Editor or: psql -f supabase/seed.sql
-- =============================================================================

DO $$
DECLARE
    -- -------------------------------------------------------------------------
    -- UUIDs — top-level entities
    -- -------------------------------------------------------------------------
    v_org_id            UUID := gen_random_uuid();

    v_site_ams_id       UUID := gen_random_uuid();
    v_site_rot_id       UUID := gen_random_uuid();

    v_dept_ams_ops_id   UUID := gen_random_uuid();
    v_dept_ams_log_id   UUID := gen_random_uuid();
    v_dept_rot_ops_id   UUID := gen_random_uuid();
    v_dept_rot_log_id   UUID := gen_random_uuid();

    -- Processes (Amsterdam site, Operations dept)
    v_proc_pick_id      UUID := gen_random_uuid();
    v_proc_pack_id      UUID := gen_random_uuid();
    v_proc_recv_id      UUID := gen_random_uuid();
    v_proc_ship_id      UUID := gen_random_uuid();
    v_proc_fork_id      UUID := gen_random_uuid();

    -- Shift patterns
    v_sp_day_id         UUID := gen_random_uuid();
    v_sp_aftn_id        UUID := gen_random_uuid();
    v_sp_night_id       UUID := gen_random_uuid();

    -- Demand types
    v_dt_pick_id        UUID := gen_random_uuid();
    v_dt_pack_id        UUID := gen_random_uuid();

    -- Employees (20)
    v_emp_01_id         UUID := gen_random_uuid();
    v_emp_02_id         UUID := gen_random_uuid();
    v_emp_03_id         UUID := gen_random_uuid();
    v_emp_04_id         UUID := gen_random_uuid();
    v_emp_05_id         UUID := gen_random_uuid();
    v_emp_06_id         UUID := gen_random_uuid();
    v_emp_07_id         UUID := gen_random_uuid();
    v_emp_08_id         UUID := gen_random_uuid();
    v_emp_09_id         UUID := gen_random_uuid();
    v_emp_10_id         UUID := gen_random_uuid();
    v_emp_11_id         UUID := gen_random_uuid();
    v_emp_12_id         UUID := gen_random_uuid();
    v_emp_13_id         UUID := gen_random_uuid();
    v_emp_14_id         UUID := gen_random_uuid();
    v_emp_15_id         UUID := gen_random_uuid();
    v_emp_16_id         UUID := gen_random_uuid();
    v_emp_17_id         UUID := gen_random_uuid();
    v_emp_18_id         UUID := gen_random_uuid();
    v_emp_19_id         UUID := gen_random_uuid();
    v_emp_20_id         UUID := gen_random_uuid();

    -- Placeholder created_by UUID (system actor — no auth user required for seed)
    v_system_id         UUID := '00000000-0000-0000-0000-000000000001';

BEGIN

-- =============================================================================
-- 1. ORGANIZATION
-- =============================================================================
INSERT INTO organization (
    id, name, slug, subscription_tier,
    billing_email, primary_contact_name, primary_contact_phone,
    default_timezone, default_locale, default_currency,
    data_residency_region,
    max_sites, max_employees,
    settings_json, feature_flags,
    status
) VALUES (
    v_org_id,
    'AstraLogistics BV',
    'astralogistics',
    'professional',
    'finance@astralogistics.nl',
    'Jan de Vries',
    '+31 20 555 0100',
    'Europe/Amsterdam',
    'nl-NL',
    'EUR',
    'eu-west',
    10,
    500,
    '{"planning_horizon_weeks": 4, "approval_workflow": "two_step", "ai_enabled": true}',
    '{"demand_forecast": true, "ai_optimizer": true, "multi_site": true, "scenario_planning": true}',
    'active'
);

-- =============================================================================
-- 2. SITES
-- =============================================================================

-- 2.1 Amsterdam Distribution Center
INSERT INTO site (
    id, organization_id,
    name, code, site_type,
    address_line1, city, postal_code, country_code,
    latitude, longitude,
    timezone,
    operating_hours_json,
    capacity_sqft, max_headcount,
    labor_market_zone, cost_center_code,
    settings_json,
    status, go_live_date
) VALUES (
    v_site_ams_id,
    v_org_id,
    'Amsterdam Distribution Center',
    'AMS-DC',
    'distribution_center',
    'Polderweg 14',
    'Amsterdam',
    '1093 KP',
    'NL',
    52.3667, 4.9041,
    'Europe/Amsterdam',
    '{
        "monday":    {"open": "06:00", "close": "22:00"},
        "tuesday":   {"open": "06:00", "close": "22:00"},
        "wednesday": {"open": "06:00", "close": "22:00"},
        "thursday":  {"open": "06:00", "close": "22:00"},
        "friday":    {"open": "06:00", "close": "22:00"},
        "saturday":  {"open": "06:00", "close": "14:00"},
        "sunday":    {"closed": true}
    }',
    150000, 200,
    'amsterdam-metro', 'CC-AMS-001',
    '{"allowance_factor": 0.12, "absenteeism_rate": 0.07, "default_shift_length_hours": 8}',
    'active',
    '2023-01-01'
);

-- 2.2 Rotterdam Fulfillment Hub
INSERT INTO site (
    id, organization_id,
    name, code, site_type,
    address_line1, city, postal_code, country_code,
    latitude, longitude,
    timezone,
    operating_hours_json,
    capacity_sqft, max_headcount,
    labor_market_zone, cost_center_code,
    settings_json,
    status, go_live_date
) VALUES (
    v_site_rot_id,
    v_org_id,
    'Rotterdam Fulfillment Hub',
    'ROT-FH',
    'fulfillment_center',
    'Waalhaven Zuidzijde 8',
    'Rotterdam',
    '3087 BN',
    'NL',
    51.8980, 4.4630,
    'Europe/Amsterdam',
    '{
        "monday":    {"open": "06:00", "close": "22:00"},
        "tuesday":   {"open": "06:00", "close": "22:00"},
        "wednesday": {"open": "06:00", "close": "22:00"},
        "thursday":  {"open": "06:00", "close": "22:00"},
        "friday":    {"open": "06:00", "close": "22:00"},
        "saturday":  {"open": "06:00", "close": "18:00"},
        "sunday":    {"closed": true}
    }',
    90000, 120,
    'rotterdam-port', 'CC-ROT-001',
    '{"allowance_factor": 0.12, "absenteeism_rate": 0.07, "default_shift_length_hours": 8}',
    'active',
    '2023-06-01'
);

-- =============================================================================
-- 3. DEPARTMENTS
-- =============================================================================

-- Amsterdam — Operations
INSERT INTO department (
    id, organization_id, site_id,
    name, code, budget_center,
    headcount_target, description, status
) VALUES (
    v_dept_ams_ops_id,
    v_org_id, v_site_ams_id,
    'Operations', 'AMS-OPS', 'BC-OPS-AMS',
    120, 'Inbound, outbound, and floor operations for the Amsterdam DC.', 'active'
);

-- Amsterdam — Logistics
INSERT INTO department (
    id, organization_id, site_id,
    name, code, budget_center,
    headcount_target, description, status
) VALUES (
    v_dept_ams_log_id,
    v_org_id, v_site_ams_id,
    'Logistics', 'AMS-LOG', 'BC-LOG-AMS',
    40, 'Transport coordination and freight documentation for Amsterdam.', 'active'
);

-- Rotterdam — Operations
INSERT INTO department (
    id, organization_id, site_id,
    name, code, budget_center,
    headcount_target, description, status
) VALUES (
    v_dept_rot_ops_id,
    v_org_id, v_site_rot_id,
    'Operations', 'ROT-OPS', 'BC-OPS-ROT',
    70, 'Fulfillment operations for the Rotterdam hub.', 'active'
);

-- Rotterdam — Logistics
INSERT INTO department (
    id, organization_id, site_id,
    name, code, budget_center,
    headcount_target, description, status
) VALUES (
    v_dept_rot_log_id,
    v_org_id, v_site_rot_id,
    'Logistics', 'ROT-LOG', 'BC-LOG-ROT',
    25, 'Transport and port liaison for Rotterdam.', 'active'
);

-- =============================================================================
-- 4. PROCESSES (linked to Amsterdam site, Operations department)
-- =============================================================================

-- 4.1 Picking
INSERT INTO process (
    id, organization_id, department_id,
    name, code, category,
    applicable_site_types, unit_of_measure,
    requires_certification, min_skill_level, hazard_level,
    description, display_order, is_active
) VALUES (
    v_proc_pick_id,
    v_org_id, v_dept_ams_ops_id,
    'Picking', 'PICK', 'outbound',
    ARRAY['warehouse', 'distribution_center', 'fulfillment_center'],
    'lines',
    false, 1, 'none',
    'Order line picking from storage locations to staging area.',
    1, true
);

-- 4.2 Packing
INSERT INTO process (
    id, organization_id, department_id,
    name, code, category,
    applicable_site_types, unit_of_measure,
    requires_certification, min_skill_level, hazard_level,
    description, display_order, is_active
) VALUES (
    v_proc_pack_id,
    v_org_id, v_dept_ams_ops_id,
    'Packing', 'PACK', 'outbound',
    ARRAY['warehouse', 'distribution_center', 'fulfillment_center'],
    'parcels',
    false, 1, 'none',
    'Packing picked items into shipment parcels and applying labels.',
    2, true
);

-- 4.3 Receiving
INSERT INTO process (
    id, organization_id, department_id,
    name, code, category,
    applicable_site_types, unit_of_measure,
    requires_certification, min_skill_level, hazard_level,
    description, display_order, is_active
) VALUES (
    v_proc_recv_id,
    v_org_id, v_dept_ams_ops_id,
    'Receiving', 'RECV', 'inbound',
    ARRAY['warehouse', 'distribution_center', 'fulfillment_center'],
    'pallets',
    false, 1, 'none',
    'Unloading, counting, and verifying inbound goods against purchase orders.',
    3, true
);

-- 4.4 Shipping
INSERT INTO process (
    id, organization_id, department_id,
    name, code, category,
    applicable_site_types, unit_of_measure,
    requires_certification, min_skill_level, hazard_level,
    description, display_order, is_active
) VALUES (
    v_proc_ship_id,
    v_org_id, v_dept_ams_ops_id,
    'Shipping', 'SHIP', 'outbound',
    ARRAY['warehouse', 'distribution_center', 'fulfillment_center'],
    'shipments',
    false, 1, 'none',
    'Loading outbound parcels onto carrier vehicles and finalising manifests.',
    4, true
);

-- 4.5 Forklift Operations
INSERT INTO process (
    id, organization_id, department_id,
    name, code, category,
    applicable_site_types, unit_of_measure,
    requires_certification, min_skill_level, hazard_level,
    equipment_required,
    description, display_order, is_active
) VALUES (
    v_proc_fork_id,
    v_org_id, v_dept_ams_ops_id,
    'Forklift Operations', 'FORK', 'support',
    ARRAY['warehouse', 'distribution_center', 'fulfillment_center'],
    'pallet_moves',
    true, 3, 'medium',
    ARRAY['counterbalance_forklift', 'reach_truck'],
    'Moving pallets between storage zones and staging areas using powered industrial trucks.',
    5, true
);

-- =============================================================================
-- 5. PROCESS PRODUCTIVITY STANDARDS
--    5 proficiency levels × 5 processes = 25 records
--    Baseline UPH at level 4 (Proficient). Multipliers per D-03:
--      Level 1 (Trainee):   × 0.60
--      Level 2 (Basic):     × 0.75
--      Level 3 (Competent): × 0.90
--      Level 4 (Proficient):× 1.00  ← baseline
--      Level 5 (Expert):    × 1.10
-- =============================================================================

-- --- Picking (baseline L4 = 120 lines/hr) ---
INSERT INTO process_productivity_standard
    (organization_id, process_id, site_id, skill_level, units_per_hour, unit_of_measure, effective_date, source, confidence_score, sample_size, created_by)
VALUES
    (v_org_id, v_proc_pick_id, v_site_ams_id, 1,  72.00, 'lines', '2024-01-01', 'engineered', 0.85, 50, v_system_id),
    (v_org_id, v_proc_pick_id, v_site_ams_id, 2,  90.00, 'lines', '2024-01-01', 'engineered', 0.88, 80, v_system_id),
    (v_org_id, v_proc_pick_id, v_site_ams_id, 3, 108.00, 'lines', '2024-01-01', 'engineered', 0.90, 120, v_system_id),
    (v_org_id, v_proc_pick_id, v_site_ams_id, 4, 120.00, 'lines', '2024-01-01', 'engineered', 0.95, 200, v_system_id),
    (v_org_id, v_proc_pick_id, v_site_ams_id, 5, 132.00, 'lines', '2024-01-01', 'engineered', 0.92, 60,  v_system_id);

-- --- Packing (baseline L4 = 80 parcels/hr) ---
INSERT INTO process_productivity_standard
    (organization_id, process_id, site_id, skill_level, units_per_hour, unit_of_measure, effective_date, source, confidence_score, sample_size, created_by)
VALUES
    (v_org_id, v_proc_pack_id, v_site_ams_id, 1,  48.00, 'parcels', '2024-01-01', 'engineered', 0.85, 50, v_system_id),
    (v_org_id, v_proc_pack_id, v_site_ams_id, 2,  60.00, 'parcels', '2024-01-01', 'engineered', 0.88, 80, v_system_id),
    (v_org_id, v_proc_pack_id, v_site_ams_id, 3,  72.00, 'parcels', '2024-01-01', 'engineered', 0.90, 120, v_system_id),
    (v_org_id, v_proc_pack_id, v_site_ams_id, 4,  80.00, 'parcels', '2024-01-01', 'engineered', 0.95, 200, v_system_id),
    (v_org_id, v_proc_pack_id, v_site_ams_id, 5,  88.00, 'parcels', '2024-01-01', 'engineered', 0.92, 60,  v_system_id);

-- --- Receiving (baseline L4 = 25 pallets/hr) ---
INSERT INTO process_productivity_standard
    (organization_id, process_id, site_id, skill_level, units_per_hour, unit_of_measure, effective_date, source, confidence_score, sample_size, created_by)
VALUES
    (v_org_id, v_proc_recv_id, v_site_ams_id, 1,  15.00, 'pallets', '2024-01-01', 'engineered', 0.83, 40, v_system_id),
    (v_org_id, v_proc_recv_id, v_site_ams_id, 2,  18.75, 'pallets', '2024-01-01', 'engineered', 0.87, 60, v_system_id),
    (v_org_id, v_proc_recv_id, v_site_ams_id, 3,  22.50, 'pallets', '2024-01-01', 'engineered', 0.90, 90, v_system_id),
    (v_org_id, v_proc_recv_id, v_site_ams_id, 4,  25.00, 'pallets', '2024-01-01', 'engineered', 0.94, 150, v_system_id),
    (v_org_id, v_proc_recv_id, v_site_ams_id, 5,  27.50, 'pallets', '2024-01-01', 'engineered', 0.91, 45,  v_system_id);

-- --- Shipping (baseline L4 = 30 shipments/hr) ---
INSERT INTO process_productivity_standard
    (organization_id, process_id, site_id, skill_level, units_per_hour, unit_of_measure, effective_date, source, confidence_score, sample_size, created_by)
VALUES
    (v_org_id, v_proc_ship_id, v_site_ams_id, 1,  18.00, 'shipments', '2024-01-01', 'engineered', 0.83, 40, v_system_id),
    (v_org_id, v_proc_ship_id, v_site_ams_id, 2,  22.50, 'shipments', '2024-01-01', 'engineered', 0.86, 60, v_system_id),
    (v_org_id, v_proc_ship_id, v_site_ams_id, 3,  27.00, 'shipments', '2024-01-01', 'engineered', 0.89, 90, v_system_id),
    (v_org_id, v_proc_ship_id, v_site_ams_id, 4,  30.00, 'shipments', '2024-01-01', 'engineered', 0.94, 150, v_system_id),
    (v_org_id, v_proc_ship_id, v_site_ams_id, 5,  33.00, 'shipments', '2024-01-01', 'engineered', 0.91, 45,  v_system_id);

-- --- Forklift Operations (baseline L4 = 18 pallet_moves/hr) ---
INSERT INTO process_productivity_standard
    (organization_id, process_id, site_id, skill_level, units_per_hour, unit_of_measure, effective_date, source, confidence_score, sample_size, created_by)
VALUES
    (v_org_id, v_proc_fork_id, v_site_ams_id, 3,  16.20, 'pallet_moves', '2024-01-01', 'engineered', 0.88, 30, v_system_id),
    (v_org_id, v_proc_fork_id, v_site_ams_id, 4,  18.00, 'pallet_moves', '2024-01-01', 'engineered', 0.93, 80, v_system_id),
    (v_org_id, v_proc_fork_id, v_site_ams_id, 5,  19.80, 'pallet_moves', '2024-01-01', 'engineered', 0.90, 25,  v_system_id);
-- Note: levels 1 and 2 are excluded because forklift has min_skill_level = 3

-- =============================================================================
-- 6. EMPLOYEES  (20 employees — all linked to Amsterdam site)
--    contract_types: 14 full_time, 4 part_time, 2 temporary
--    hourly_rate: €15–€25
-- =============================================================================
INSERT INTO employee (
    id, organization_id, employee_number,
    first_name, last_name, email, phone,
    home_site_id, department_id,
    contract_type, hire_date, status,
    weekly_hours_contracted, hourly_rate, pay_grade,
    seniority_date, is_multi_site_eligible,
    preferences_json, metadata_json
) VALUES
-- full_time employees (1-14)
(v_emp_01_id, v_org_id, 'EMP-001', 'Lars',    'van der Berg',  'l.vanderberg@astralogistics.nl',  '+31 6 1000 0001', v_site_ams_id, v_dept_ams_ops_id, 'full_time',  '2019-03-01', 'active', 40.0, 22.50, 'PG-3', '2019-03-01', true,  '{"preferred_shifts": ["day"]}',       '{}'),
(v_emp_02_id, v_org_id, 'EMP-002', 'Sophie',  'Janssen',       's.janssen@astralogistics.nl',     '+31 6 1000 0002', v_site_ams_id, v_dept_ams_ops_id, 'full_time',  '2020-05-15', 'active', 40.0, 21.00, 'PG-3', '2020-05-15', false, '{"preferred_shifts": ["day"]}',       '{}'),
(v_emp_03_id, v_org_id, 'EMP-003', 'Pieter',  'de Groot',      'p.degroot@astralogistics.nl',     '+31 6 1000 0003', v_site_ams_id, v_dept_ams_ops_id, 'full_time',  '2018-09-01', 'active', 40.0, 24.00, 'PG-4', '2018-09-01', true,  '{"preferred_shifts": ["afternoon"]}', '{}'),
(v_emp_04_id, v_org_id, 'EMP-004', 'Anke',    'Smit',          'a.smit@astralogistics.nl',        '+31 6 1000 0004', v_site_ams_id, v_dept_ams_ops_id, 'full_time',  '2021-01-10', 'active', 40.0, 19.50, 'PG-2', '2021-01-10', false, '{"preferred_shifts": ["day"]}',       '{}'),
(v_emp_05_id, v_org_id, 'EMP-005', 'Daan',    'Bakker',        'd.bakker@astralogistics.nl',      '+31 6 1000 0005', v_site_ams_id, v_dept_ams_ops_id, 'full_time',  '2017-06-20', 'active', 40.0, 25.00, 'PG-4', '2017-06-20', true,  '{"preferred_shifts": ["day", "afternoon"]}', '{}'),
(v_emp_06_id, v_org_id, 'EMP-006', 'Femke',   'Visser',        'f.visser@astralogistics.nl',      '+31 6 1000 0006', v_site_ams_id, v_dept_ams_ops_id, 'full_time',  '2022-03-14', 'active', 40.0, 17.50, 'PG-1', '2022-03-14', false, '{"preferred_shifts": ["afternoon"]}', '{}'),
(v_emp_07_id, v_org_id, 'EMP-007', 'Joost',   'Meijer',        'j.meijer@astralogistics.nl',      '+31 6 1000 0007', v_site_ams_id, v_dept_ams_ops_id, 'full_time',  '2020-11-01', 'active', 40.0, 20.00, 'PG-2', '2020-11-01', false, '{"preferred_shifts": ["night"]}',     '{}'),
(v_emp_08_id, v_org_id, 'EMP-008', 'Nora',    'van Dijk',      'n.vandijk@astralogistics.nl',     '+31 6 1000 0008', v_site_ams_id, v_dept_ams_ops_id, 'full_time',  '2019-07-22', 'active', 40.0, 22.00, 'PG-3', '2019-07-22', true,  '{"preferred_shifts": ["day"]}',       '{}'),
(v_emp_09_id, v_org_id, 'EMP-009', 'Ruben',   'Bos',           'r.bos@astralogistics.nl',         '+31 6 1000 0009', v_site_ams_id, v_dept_ams_ops_id, 'full_time',  '2021-08-16', 'active', 40.0, 18.50, 'PG-2', '2021-08-16', false, '{"preferred_shifts": ["afternoon", "night"]}', '{}'),
(v_emp_10_id, v_org_id, 'EMP-010', 'Eva',     'Mulder',        'e.mulder@astralogistics.nl',      '+31 6 1000 0010', v_site_ams_id, v_dept_ams_ops_id, 'full_time',  '2018-02-01', 'active', 40.0, 23.50, 'PG-4', '2018-02-01', true,  '{"preferred_shifts": ["day"]}',       '{}'),
(v_emp_11_id, v_org_id, 'EMP-011', 'Thijs',   'de Jong',       't.dejong@astralogistics.nl',      '+31 6 1000 0011', v_site_ams_id, v_dept_ams_ops_id, 'full_time',  '2023-01-09', 'active', 40.0, 16.00, 'PG-1', '2023-01-09', false, '{"preferred_shifts": ["day"]}',       '{}'),
(v_emp_12_id, v_org_id, 'EMP-012', 'Iris',    'Vos',           'i.vos@astralogistics.nl',         '+31 6 1000 0012', v_site_ams_id, v_dept_ams_ops_id, 'full_time',  '2022-09-01', 'active', 40.0, 17.00, 'PG-1', '2022-09-01', false, '{"preferred_shifts": ["afternoon"]}', '{}'),
(v_emp_13_id, v_org_id, 'EMP-013', 'Kees',    'van den Berg',  'k.vandenberg@astralogistics.nl',  '+31 6 1000 0013', v_site_ams_id, v_dept_ams_log_id, 'full_time',  '2016-04-11', 'active', 40.0, 25.00, 'PG-5', '2016-04-11', true,  '{"preferred_shifts": ["day"]}',       '{}'),
(v_emp_14_id, v_org_id, 'EMP-014', 'Lotte',   'Hendriks',      'l.hendriks@astralogistics.nl',    '+31 6 1000 0014', v_site_ams_id, v_dept_ams_log_id, 'full_time',  '2020-06-01', 'active', 40.0, 20.50, 'PG-3', '2020-06-01', false, '{"preferred_shifts": ["day"]}',       '{}'),
-- part_time employees (15-18)
(v_emp_15_id, v_org_id, 'EMP-015', 'Mila',    'Peters',        'm.peters@astralogistics.nl',      '+31 6 1000 0015', v_site_ams_id, v_dept_ams_ops_id, 'part_time',  '2022-05-01', 'active', 24.0, 15.50, 'PG-1', '2022-05-01', false, '{"preferred_shifts": ["day"], "max_days_per_week": 3}',       '{}'),
(v_emp_16_id, v_org_id, 'EMP-016', 'Sam',     'van Leeuwen',   's.vanleeuwen@astralogistics.nl',  '+31 6 1000 0016', v_site_ams_id, v_dept_ams_ops_id, 'part_time',  '2023-03-01', 'active', 20.0, 15.00, 'PG-1', '2023-03-01', false, '{"preferred_shifts": ["afternoon"], "max_days_per_week": 3}', '{}'),
(v_emp_17_id, v_org_id, 'EMP-017', 'Bo',      'Willems',       'b.willems@astralogistics.nl',     '+31 6 1000 0017', v_site_ams_id, v_dept_ams_ops_id, 'part_time',  '2021-11-15', 'active', 24.0, 16.50, 'PG-1', '2021-11-15', false, '{"preferred_shifts": ["day"], "max_days_per_week": 3}',       '{}'),
(v_emp_18_id, v_org_id, 'EMP-018', 'Fleur',   'Kuijpers',      'f.kuijpers@astralogistics.nl',    '+31 6 1000 0018', v_site_ams_id, v_dept_ams_ops_id, 'part_time',  '2023-09-01', 'active', 16.0, 15.00, 'PG-1', '2023-09-01', false, '{"preferred_shifts": ["day"], "max_days_per_week": 2}',       '{}'),
-- temporary employees (19-20)
(v_emp_19_id, v_org_id, 'EMP-019', 'Milan',   'Oosterbeek',    'm.oosterbeek@astralogistics.nl',  '+31 6 1000 0019', v_site_ams_id, v_dept_ams_ops_id, 'temporary',  '2024-01-15', 'active', 40.0, 16.00, 'PG-1', '2024-01-15', false, '{"preferred_shifts": ["day"]}',       '{}'),
(v_emp_20_id, v_org_id, 'EMP-020', 'Amber',   'Rijsdijk',      'a.rijsdijk@astralogistics.nl',    '+31 6 1000 0020', v_site_ams_id, v_dept_ams_ops_id, 'temporary',  '2024-02-01', 'active', 40.0, 16.00, 'PG-1', '2024-02-01', false, '{"preferred_shifts": ["afternoon"]}', '{}');

-- =============================================================================
-- 7. EMPLOYEE SKILLS
--    Each employee 1-3 skills; at least 2 have forklift certification
-- =============================================================================
INSERT INTO employee_skill (
    organization_id, employee_id, process_id,
    proficiency_level, certification_date, expiry_date,
    is_primary_skill, training_hours_completed, status
) VALUES
-- Lars van der Berg (EMP-001): Picking L5, Packing L4, Forklift L4 (certified)
(v_org_id, v_emp_01_id, v_proc_pick_id, 5, '2021-06-01', NULL, true,  240.0, 'active'),
(v_org_id, v_emp_01_id, v_proc_pack_id, 4, '2021-06-01', NULL, false, 120.0, 'active'),
(v_org_id, v_emp_01_id, v_proc_fork_id, 4, '2022-01-15', '2025-01-14', false, 40.0, 'active'),

-- Sophie Janssen (EMP-002): Packing L4, Picking L3
(v_org_id, v_emp_02_id, v_proc_pack_id, 4, '2022-07-01', NULL, true,  160.0, 'active'),
(v_org_id, v_emp_02_id, v_proc_pick_id, 3, '2022-07-01', NULL, false, 80.0,  'active'),

-- Pieter de Groot (EMP-003): Picking L4, Forklift L5 (certified — expert)
(v_org_id, v_emp_03_id, v_proc_pick_id, 4, '2020-03-01', NULL, true,  200.0, 'active'),
(v_org_id, v_emp_03_id, v_proc_fork_id, 5, '2019-09-10', '2024-09-09', false, 80.0, 'active'),

-- Anke Smit (EMP-004): Packing L3, Receiving L2
(v_org_id, v_emp_04_id, v_proc_pack_id, 3, '2022-01-15', NULL, true,  100.0, 'active'),
(v_org_id, v_emp_04_id, v_proc_recv_id, 2, '2022-01-15', NULL, false,  40.0, 'active'),

-- Daan Bakker (EMP-005): Picking L5, Shipping L5, Receiving L4
(v_org_id, v_emp_05_id, v_proc_pick_id, 5, '2019-06-01', NULL, true,  350.0, 'active'),
(v_org_id, v_emp_05_id, v_proc_ship_id, 5, '2019-06-01', NULL, false, 200.0, 'active'),
(v_org_id, v_emp_05_id, v_proc_recv_id, 4, '2020-01-01', NULL, false, 120.0, 'active'),

-- Femke Visser (EMP-006): Packing L2, Picking L1
(v_org_id, v_emp_06_id, v_proc_pack_id, 2, '2022-06-01', NULL, true,   60.0, 'active'),
(v_org_id, v_emp_06_id, v_proc_pick_id, 1, '2022-06-01', NULL, false,  20.0, 'active'),

-- Joost Meijer (EMP-007): Receiving L3, Shipping L3
(v_org_id, v_emp_07_id, v_proc_recv_id, 3, '2021-03-01', NULL, true,  120.0, 'active'),
(v_org_id, v_emp_07_id, v_proc_ship_id, 3, '2021-03-01', NULL, false,  80.0, 'active'),

-- Nora van Dijk (EMP-008): Picking L4, Packing L3, Shipping L4
(v_org_id, v_emp_08_id, v_proc_pick_id, 4, '2021-01-01', NULL, true,  180.0, 'active'),
(v_org_id, v_emp_08_id, v_proc_pack_id, 3, '2021-01-01', NULL, false,  80.0, 'active'),
(v_org_id, v_emp_08_id, v_proc_ship_id, 4, '2022-03-01', NULL, false, 100.0, 'active'),

-- Ruben Bos (EMP-009): Packing L2, Picking L2
(v_org_id, v_emp_09_id, v_proc_pack_id, 2, '2022-02-01', NULL, true,   60.0, 'active'),
(v_org_id, v_emp_09_id, v_proc_pick_id, 2, '2022-02-01', NULL, false,  40.0, 'active'),

-- Eva Mulder (EMP-010): Picking L5, Receiving L5, Forklift L4 (certified)
(v_org_id, v_emp_10_id, v_proc_pick_id, 5, '2020-06-01', NULL, true,  320.0, 'active'),
(v_org_id, v_emp_10_id, v_proc_recv_id, 5, '2020-06-01', NULL, false, 200.0, 'active'),
(v_org_id, v_emp_10_id, v_proc_fork_id, 4, '2021-09-01', '2024-08-31', false, 40.0, 'active'),

-- Thijs de Jong (EMP-011): Packing L1
(v_org_id, v_emp_11_id, v_proc_pack_id, 1, '2023-02-01', NULL, true,   20.0, 'active'),

-- Iris Vos (EMP-012): Picking L2, Packing L2
(v_org_id, v_emp_12_id, v_proc_pick_id, 2, '2022-11-01', NULL, true,   50.0, 'active'),
(v_org_id, v_emp_12_id, v_proc_pack_id, 2, '2022-11-01', NULL, false,  40.0, 'active'),

-- Kees van den Berg (EMP-013): Shipping L5, Receiving L4 (logistics)
(v_org_id, v_emp_13_id, v_proc_ship_id, 5, '2018-06-01', NULL, true,  400.0, 'active'),
(v_org_id, v_emp_13_id, v_proc_recv_id, 4, '2018-06-01', NULL, false, 200.0, 'active'),

-- Lotte Hendriks (EMP-014): Shipping L3, Receiving L3
(v_org_id, v_emp_14_id, v_proc_ship_id, 3, '2021-06-01', NULL, true,  120.0, 'active'),
(v_org_id, v_emp_14_id, v_proc_recv_id, 3, '2021-06-01', NULL, false,  80.0, 'active'),

-- Mila Peters (EMP-015): Packing L3 (part-time)
(v_org_id, v_emp_15_id, v_proc_pack_id, 3, '2022-08-01', NULL, true,   80.0, 'active'),

-- Sam van Leeuwen (EMP-016): Picking L1, Packing L1 (part-time, new)
(v_org_id, v_emp_16_id, v_proc_pick_id, 1, '2023-04-01', NULL, true,   20.0, 'active'),
(v_org_id, v_emp_16_id, v_proc_pack_id, 1, '2023-04-01', NULL, false,  20.0, 'active'),

-- Bo Willems (EMP-017): Picking L3 (part-time)
(v_org_id, v_emp_17_id, v_proc_pick_id, 3, '2022-03-01', NULL, true,  100.0, 'active'),

-- Fleur Kuijpers (EMP-018): Packing L2 (part-time, limited hours)
(v_org_id, v_emp_18_id, v_proc_pack_id, 2, '2023-11-01', NULL, true,   30.0, 'active'),

-- Milan Oosterbeek (EMP-019): Picking L1 (temporary)
(v_org_id, v_emp_19_id, v_proc_pick_id, 1, '2024-01-20', NULL, true,   16.0, 'active'),

-- Amber Rijsdijk (EMP-020): Packing L2 (temporary)
(v_org_id, v_emp_20_id, v_proc_pack_id, 2, '2024-02-05', NULL, true,   24.0, 'active');

-- =============================================================================
-- 8. SHIFT PATTERNS
-- =============================================================================
INSERT INTO shift_pattern (
    id, organization_id,
    name, code,
    start_time, end_time,
    duration_hours, paid_hours,
    break_rules_json,
    days_of_week, is_overnight,
    shift_type, color_hex,
    min_staffing, is_active
) VALUES
-- Day shift 06:00-14:00
(
    v_sp_day_id,
    v_org_id,
    'Day Shift', 'DAY',
    '06:00', '14:00',
    8.0, 7.5,
    '{"breaks": [{"after_hours": 2.5, "duration_minutes": 15, "paid": true}, {"after_hours": 4.0, "duration_minutes": 15, "paid": false}]}',
    ARRAY[1,2,3,4,5,6]::SMALLINT[],
    false,
    'regular', '#4CAF50',
    5, true
),
-- Afternoon shift 14:00-22:00
(
    v_sp_aftn_id,
    v_org_id,
    'Afternoon Shift', 'AFTN',
    '14:00', '22:00',
    8.0, 7.5,
    '{"breaks": [{"after_hours": 2.5, "duration_minutes": 15, "paid": true}, {"after_hours": 4.0, "duration_minutes": 15, "paid": false}]}',
    ARRAY[1,2,3,4,5]::SMALLINT[],
    false,
    'regular', '#FF9800',
    3, true
),
-- Night shift 22:00-06:00
(
    v_sp_night_id,
    v_org_id,
    'Night Shift', 'NIGHT',
    '22:00', '06:00',
    8.0, 7.5,
    '{"breaks": [{"after_hours": 2.5, "duration_minutes": 15, "paid": true}, {"after_hours": 4.0, "duration_minutes": 15, "paid": false}]}',
    ARRAY[1,2,3,4,5]::SMALLINT[],
    true,
    'regular', '#2196F3',
    2, true
);

-- =============================================================================
-- 9. LABOR RULES (for Amsterdam site — Dutch labor law + company policy)
-- =============================================================================
INSERT INTO labor_rule (
    organization_id,
    name, code, rule_type,
    jurisdiction_country, jurisdiction_site_id,
    parameters_json,
    applies_to_contract_types,
    severity,
    penalty_score,
    effective_date,
    source, is_active
) VALUES
-- 9.1 Max weekly hours — 48 h (Arbeidstijdenwet hard cap)
(
    v_org_id,
    'Maximum Weekly Hours', 'LR-AMS-001', 'max_weekly_hours',
    'NL', v_site_ams_id,
    '{"max_hours": 48, "reference_period_weeks": 16}',
    ARRAY['full_time','part_time','temporary','seasonal','contractor'],
    'hard_constraint',
    NULL,
    '2024-01-01',
    'Arbeidstijdenwet (ATW) art. 5:7', true
),
-- 9.2 Minimum rest between shifts — 11 h (EU Working Time Directive)
(
    v_org_id,
    'Minimum Rest Between Shifts', 'LR-AMS-002', 'min_rest_between_shifts',
    'NL', v_site_ams_id,
    '{"min_rest_hours": 11}',
    ARRAY['full_time','part_time','temporary','seasonal','contractor'],
    'hard_constraint',
    NULL,
    '2024-01-01',
    'EU Working Time Directive 2003/88/EC art. 3', true
),
-- 9.3 Max consecutive working days — 6 (ATW)
(
    v_org_id,
    'Maximum Consecutive Working Days', 'LR-AMS-003', 'max_consecutive_days',
    'NL', v_site_ams_id,
    '{"max_consecutive_days": 6}',
    ARRAY['full_time','part_time','temporary','seasonal','contractor'],
    'hard_constraint',
    NULL,
    '2024-01-01',
    'Arbeidstijdenwet (ATW) art. 5:5', true
),
-- 9.4 Overtime threshold weekly — 40 h (company policy, soft)
(
    v_org_id,
    'Weekly Overtime Threshold', 'LR-AMS-004', 'overtime_threshold_weekly',
    'NL', v_site_ams_id,
    '{"overtime_threshold_hours": 40, "overtime_multiplier": 1.5}',
    ARRAY['full_time','part_time'],
    'soft_constraint',
    10.00,
    '2024-01-01',
    'AstraLogistics BV Company Policy CP-HR-012', true
);

-- =============================================================================
-- 10. DEMAND TYPES
-- =============================================================================
INSERT INTO demand_type (
    id, organization_id,
    name, code, unit_of_measure, category,
    description, is_active, display_order
) VALUES
(
    v_dt_pick_id,
    v_org_id,
    'Outbound Order Lines', 'DT-PICK', 'lines', 'outbound',
    'Individual order lines to be picked from storage locations.', true, 1
),
(
    v_dt_pack_id,
    v_org_id,
    'Parcels to Pack', 'DT-PACK', 'parcels', 'outbound',
    'Parcels to be packed and labelled for outbound shipment.', true, 2
);

-- =============================================================================
-- 11. DEMAND TYPE ↔ PROCESS MAPPINGS
-- =============================================================================
INSERT INTO demand_type_process_mapping (
    demand_type_id, process_id, organization_id,
    conversion_ratio, is_primary
) VALUES
(v_dt_pick_id, v_proc_pick_id, v_org_id, 1.0000, true),
(v_dt_pack_id, v_proc_pack_id, v_org_id, 1.0000, true);

-- =============================================================================
-- 12. SAMPLE DEMAND FORECASTS
--    1 week of hourly data for Amsterdam site — Picking and Packing.
--    Week of 2026-03-23 (Mon) through 2026-03-27 (Fri).
--    Picking: day-shift peak 1500-2000 lines/hr, afternoon 800-1200, night 300-500.
--    Packing: day-shift peak 900-1200 parcels/hr, afternoon 500-800, night 200-350.
--    Saturday 2026-03-28: half-day (day shift only), ~60% of Monday volumes.
-- =============================================================================

-- ---- Monday 2026-03-23 ----
-- Picking (hourly, 06:00-22:00)
INSERT INTO demand_forecast (organization_id, site_id, demand_type_id, period_start, period_end, volume, source, is_actual)
SELECT v_org_id, v_site_ams_id, v_dt_pick_id,
       ('2026-03-23 06:00:00+01'::timestamptz + (s || ' hours')::interval),
       ('2026-03-23 07:00:00+01'::timestamptz + (s || ' hours')::interval),
       CASE s
           WHEN 0 THEN 1200 WHEN 1 THEN 1600 WHEN 2 THEN 1850 WHEN 3 THEN 2000
           WHEN 4 THEN 1950 WHEN 5 THEN 1800 WHEN 6 THEN 1700 WHEN 7 THEN 1500
           WHEN 8 THEN 1100 WHEN 9 THEN  950 WHEN 10 THEN 800 WHEN 11 THEN 700
           WHEN 12 THEN 600 WHEN 13 THEN 500 WHEN 14 THEN 420 WHEN 15 THEN 350
       END,
       'manual_entry', false
FROM generate_series(0, 15) s;

-- Packing Mon
INSERT INTO demand_forecast (organization_id, site_id, demand_type_id, period_start, period_end, volume, source, is_actual)
SELECT v_org_id, v_site_ams_id, v_dt_pack_id,
       ('2026-03-23 06:00:00+01'::timestamptz + (s || ' hours')::interval),
       ('2026-03-23 07:00:00+01'::timestamptz + (s || ' hours')::interval),
       CASE s
           WHEN 0 THEN  700 WHEN 1 THEN  950 WHEN 2 THEN 1100 WHEN 3 THEN 1200
           WHEN 4 THEN 1150 WHEN 5 THEN 1050 WHEN 6 THEN 1000 WHEN 7 THEN  900
           WHEN 8 THEN  650 WHEN 9 THEN  550 WHEN 10 THEN 480 WHEN 11 THEN 420
           WHEN 12 THEN 360 WHEN 13 THEN 300 WHEN 14 THEN 250 WHEN 15 THEN 210
       END,
       'manual_entry', false
FROM generate_series(0, 15) s;

-- ---- Tuesday 2026-03-24 ----
INSERT INTO demand_forecast (organization_id, site_id, demand_type_id, period_start, period_end, volume, source, is_actual)
SELECT v_org_id, v_site_ams_id, v_dt_pick_id,
       ('2026-03-24 06:00:00+01'::timestamptz + (s || ' hours')::interval),
       ('2026-03-24 07:00:00+01'::timestamptz + (s || ' hours')::interval),
       CASE s
           WHEN 0 THEN 1250 WHEN 1 THEN 1650 WHEN 2 THEN 1900 WHEN 3 THEN 2000
           WHEN 4 THEN 1900 WHEN 5 THEN 1750 WHEN 6 THEN 1600 WHEN 7 THEN 1450
           WHEN 8 THEN 1050 WHEN 9 THEN  900 WHEN 10 THEN 780 WHEN 11 THEN 680
           WHEN 12 THEN 580 WHEN 13 THEN 490 WHEN 14 THEN 400 WHEN 15 THEN 340
       END,
       'manual_entry', false
FROM generate_series(0, 15) s;

INSERT INTO demand_forecast (organization_id, site_id, demand_type_id, period_start, period_end, volume, source, is_actual)
SELECT v_org_id, v_site_ams_id, v_dt_pack_id,
       ('2026-03-24 06:00:00+01'::timestamptz + (s || ' hours')::interval),
       ('2026-03-24 07:00:00+01'::timestamptz + (s || ' hours')::interval),
       CASE s
           WHEN 0 THEN  720 WHEN 1 THEN  980 WHEN 2 THEN 1120 WHEN 3 THEN 1180
           WHEN 4 THEN 1100 WHEN 5 THEN 1000 WHEN 6 THEN  940 WHEN 7 THEN  870
           WHEN 8 THEN  620 WHEN 9 THEN  530 WHEN 10 THEN 460 WHEN 11 THEN 400
           WHEN 12 THEN 340 WHEN 13 THEN 290 WHEN 14 THEN 240 WHEN 15 THEN 200
       END,
       'manual_entry', false
FROM generate_series(0, 15) s;

-- ---- Wednesday 2026-03-25 ----
INSERT INTO demand_forecast (organization_id, site_id, demand_type_id, period_start, period_end, volume, source, is_actual)
SELECT v_org_id, v_site_ams_id, v_dt_pick_id,
       ('2026-03-25 06:00:00+01'::timestamptz + (s || ' hours')::interval),
       ('2026-03-25 07:00:00+01'::timestamptz + (s || ' hours')::interval),
       CASE s
           WHEN 0 THEN 1300 WHEN 1 THEN 1700 WHEN 2 THEN 1950 WHEN 3 THEN 2000
           WHEN 4 THEN 1950 WHEN 5 THEN 1800 WHEN 6 THEN 1680 WHEN 7 THEN 1520
           WHEN 8 THEN 1100 WHEN 9 THEN  950 WHEN 10 THEN 820 WHEN 11 THEN 720
           WHEN 12 THEN 620 WHEN 13 THEN 510 WHEN 14 THEN 430 WHEN 15 THEN 370
       END,
       'manual_entry', false
FROM generate_series(0, 15) s;

INSERT INTO demand_forecast (organization_id, site_id, demand_type_id, period_start, period_end, volume, source, is_actual)
SELECT v_org_id, v_site_ams_id, v_dt_pack_id,
       ('2026-03-25 06:00:00+01'::timestamptz + (s || ' hours')::interval),
       ('2026-03-25 07:00:00+01'::timestamptz + (s || ' hours')::interval),
       CASE s
           WHEN 0 THEN  750 WHEN 1 THEN 1000 WHEN 2 THEN 1150 WHEN 3 THEN 1200
           WHEN 4 THEN 1150 WHEN 5 THEN 1060 WHEN 6 THEN  980 WHEN 7 THEN  900
           WHEN 8 THEN  660 WHEN 9 THEN  560 WHEN 10 THEN 490 WHEN 11 THEN 430
           WHEN 12 THEN 370 WHEN 13 THEN 310 WHEN 14 THEN 260 WHEN 15 THEN 220
       END,
       'manual_entry', false
FROM generate_series(0, 15) s;

-- ---- Thursday 2026-03-26 ----
INSERT INTO demand_forecast (organization_id, site_id, demand_type_id, period_start, period_end, volume, source, is_actual)
SELECT v_org_id, v_site_ams_id, v_dt_pick_id,
       ('2026-03-26 06:00:00+01'::timestamptz + (s || ' hours')::interval),
       ('2026-03-26 07:00:00+01'::timestamptz + (s || ' hours')::interval),
       CASE s
           WHEN 0 THEN 1350 WHEN 1 THEN 1750 WHEN 2 THEN 1980 WHEN 3 THEN 2000
           WHEN 4 THEN 1960 WHEN 5 THEN 1820 WHEN 6 THEN 1700 WHEN 7 THEN 1550
           WHEN 8 THEN 1150 WHEN 9 THEN  990 WHEN 10 THEN 850 WHEN 11 THEN 740
           WHEN 12 THEN 640 WHEN 13 THEN 530 WHEN 14 THEN 450 WHEN 15 THEN 380
       END,
       'manual_entry', false
FROM generate_series(0, 15) s;

INSERT INTO demand_forecast (organization_id, site_id, demand_type_id, period_start, period_end, volume, source, is_actual)
SELECT v_org_id, v_site_ams_id, v_dt_pack_id,
       ('2026-03-26 06:00:00+01'::timestamptz + (s || ' hours')::interval),
       ('2026-03-26 07:00:00+01'::timestamptz + (s || ' hours')::interval),
       CASE s
           WHEN 0 THEN  800 WHEN 1 THEN 1040 WHEN 2 THEN 1180 WHEN 3 THEN 1200
           WHEN 4 THEN 1160 WHEN 5 THEN 1070 WHEN 6 THEN 1000 WHEN 7 THEN  920
           WHEN 8 THEN  690 WHEN 9 THEN  590 WHEN 10 THEN 510 WHEN 11 THEN 450
           WHEN 12 THEN 390 WHEN 13 THEN 320 WHEN 14 THEN 270 WHEN 15 THEN 230
       END,
       'manual_entry', false
FROM generate_series(0, 15) s;

-- ---- Friday 2026-03-27 ----
INSERT INTO demand_forecast (organization_id, site_id, demand_type_id, period_start, period_end, volume, source, is_actual)
SELECT v_org_id, v_site_ams_id, v_dt_pick_id,
       ('2026-03-27 06:00:00+01'::timestamptz + (s || ' hours')::interval),
       ('2026-03-27 07:00:00+01'::timestamptz + (s || ' hours')::interval),
       CASE s
           WHEN 0 THEN 1400 WHEN 1 THEN 1800 WHEN 2 THEN 2000 WHEN 3 THEN 2000
           WHEN 4 THEN 1970 WHEN 5 THEN 1840 WHEN 6 THEN 1720 WHEN 7 THEN 1580
           WHEN 8 THEN 1180 WHEN 9 THEN 1010 WHEN 10 THEN 880 WHEN 11 THEN 760
           WHEN 12 THEN 660 WHEN 13 THEN 550 WHEN 14 THEN 470 WHEN 15 THEN 400
       END,
       'manual_entry', false
FROM generate_series(0, 15) s;

INSERT INTO demand_forecast (organization_id, site_id, demand_type_id, period_start, period_end, volume, source, is_actual)
SELECT v_org_id, v_site_ams_id, v_dt_pack_id,
       ('2026-03-27 06:00:00+01'::timestamptz + (s || ' hours')::interval),
       ('2026-03-27 07:00:00+01'::timestamptz + (s || ' hours')::interval),
       CASE s
           WHEN 0 THEN  840 WHEN 1 THEN 1080 WHEN 2 THEN 1200 WHEN 3 THEN 1200
           WHEN 4 THEN 1180 WHEN 5 THEN 1100 WHEN 6 THEN 1020 WHEN 7 THEN  940
           WHEN 8 THEN  710 WHEN 9 THEN  610 WHEN 10 THEN 530 WHEN 11 THEN 460
           WHEN 12 THEN 400 WHEN 13 THEN 340 WHEN 14 THEN 285 WHEN 15 THEN 245
       END,
       'manual_entry', false
FROM generate_series(0, 15) s;

-- ---- Saturday 2026-03-28 (half-day 06:00-14:00 = 8 hours, ~60% of Monday) ----
INSERT INTO demand_forecast (organization_id, site_id, demand_type_id, period_start, period_end, volume, source, is_actual)
SELECT v_org_id, v_site_ams_id, v_dt_pick_id,
       ('2026-03-28 06:00:00+01'::timestamptz + (s || ' hours')::interval),
       ('2026-03-28 07:00:00+01'::timestamptz + (s || ' hours')::interval),
       CASE s
           WHEN 0 THEN 720 WHEN 1 THEN 960 WHEN 2 THEN 1110 WHEN 3 THEN 1200
           WHEN 4 THEN 1170 WHEN 5 THEN 1080 WHEN 6 THEN 1020 WHEN 7 THEN  900
       END,
       'manual_entry', false
FROM generate_series(0, 7) s;

INSERT INTO demand_forecast (organization_id, site_id, demand_type_id, period_start, period_end, volume, source, is_actual)
SELECT v_org_id, v_site_ams_id, v_dt_pack_id,
       ('2026-03-28 06:00:00+01'::timestamptz + (s || ' hours')::interval),
       ('2026-03-28 07:00:00+01'::timestamptz + (s || ' hours')::interval),
       CASE s
           WHEN 0 THEN 420 WHEN 1 THEN 570 WHEN 2 THEN 660 WHEN 3 THEN 720
           WHEN 4 THEN 690 WHEN 5 THEN 630 WHEN 6 THEN 600 WHEN 7 THEN 540
       END,
       'manual_entry', false
FROM generate_series(0, 7) s;

END $$;
