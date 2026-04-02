/**
 * Demo seed data for AstraPlanner's demo mode.
 *
 * This is the barrel file — re-exports expanded data from split modules
 * while maintaining backward compatibility for all existing imports.
 */

// ── Re-export: IDs & processes ───────────────────────────────────────────────

export {
  DEMO_SITE_AMS,
  DEMO_SITE_RTM,
  DEPT_INBOUND_AMS,
  DEPT_OUTBOUND_AMS,
  DEPT_INBOUND_RTM,
  DEPT_VAS_AMS,
  DEPT_SHIPPING_AMS,
  ROLE_ORDERPICKER,
  ROLE_TEAMLEIDER,
  ROLE_LOG_MED,
  ROLE_INPAKKER,
  ROLE_VERZENDMEDEWERKER,
  PROC_ORDER_PICKING,
  PROC_INBOUND,
  PROC_PACKING,
  PROC_VAS,
  PROC_SHIPPING,
  PROC_RETURNS,
  demoDepartments,
  demoDepartmentsBySite,
  demoRoles,
  demoProcesses,
} from './demo-seed-processes'

// ── Re-export: employees ─────────────────────────────────────────────────────

export {
  demoEmployees,
  demoEmployeesBySite,
} from './demo-seed-employees'

// ── Re-export: demand & workload ─────────────────────────────────────────────

export {
  demoDemandForecasts,
  demoWorkloadRows,
  demoHeatmapCells,
  DEMO_WEEKS,
  DEMO_WEEK_10,
  DEMO_WEEK_11,
  DEMO_WEEK_12,
  DEMO_WEEK_13,
} from './demo-seed-demand'

// ── Re-export: plans & scenarios ─────────────────────────────────────────────

export {
  demoPlanVersions,
  demoPlanNormal,
  demoPlanPeak,
  demoPlanAbsence,
  getDemoPlan,
  DEMO_PLAN_NORMAL,
  DEMO_PLAN_PEAK,
  DEMO_PLAN_ABSENCE,
} from './demo-seed-plans'

// ── ID constant (backward compat) ───────────────────────────────────────────

import { DEMO_SITE_AMS, DEMO_SITE_RTM } from './demo-seed-processes'

export const DEMO_ORG_ID = 'demo-org-00000000-0000-0000-0000-000000000001'

// ── Organization ─────────────────────────────────────────────────────────────

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

// ── Sites ────────────────────────────────────────────────────────────────────

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

// ── Shifts ───────────────────────────────────────────────────────────────────

export const demoShifts = [
  // Amsterdam DC
  {
    id: 'demo-shft-0000-0000-0000-000000000001',
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
    id: 'demo-shft-0000-0000-0000-000000000002',
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
    id: 'demo-shft-0000-0000-0000-000000000003',
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
    id: 'demo-shft-0000-0000-0000-000000000004',
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
    id: 'demo-shft-0000-0000-0000-000000000005',
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
    id: 'demo-shft-0000-0000-0000-000000000006',
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

// ── Equipment ────────────────────────────────────────────────────────────────

export const demoEquipment = [
  { id: 'demo-equip-000-0000-0000-000000000001', name: 'Reachtruck', code: 'REACHTRUCK', site_id: DEMO_SITE_AMS, quantity: 6, status: 'active' },
  { id: 'demo-equip-000-0000-0000-000000000002', name: 'Orderpicktruck', code: 'ORDERPICKTRUCK', site_id: DEMO_SITE_AMS, quantity: 12, status: 'active' },
  { id: 'demo-equip-000-0000-0000-000000000003', name: 'Handpallettruck', code: 'HANDPALLETTRUCK', site_id: DEMO_SITE_AMS, quantity: 20, status: 'active' },
  { id: 'demo-equip-000-0000-0000-000000000004', name: 'Orderpicktruck', code: 'ORDERPICKTRUCK', site_id: DEMO_SITE_RTM, quantity: 8, status: 'active' },
  { id: 'demo-equip-000-0000-0000-000000000005', name: 'Handpallettruck', code: 'HANDPALLETTRUCK', site_id: DEMO_SITE_RTM, quantity: 15, status: 'active' },
]

// ── Convenient groupings ─────────────────────────────────────────────────────

export const demoShiftsBySite = {
  [DEMO_SITE_AMS]: demoShifts.filter((s) => s.site_id === DEMO_SITE_AMS),
  [DEMO_SITE_RTM]: demoShifts.filter((s) => s.site_id === DEMO_SITE_RTM),
}
