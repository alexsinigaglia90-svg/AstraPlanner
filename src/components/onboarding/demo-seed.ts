/**
 * Demo seed data for AstraPlanner's demo mode.
 * Shapes match tRPC router responses exactly (org.ts + workforce.ts).
 */

// ── ID constants ──────────────────────────────────────────────────────────────

export const DEMO_ORG_ID = 'demo-org-00000000-0000-0000-0000-000000000001'
export const DEMO_SITE_AMS = 'demo-site-0000-0000-0000-000000000001'
export const DEMO_SITE_RTM = 'demo-site-0000-0000-0000-000000000002'

const DEPT_INBOUND_AMS = 'demo-dept-0000-0000-0000-000000000001'
const DEPT_OUTBOUND_AMS = 'demo-dept-0000-0000-0000-000000000002'
const DEPT_INBOUND_RTM = 'demo-dept-0000-0000-0000-000000000003'

const SHIFT_AMS_OCHTEND = 'demo-shft-0000-0000-0000-000000000001'
const SHIFT_AMS_MIDDAG = 'demo-shft-0000-0000-0000-000000000002'
const SHIFT_AMS_NACHT = 'demo-shft-0000-0000-0000-000000000003'
const SHIFT_RTM_OCHTEND = 'demo-shft-0000-0000-0000-000000000004'
const SHIFT_RTM_MIDDAG = 'demo-shft-0000-0000-0000-000000000005'
const SHIFT_RTM_NACHT = 'demo-shft-0000-0000-0000-000000000006'

const ROLE_ORDERPICKER = 'demo-role-0000-0000-0000-000000000001'
const ROLE_TEAMLEIDER = 'demo-role-0000-0000-0000-000000000002'
const ROLE_LOG_MED = 'demo-role-0000-0000-0000-000000000003'

const PROC_ORDER_PICKING = 'demo-proc-0000-0000-0000-000000000001'
const PROC_INBOUND = 'demo-proc-0000-0000-0000-000000000002'

// ── Organization ──────────────────────────────────────────────────────────────

export const demoOrganization = {
  id: DEMO_ORG_ID,
  name: 'AstraDemo BV',
  slug: 'astrademo-bv',
  subscription_tier: 'professional' as const,
  settings_json: {
    sector: 'Logistiek & Warehousing',
    default_timezone: 'Europe/Amsterdam',
    default_locale: 'nl-NL',
    default_currency: 'EUR',
  },
  default_timezone: 'Europe/Amsterdam',
  default_locale: 'nl-NL',
  default_currency: 'EUR',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
}

// ── Sites ─────────────────────────────────────────────────────────────────────

export const demoSites = [
  {
    id: DEMO_SITE_AMS,
    name: 'Amsterdam DC',
    code: 'AMS-DC',
    site_type: 'warehouse',
    timezone: 'Europe/Amsterdam',
    address: 'Haparandaweg 85, Amsterdam, NL',
    settings_json: {
      allowance_factor: 1.15,
      allowance_breakdown: {
        break_allowance: 0.08,
        walk_time_allowance: 0.04,
        startup_shutdown_allowance: 0.02,
        other_allowance: 0.01,
      },
      operating_hours: {
        mon: { open: '06:00', close: '22:00' },
        tue: { open: '06:00', close: '22:00' },
        wed: { open: '06:00', close: '22:00' },
        thu: { open: '06:00', close: '22:00' },
        fri: { open: '06:00', close: '22:00' },
        sat: { open: '08:00', close: '18:00' },
        sun: { open: '00:00', close: '00:00' },
      },
      max_headcount: 120,
      absenteeism_rate: 0.05,
      notification_retention_days: 30,
    },
    is_active: true,
    created_at: '2025-01-01T00:00:00.000Z',
  },
  {
    id: DEMO_SITE_RTM,
    name: 'Rotterdam Hub',
    code: 'RTM-HUB',
    site_type: 'hub',
    timezone: 'Europe/Amsterdam',
    address: 'Maasvlakte 2, Rotterdam, NL',
    settings_json: {
      allowance_factor: 1.12,
      allowance_breakdown: {
        break_allowance: 0.07,
        walk_time_allowance: 0.03,
        startup_shutdown_allowance: 0.02,
        other_allowance: 0.0,
      },
      operating_hours: {
        mon: { open: '05:00', close: '23:00' },
        tue: { open: '05:00', close: '23:00' },
        wed: { open: '05:00', close: '23:00' },
        thu: { open: '05:00', close: '23:00' },
        fri: { open: '05:00', close: '23:00' },
        sat: { open: '06:00', close: '20:00' },
        sun: { open: '00:00', close: '00:00' },
      },
      max_headcount: 80,
      absenteeism_rate: 0.04,
      notification_retention_days: 30,
    },
    is_active: true,
    created_at: '2025-01-01T00:00:00.000Z',
  },
]

// ── Shifts ────────────────────────────────────────────────────────────────────

export const demoShifts = [
  // Amsterdam DC
  {
    id: SHIFT_AMS_OCHTEND,
    name: 'Ochtend',
    code: 'AMS_OCHTEND',
    start_time: '06:00',
    end_time: '14:00',
    duration_hours: 8,
    days_of_week: [1, 2, 3, 4, 5],
    break_rules_json: { rules: [{ start_time: '09:30', end_time: '09:45', staggered: true, stagger_groups: 3 }] },
    is_overnight: false,
    shift_type: 'morning',
    color_hex: '#6366F1',
    site_id: DEMO_SITE_AMS,
  },
  {
    id: SHIFT_AMS_MIDDAG,
    name: 'Middag',
    code: 'AMS_MIDDAG',
    start_time: '14:00',
    end_time: '22:00',
    duration_hours: 8,
    days_of_week: [1, 2, 3, 4, 5],
    break_rules_json: { rules: [{ start_time: '17:30', end_time: '17:45', staggered: true, stagger_groups: 3 }] },
    is_overnight: false,
    shift_type: 'afternoon',
    color_hex: '#F59E0B',
    site_id: DEMO_SITE_AMS,
  },
  {
    id: SHIFT_AMS_NACHT,
    name: 'Nacht',
    code: 'AMS_NACHT',
    start_time: '22:00',
    end_time: '06:00',
    duration_hours: 8,
    days_of_week: [0, 1, 2, 3, 4],
    break_rules_json: { rules: [{ start_time: '02:00', end_time: '02:15' }] },
    is_overnight: true,
    shift_type: 'night',
    color_hex: '#6D28D9',
    site_id: DEMO_SITE_AMS,
  },
  // Rotterdam Hub
  {
    id: SHIFT_RTM_OCHTEND,
    name: 'Ochtend',
    code: 'RTM_OCHTEND',
    start_time: '06:00',
    end_time: '14:00',
    duration_hours: 8,
    days_of_week: [1, 2, 3, 4, 5],
    break_rules_json: { rules: [{ start_time: '09:30', end_time: '09:45' }] },
    is_overnight: false,
    shift_type: 'morning',
    color_hex: '#10B981',
    site_id: DEMO_SITE_RTM,
  },
  {
    id: SHIFT_RTM_MIDDAG,
    name: 'Middag',
    code: 'RTM_MIDDAG',
    start_time: '14:00',
    end_time: '22:00',
    duration_hours: 8,
    days_of_week: [1, 2, 3, 4, 5],
    break_rules_json: { rules: [{ start_time: '17:30', end_time: '17:45' }] },
    is_overnight: false,
    shift_type: 'afternoon',
    color_hex: '#F59E0B',
    site_id: DEMO_SITE_RTM,
  },
  {
    id: SHIFT_RTM_NACHT,
    name: 'Nacht',
    code: 'RTM_NACHT',
    start_time: '22:00',
    end_time: '06:00',
    duration_hours: 8,
    days_of_week: [0, 1, 2, 3, 4],
    break_rules_json: { rules: [{ start_time: '02:00', end_time: '02:15' }] },
    is_overnight: true,
    shift_type: 'night',
    color_hex: '#6D28D9',
    site_id: DEMO_SITE_RTM,
  },
]

// ── Roles (job roles) ─────────────────────────────────────────────────────────

export const demoRoles = [
  {
    id: ROLE_ORDERPICKER,
    name: 'Orderpicker',
    code: 'ORDERPICKER',
    color: 'indigo',
  },
  {
    id: ROLE_TEAMLEIDER,
    name: 'Teamleider',
    code: 'TEAMLEIDER',
    color: 'emerald',
  },
  {
    id: ROLE_LOG_MED,
    name: 'Logistiek Medewerker',
    code: 'LOG_MED',
    color: 'amber',
  },
]

// ── Departments ───────────────────────────────────────────────────────────────

export const demoDepartments = [
  {
    id: DEPT_INBOUND_AMS,
    name: 'Inbound',
    code: 'INBOUND',
    color: 'indigo',
    site_id: DEMO_SITE_AMS,
    process_count: 1,
  },
  {
    id: DEPT_OUTBOUND_AMS,
    name: 'Outbound',
    code: 'OUTBOUND',
    color: 'amber',
    site_id: DEMO_SITE_AMS,
    process_count: 1,
  },
  {
    id: DEPT_INBOUND_RTM,
    name: 'Inbound',
    code: 'INBOUND',
    color: 'emerald',
    site_id: DEMO_SITE_RTM,
    process_count: 0,
  },
]

// ── Processes ─────────────────────────────────────────────────────────────────

export const demoProcesses = [
  {
    id: PROC_ORDER_PICKING,
    name: 'Order Picking',
    code: 'ORDER_PICKING',
    unit_of_measure: 'lines',
    norm_uph: 120,
    department_id: DEPT_OUTBOUND_AMS,
    process_type: 'productive',
    support_type: null,
    parent_process_id: null,
    support_ratio_self: 1,
    support_ratio_parent: 1,
    fixed_headcount: null,
    support_method: null,
    support_config_json: {},
    priority: 'critical',
    min_skill_level: 2,
    certifications_required: [],
    conversion_input_uom: null,
    conversion_output_qty: null,
    restrict_to_trained: true,
    min_staffing: 3,
    max_staffing: 20,
    frequency_type: 'daily',
    frequency_days: null,
    frequency_count: null,
    duration_type: 'full_shift',
    duration_hours: null,
  },
  {
    id: PROC_INBOUND,
    name: 'Inbound Receiving',
    code: 'INBOUND_RECEIVING',
    unit_of_measure: 'pallets',
    norm_uph: 25,
    department_id: DEPT_INBOUND_AMS,
    process_type: 'productive',
    support_type: null,
    parent_process_id: null,
    support_ratio_self: 1,
    support_ratio_parent: 1,
    fixed_headcount: null,
    support_method: null,
    support_config_json: {},
    priority: 'important',
    min_skill_level: 1,
    certifications_required: [],
    conversion_input_uom: null,
    conversion_output_qty: null,
    restrict_to_trained: false,
    min_staffing: 2,
    max_staffing: 10,
    frequency_type: 'daily',
    frequency_days: null,
    frequency_count: null,
    duration_type: 'full_shift',
    duration_hours: null,
  },
]

// ── Equipment ─────────────────────────────────────────────────────────────────

export const demoEquipment = [
  {
    id: 'demo-equip-000-0000-0000-000000000001',
    name: 'Reachtruck',
    code: 'REACHTRUCK',
    site_id: DEMO_SITE_AMS,
    quantity: 6,
    status: 'active',
  },
  {
    id: 'demo-equip-000-0000-0000-000000000002',
    name: 'Orderpicktruck',
    code: 'ORDERPICKTRUCK',
    site_id: DEMO_SITE_AMS,
    quantity: 12,
    status: 'active',
  },
  {
    id: 'demo-equip-000-0000-0000-000000000003',
    name: 'Handpallettruck',
    code: 'HANDPALLETTRUCK',
    site_id: DEMO_SITE_AMS,
    quantity: 20,
    status: 'active',
  },
  {
    id: 'demo-equip-000-0000-0000-000000000004',
    name: 'Orderpicktruck',
    code: 'ORDERPICKTRUCK',
    site_id: DEMO_SITE_RTM,
    quantity: 8,
    status: 'active',
  },
  {
    id: 'demo-equip-000-0000-0000-000000000005',
    name: 'Handpallettruck',
    code: 'HANDPALLETTRUCK',
    site_id: DEMO_SITE_RTM,
    quantity: 15,
    status: 'active',
  },
]

// ── Employees ─────────────────────────────────────────────────────────────────

export const demoEmployees = [
  {
    id: 'demo-emp-0000-0000-0000-000000000001',
    employee_number: 'AMS-001',
    first_name: 'Lars',
    last_name: 'van den Berg',
    email: 'l.vandenberg@astrademo.nl',
    contract_type: 'full_time',
    weekly_hours_contracted: 40,
    home_site_id: DEMO_SITE_AMS,
    department_id: DEPT_OUTBOUND_AMS,
    crew_id: null,
    job_role_id: ROLE_ORDERPICKER,
    hourly_rate: 14.5,
    status: 'active',
    is_multi_site_eligible: false,
    skill_count: 2,
    skills: [
      { id: 'demo-skl-001', process_id: PROC_ORDER_PICKING, process_name: 'Order Picking', proficiency_level: 4, certification_date: null, expiry_date: null, last_practiced_date: null },
      { id: 'demo-skl-002', process_id: PROC_INBOUND, process_name: 'Inbound Receiving', proficiency_level: 2, certification_date: null, expiry_date: null, last_practiced_date: null },
    ],
    availability_overrides: [],
    preferences_json: {},
  },
  {
    id: 'demo-emp-0000-0000-0000-000000000002',
    employee_number: 'AMS-002',
    first_name: 'Sanne',
    last_name: 'Bakker',
    email: 's.bakker@astrademo.nl',
    contract_type: 'full_time',
    weekly_hours_contracted: 40,
    home_site_id: DEMO_SITE_AMS,
    department_id: DEPT_OUTBOUND_AMS,
    crew_id: null,
    job_role_id: ROLE_TEAMLEIDER,
    hourly_rate: 18.0,
    status: 'active',
    is_multi_site_eligible: true,
    skill_count: 2,
    skills: [
      { id: 'demo-skl-003', process_id: PROC_ORDER_PICKING, process_name: 'Order Picking', proficiency_level: 5, certification_date: null, expiry_date: null, last_practiced_date: null },
      { id: 'demo-skl-004', process_id: PROC_INBOUND, process_name: 'Inbound Receiving', proficiency_level: 4, certification_date: null, expiry_date: null, last_practiced_date: null },
    ],
    availability_overrides: [],
    preferences_json: {},
  },
  {
    id: 'demo-emp-0000-0000-0000-000000000003',
    employee_number: 'AMS-003',
    first_name: 'Joost',
    last_name: 'Hendriks',
    email: 'j.hendriks@astrademo.nl',
    contract_type: 'part_time',
    weekly_hours_contracted: 24,
    home_site_id: DEMO_SITE_AMS,
    department_id: DEPT_INBOUND_AMS,
    crew_id: null,
    job_role_id: ROLE_LOG_MED,
    hourly_rate: 13.5,
    status: 'active',
    is_multi_site_eligible: false,
    skill_count: 1,
    skills: [
      { id: 'demo-skl-005', process_id: PROC_INBOUND, process_name: 'Inbound Receiving', proficiency_level: 3, certification_date: null, expiry_date: null, last_practiced_date: null },
    ],
    availability_overrides: [],
    preferences_json: {},
  },
  {
    id: 'demo-emp-0000-0000-0000-000000000004',
    employee_number: 'AMS-004',
    first_name: 'Femke',
    last_name: 'de Vries',
    email: 'f.devries@astrademo.nl',
    contract_type: 'full_time',
    weekly_hours_contracted: 40,
    home_site_id: DEMO_SITE_AMS,
    department_id: DEPT_OUTBOUND_AMS,
    crew_id: null,
    job_role_id: ROLE_ORDERPICKER,
    hourly_rate: 14.5,
    status: 'active',
    is_multi_site_eligible: false,
    skill_count: 1,
    skills: [
      { id: 'demo-skl-006', process_id: PROC_ORDER_PICKING, process_name: 'Order Picking', proficiency_level: 3, certification_date: null, expiry_date: null, last_practiced_date: null },
    ],
    availability_overrides: [],
    preferences_json: {},
  },
  {
    id: 'demo-emp-0000-0000-0000-000000000005',
    employee_number: 'AMS-005',
    first_name: 'Daan',
    last_name: 'Meijer',
    email: 'd.meijer@astrademo.nl',
    contract_type: 'full_time',
    weekly_hours_contracted: 40,
    home_site_id: DEMO_SITE_AMS,
    department_id: DEPT_OUTBOUND_AMS,
    crew_id: null,
    job_role_id: ROLE_ORDERPICKER,
    hourly_rate: 14.5,
    status: 'active',
    is_multi_site_eligible: false,
    skill_count: 2,
    skills: [
      { id: 'demo-skl-007', process_id: PROC_ORDER_PICKING, process_name: 'Order Picking', proficiency_level: 4, certification_date: null, expiry_date: null, last_practiced_date: null },
      { id: 'demo-skl-008', process_id: PROC_INBOUND, process_name: 'Inbound Receiving', proficiency_level: 2, certification_date: null, expiry_date: null, last_practiced_date: null },
    ],
    availability_overrides: [],
    preferences_json: {},
  },
  {
    id: 'demo-emp-0000-0000-0000-000000000006',
    employee_number: 'RTM-001',
    first_name: 'Nina',
    last_name: 'Smit',
    email: 'n.smit@astrademo.nl',
    contract_type: 'full_time',
    weekly_hours_contracted: 40,
    home_site_id: DEMO_SITE_RTM,
    department_id: DEPT_INBOUND_RTM,
    crew_id: null,
    job_role_id: ROLE_TEAMLEIDER,
    hourly_rate: 18.5,
    status: 'active',
    is_multi_site_eligible: true,
    skill_count: 1,
    skills: [
      { id: 'demo-skl-009', process_id: PROC_INBOUND, process_name: 'Inbound Receiving', proficiency_level: 5, certification_date: null, expiry_date: null, last_practiced_date: null },
    ],
    availability_overrides: [],
    preferences_json: {},
  },
  {
    id: 'demo-emp-0000-0000-0000-000000000007',
    employee_number: 'RTM-002',
    first_name: 'Tom',
    last_name: 'Janssen',
    email: 't.janssen@astrademo.nl',
    contract_type: 'full_time',
    weekly_hours_contracted: 40,
    home_site_id: DEMO_SITE_RTM,
    department_id: DEPT_INBOUND_RTM,
    crew_id: null,
    job_role_id: ROLE_LOG_MED,
    hourly_rate: 13.5,
    status: 'active',
    is_multi_site_eligible: false,
    skill_count: 1,
    skills: [
      { id: 'demo-skl-010', process_id: PROC_INBOUND, process_name: 'Inbound Receiving', proficiency_level: 3, certification_date: null, expiry_date: null, last_practiced_date: null },
    ],
    availability_overrides: [],
    preferences_json: {},
  },
  {
    id: 'demo-emp-0000-0000-0000-000000000008',
    employee_number: 'RTM-003',
    first_name: 'Anouk',
    last_name: 'Visser',
    email: 'a.visser@astrademo.nl',
    contract_type: 'flex',
    weekly_hours_contracted: 20,
    home_site_id: DEMO_SITE_RTM,
    department_id: DEPT_INBOUND_RTM,
    crew_id: null,
    job_role_id: ROLE_LOG_MED,
    hourly_rate: 13.5,
    status: 'active',
    is_multi_site_eligible: false,
    skill_count: 1,
    skills: [
      { id: 'demo-skl-011', process_id: PROC_INBOUND, process_name: 'Inbound Receiving', proficiency_level: 2, certification_date: null, expiry_date: null, last_practiced_date: null },
    ],
    availability_overrides: [],
    preferences_json: {},
  },
  {
    id: 'demo-emp-0000-0000-0000-000000000009',
    employee_number: 'AMS-006',
    first_name: 'Bram',
    last_name: 'Lammers',
    email: 'b.lammers@astrademo.nl',
    contract_type: 'part_time',
    weekly_hours_contracted: 32,
    home_site_id: DEMO_SITE_AMS,
    department_id: DEPT_INBOUND_AMS,
    crew_id: null,
    job_role_id: ROLE_LOG_MED,
    hourly_rate: 13.5,
    status: 'active',
    is_multi_site_eligible: false,
    skill_count: 1,
    skills: [
      { id: 'demo-skl-012', process_id: PROC_INBOUND, process_name: 'Inbound Receiving', proficiency_level: 3, certification_date: null, expiry_date: null, last_practiced_date: null },
    ],
    availability_overrides: [],
    preferences_json: {},
  },
  {
    id: 'demo-emp-0000-0000-0000-000000000010',
    employee_number: 'AMS-007',
    first_name: 'Eva',
    last_name: 'Koopman',
    email: 'e.koopman@astrademo.nl',
    contract_type: 'full_time',
    weekly_hours_contracted: 40,
    home_site_id: DEMO_SITE_AMS,
    department_id: DEPT_OUTBOUND_AMS,
    crew_id: null,
    job_role_id: ROLE_ORDERPICKER,
    hourly_rate: 14.5,
    status: 'active',
    is_multi_site_eligible: true,
    skill_count: 2,
    skills: [
      { id: 'demo-skl-013', process_id: PROC_ORDER_PICKING, process_name: 'Order Picking', proficiency_level: 4, certification_date: null, expiry_date: null, last_practiced_date: null },
      { id: 'demo-skl-014', process_id: PROC_INBOUND, process_name: 'Inbound Receiving', proficiency_level: 3, certification_date: null, expiry_date: null, last_practiced_date: null },
    ],
    availability_overrides: [],
    preferences_json: {},
  },
]

// ── Convenient groupings ───────────────────────────────────────────────────────

export const demoEmployeesBysite = {
  [DEMO_SITE_AMS]: demoEmployees.filter((e) => e.home_site_id === DEMO_SITE_AMS),
  [DEMO_SITE_RTM]: demoEmployees.filter((e) => e.home_site_id === DEMO_SITE_RTM),
}

export const demoShiftsBySite = {
  [DEMO_SITE_AMS]: demoShifts.filter((s) => s.site_id === DEMO_SITE_AMS),
  [DEMO_SITE_RTM]: demoShifts.filter((s) => s.site_id === DEMO_SITE_RTM),
}

export const demoDepartmentsBySite = {
  [DEMO_SITE_AMS]: demoDepartments.filter((d) => d.site_id === DEMO_SITE_AMS),
  [DEMO_SITE_RTM]: demoDepartments.filter((d) => d.site_id === DEMO_SITE_RTM),
}
