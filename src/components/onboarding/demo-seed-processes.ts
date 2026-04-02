/**
 * Extended demo seed data — processes, departments, and roles.
 * Shapes match tRPC router responses exactly (org.ts + workforce.ts).
 *
 * NOTE: This file is the authoritative source for site IDs so that
 * demo-seed.ts can later be refactored to import from here instead.
 */

// ── Site ID constants ─────────────────────────────────────────────────────────

export const DEMO_SITE_AMS = 'demo-site-0000-0000-0000-000000000001'
export const DEMO_SITE_RTM = 'demo-site-0000-0000-0000-000000000002'

// ── Department ID constants ───────────────────────────────────────────────────

export const DEPT_INBOUND_AMS = 'demo-dept-0000-0000-0000-000000000001'
export const DEPT_OUTBOUND_AMS = 'demo-dept-0000-0000-0000-000000000002'
export const DEPT_INBOUND_RTM = 'demo-dept-0000-0000-0000-000000000003'
export const DEPT_VAS_AMS = 'demo-dept-0000-0000-0000-000000000004'
export const DEPT_SHIPPING_AMS = 'demo-dept-0000-0000-0000-000000000005'

// ── Role ID constants ─────────────────────────────────────────────────────────

export const ROLE_ORDERPICKER = 'demo-role-0000-0000-0000-000000000001'
export const ROLE_TEAMLEIDER = 'demo-role-0000-0000-0000-000000000002'
export const ROLE_LOG_MED = 'demo-role-0000-0000-0000-000000000003'
export const ROLE_INPAKKER = 'demo-role-0000-0000-0000-000000000004'
export const ROLE_VERZENDMEDEWERKER = 'demo-role-0000-0000-0000-000000000005'

// ── Process ID constants ──────────────────────────────────────────────────────

export const PROC_ORDER_PICKING = 'demo-proc-0000-0000-0000-000000000001'
export const PROC_INBOUND = 'demo-proc-0000-0000-0000-000000000002'
export const PROC_PACKING = 'demo-proc-0000-0000-0000-000000000003'
export const PROC_VAS = 'demo-proc-0000-0000-0000-000000000004'
export const PROC_SHIPPING = 'demo-proc-0000-0000-0000-000000000005'
export const PROC_RETURNS = 'demo-proc-0000-0000-0000-000000000006'

// ── Departments ───────────────────────────────────────────────────────────────

export const demoDepartments = [
  {
    id: DEPT_INBOUND_AMS,
    name: 'Inbound AMS',
    code: 'INBOUND_AMS',
    color: 'indigo',
    site_id: DEMO_SITE_AMS,
    process_count: 2, // Inbound Receiving + Returns Processing
  },
  {
    id: DEPT_OUTBOUND_AMS,
    name: 'Outbound AMS',
    code: 'OUTBOUND_AMS',
    color: 'amber',
    site_id: DEMO_SITE_AMS,
    process_count: 2, // Order Picking + Packing
  },
  {
    id: DEPT_INBOUND_RTM,
    name: 'Inbound RTM',
    code: 'INBOUND_RTM',
    color: 'emerald',
    site_id: DEMO_SITE_RTM,
    process_count: 1,
  },
  {
    id: DEPT_VAS_AMS,
    name: 'VAS AMS',
    code: 'VAS_AMS',
    color: 'rose',
    site_id: DEMO_SITE_AMS,
    process_count: 1,
  },
  {
    id: DEPT_SHIPPING_AMS,
    name: 'Shipping AMS',
    code: 'SHIPPING_AMS',
    color: 'cyan',
    site_id: DEMO_SITE_AMS,
    process_count: 1,
  },
]

// ── Roles ─────────────────────────────────────────────────────────────────────

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
  {
    id: ROLE_INPAKKER,
    name: 'Inpakker',
    code: 'INPAKKER',
    color: 'rose',
  },
  {
    id: ROLE_VERZENDMEDEWERKER,
    name: 'Verzendmedewerker',
    code: 'VERZENDMEDEWERKER',
    color: 'cyan',
  },
]

// ── Processes ─────────────────────────────────────────────────────────────────

export const demoProcesses = [
  // ── Outbound AMS ────────────────────────────────────────────────────────────
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
    id: PROC_PACKING,
    name: 'Packing',
    code: 'PACKING',
    unit_of_measure: 'packs',
    norm_uph: 80,
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
    min_staffing: 2,
    max_staffing: 15,
    frequency_type: 'daily',
    frequency_days: null,
    frequency_count: null,
    duration_type: 'full_shift',
    duration_hours: null,
  },

  // ── Inbound AMS ─────────────────────────────────────────────────────────────
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
  {
    id: PROC_RETURNS,
    name: 'Returns Processing',
    code: 'RETURNS_PROCESSING',
    unit_of_measure: 'returns',
    norm_uph: 30,
    department_id: DEPT_INBOUND_AMS,
    process_type: 'productive',
    support_type: null,
    parent_process_id: null,
    support_ratio_self: 1,
    support_ratio_parent: 1,
    fixed_headcount: null,
    support_method: null,
    support_config_json: {},
    priority: 'normal',
    min_skill_level: 1,
    certifications_required: [],
    conversion_input_uom: null,
    conversion_output_qty: null,
    restrict_to_trained: false,
    min_staffing: 1,
    max_staffing: 6,
    frequency_type: 'daily',
    frequency_days: null,
    frequency_count: null,
    duration_type: 'full_shift',
    duration_hours: null,
  },

  // ── VAS AMS ──────────────────────────────────────────────────────────────────
  {
    id: PROC_VAS,
    name: 'VAS',
    code: 'VAS',
    unit_of_measure: 'items',
    norm_uph: 40,
    department_id: DEPT_VAS_AMS,
    process_type: 'productive',
    support_type: null,
    parent_process_id: null,
    support_ratio_self: 1,
    support_ratio_parent: 1,
    fixed_headcount: null,
    support_method: null,
    support_config_json: {},
    priority: 'normal',
    min_skill_level: 1,
    certifications_required: [],
    conversion_input_uom: null,
    conversion_output_qty: null,
    restrict_to_trained: false,
    min_staffing: 1,
    max_staffing: 8,
    frequency_type: 'daily',
    frequency_days: null,
    frequency_count: null,
    duration_type: 'full_shift',
    duration_hours: null,
  },

  // ── Shipping AMS ─────────────────────────────────────────────────────────────
  {
    id: PROC_SHIPPING,
    name: 'Shipping',
    code: 'SHIPPING',
    unit_of_measure: 'shipments',
    norm_uph: 60,
    department_id: DEPT_SHIPPING_AMS,
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
    max_staffing: 12,
    frequency_type: 'daily',
    frequency_days: null,
    frequency_count: null,
    duration_type: 'full_shift',
    duration_hours: null,
  },
]

// ── Convenient groupings ───────────────────────────────────────────────────────

export const demoDepartmentsBySite = {
  [DEMO_SITE_AMS]: demoDepartments.filter((d) => d.site_id === DEMO_SITE_AMS),
  [DEMO_SITE_RTM]: demoDepartments.filter((d) => d.site_id === DEMO_SITE_RTM),
}
