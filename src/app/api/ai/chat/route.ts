import { anthropic } from '@ai-sdk/anthropic'
import {
  convertToModelMessages,
  streamText,
  tool,
  stepCountIs,
  type UIMessage,
} from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClientForUser } from '@/lib/supabase/admin'
import { anonymizeEmployees, buildPseudonymMap, pseudonymFor } from '@/lib/ai/anonymizer'
import { enforceRateLimit, identifierFor } from '@/lib/rate-limit'

export async function POST(req: Request) {
  /* ── Auth ─────────────────────────────────────────────────── */
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const orgId: string | undefined =
    (user.app_metadata?.organization_id as string) ?? undefined

  if (!orgId) {
    return new Response('No organization found', { status: 400 })
  }

  /* ── Rate limit ───────────────────────────────────────────── */
  const rateLimitResponse = await enforceRateLimit(
    'ai',
    identifierFor({ userId: user.id, headers: req.headers }),
  )
  if (rateLimitResponse) return rateLimitResponse

  /* ── Body ─────────────────────────────────────────────────── */
  const { messages }: { messages: UIMessage[] } = await req.json()

  const admin = createAdminClientForUser(user.id)

  /* ── Tools ────────────────────────────────────────────────── */
  const tools = {
    createSite: tool({
      description:
        'Maak een nieuwe site (vestiging) aan voor de organisatie.',
      inputSchema: z.object({
        name: z.string().describe('Naam van de site'),
        code: z.string().max(20).describe('Unieke korte code'),
        timezone: z.string().describe('IANA timezone, bijv. Europe/Amsterdam'),
      }),
      execute: async ({ name, code, timezone }) => {
        const { data, error } = await admin
          .from('site')
          .insert({
            organization_id: orgId,
            name,
            code,
            timezone,
            site_type: 'warehouse',
            address_line1: '-',
            city: '-',
            postal_code: '-',
            country_code: 'NL',
            operating_hours_json: {},
            settings_json: {},
          })
          .select('id, name, code')
          .single()

        if (error) return { success: false, error: error.message }
        return { success: true, site: data }
      },
    }),

    createShift: tool({
      description:
        'Maak een nieuwe shift (dienst) aan, gekoppeld aan een site.',
      inputSchema: z.object({
        name: z.string().describe('Naam van de dienst'),
        code: z.string().max(20).describe('Unieke korte code'),
        start_time: z
          .string()
          .describe('Starttijd in HH:MM formaat, bijv. 06:00'),
        end_time: z
          .string()
          .describe('Eindtijd in HH:MM formaat, bijv. 14:00'),
        site_id: z.string().uuid().describe('UUID van de site'),
      }),
      execute: async ({ name, code, start_time, end_time, site_id }) => {
        // Calculate duration
        const sParts = start_time.split(':').map(Number)
        const eParts = end_time.split(':').map(Number)
        const sh = sParts[0] ?? 0
        const sm = sParts[1] ?? 0
        const eh = eParts[0] ?? 0
        const em = eParts[1] ?? 0
        let durationMin = (eh * 60 + em) - (sh * 60 + sm)
        if (durationMin <= 0) durationMin += 24 * 60 // overnight
        const durationHours = +(durationMin / 60).toFixed(2)

        const { data, error } = await admin
          .from('shift_pattern')
          .insert({
            organization_id: orgId,
            name,
            code,
            start_time,
            end_time,
            duration_hours: durationHours,
            paid_hours: durationHours,
            break_rules_json: {},
            days_of_week: [1, 2, 3, 4, 5],
            is_overnight: durationMin > 12 * 60 || (eh * 60 + em) < (sh * 60 + sm),
            site_id,
          })
          .select('id, name, code, start_time, end_time')
          .single()

        if (error) return { success: false, error: error.message }
        return { success: true, shift: data }
      },
    }),

    createRole: tool({
      description: 'Maak een nieuwe job role (functie) aan.',
      inputSchema: z.object({
        name: z.string().describe('Naam van de rol, bijv. Orderpicker'),
        code: z.string().max(20).describe('Unieke korte code, bijv. OP'),
        site_id: z.string().uuid().describe('UUID van de site'),
      }),
      execute: async ({ name, code, site_id }) => {
        const { data, error } = await admin
          .from('job_role')
          .insert({
            organization_id: orgId,
            site_id,
            name,
            code,
          })
          .select('id, name, code')
          .single()

        if (error) return { success: false, error: error.message }
        return { success: true, role: data }
      },
    }),

    createProcess: tool({
      description:
        'Maak een nieuw proces aan, gekoppeld aan een afdeling.',
      inputSchema: z.object({
        name: z.string().describe('Naam van het proces, bijv. Orderpicken'),
        code: z.string().max(30).describe('Unieke code, bijv. PICK'),
        site_id: z.string().uuid().describe('UUID van de site'),
      }),
      execute: async ({ name, code, site_id }) => {
        // Find first department for this site to attach the process to
        const { data: depts } = await admin
          .from('department')
          .select('id')
          .eq('site_id', site_id)
          .eq('organization_id', orgId)
          .eq('status', 'active')
          .limit(1)

        const departmentId =
          depts && depts.length > 0
            ? (depts[0] as Record<string, unknown>).id
            : null

        const { data, error } = await admin
          .from('process')
          .insert({
            organization_id: orgId,
            department_id: departmentId,
            name,
            code,
            category: 'outbound',
            applicable_site_types: ['warehouse'],
            unit_of_measure: 'units',
            display_order: 0,
          })
          .select('id, name, code')
          .single()

        if (error) return { success: false, error: error.message }
        return { success: true, process: data }
      },
    }),

    addEmployee: tool({
      description: 'Voeg een nieuwe medewerker toe aan de organisatie.',
      inputSchema: z.object({
        first_name: z.string().describe('Voornaam'),
        last_name: z.string().describe('Achternaam'),
        email: z.string().email().optional().describe('Email adres (optioneel)'),
        department_id: z.string().optional().describe('Department UUID'),
        job_role_id: z.string().optional().describe('Job role UUID'),
        contract_type: z.enum(['full_time', 'part_time', 'temporary', 'seasonal', 'contractor']).default('full_time'),
        weekly_hours_contracted: z.number().default(40),
      }),
      execute: async (input) => {
        const { data: sites } = await admin
          .from('site')
          .select('id')
          .eq('organization_id', orgId)
          .limit(1)

        const siteId = sites?.[0]?.id
        if (!siteId) return { error: 'Geen site gevonden. Maak eerst een site aan.' }

        const empNumber = (input.first_name[0] + input.last_name).toUpperCase().replace(/[^A-Z]/g, '').substring(0, 8) + Date.now().toString(36).slice(-4)

        const { data, error } = await admin
          .from('employee')
          .insert({
            organization_id: orgId,
            home_site_id: siteId,
            department_id: input.department_id ?? null,
            job_role_id: input.job_role_id ?? null,
            employee_number: empNumber,
            first_name: input.first_name,
            last_name: input.last_name,
            email: input.email ?? null,
            contract_type: input.contract_type,
            weekly_hours_contracted: input.weekly_hours_contracted,
            hire_date: new Date().toISOString().split('T')[0],
            status: 'active',
          })
          .select('id, first_name, last_name, employee_number')
          .single()

        if (error) return { error: error.message }
        // Strip PII before returning to the AI: the model only sees the pseudonym
        // and the (non-personal) employee_number. The actual name is persisted
        // in the database via the insert above.
        return {
          success: true,
          employee: data ? { ref: pseudonymFor(orgId, data.id), id: data.id, employee_number: data.employee_number } : null,
        }
      },
    }),

    listEmployees: tool({
      description: 'Toon alle medewerkers van de organisatie.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await admin
          .from('employee')
          .select('id, first_name, last_name, employee_number, contract_type, status')
          .eq('organization_id', orgId)
          .eq('status', 'active')
          .order('last_name')
          .limit(50)

        if (error) return { error: error.message }
        // PII redaction: replace first_name/last_name/full_name with a stable
        // per-org pseudonym before the result is fed back to Claude.
        return { employees: anonymizeEmployees(orgId, data), count: data?.length ?? 0 }
      },
    }),

    addDepartment: tool({
      description: 'Maak een nieuw department/afdeling aan.',
      inputSchema: z.object({
        name: z.string().describe('Naam van het department, bijv. Inbound, Outbound'),
        site_id: z.string().optional().describe('Site UUID (optioneel, pakt anders de eerste site)'),
      }),
      execute: async (input) => {
        let siteId = input.site_id
        if (!siteId) {
          const { data: sites } = await admin.from('site').select('id').eq('organization_id', orgId).limit(1)
          siteId = sites?.[0]?.id
        }
        if (!siteId) return { error: 'Geen site gevonden.' }

        const code = input.name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 20)

        const { data, error } = await admin
          .from('department')
          .insert({
            organization_id: orgId,
            site_id: siteId,
            name: input.name,
            code,
            status: 'active',
          })
          .select('id, name, code')
          .single()

        if (error) return { error: error.message }
        return { success: true, department: data }
      },
    }),

    addDemandForecast: tool({
      description: 'Voeg demand/volume toe voor een proces voor een specifieke dag.',
      inputSchema: z.object({
        process_id: z.string().describe('Process UUID'),
        date: z.string().describe('ISO datum, bijv. 2026-03-30'),
        volume: z.number().describe('Verwacht volume'),
      }),
      execute: async (input) => {
        const { data: proc } = await admin.from('process').select('unit_of_measure').eq('id', input.process_id).single()
        const { data: sites } = await admin.from('site').select('id').eq('organization_id', orgId).limit(1)
        const siteId = sites?.[0]?.id
        if (!siteId) return { error: 'Geen site gevonden.' }

        const nextDay = new Date(input.date + 'T00:00:00Z')
        nextDay.setUTCDate(nextDay.getUTCDate() + 1)

        const { data, error } = await admin.from('demand_forecast').insert({
          organization_id: orgId,
          site_id: siteId,
          process_id: input.process_id,
          period_start: input.date,
          period_end: nextDay.toISOString().split('T')[0],
          volume: input.volume,
          unit_of_measure: proc?.unit_of_measure ?? 'units',
          source: 'manual_entry',
        }).select('id').single()

        if (error) return { error: error.message }
        return { success: true, forecast_id: data?.id }
      },
    }),

    // ── Tier 1: List tools ──────────────────────────────────────────────
    listSites: tool({
      description: 'Toon alle sites/vestigingen.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await admin.from('site').select('id, name, code, city, timezone, status').eq('organization_id', orgId).order('name')
        return { sites: data ?? [] }
      },
    }),

    listShifts: tool({
      description: 'Toon alle shifts/diensten.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await admin.from('shift_pattern').select('id, name, code, start_time, end_time, duration_hours, shift_type').eq('organization_id', orgId).eq('is_active', true).order('start_time')
        return { shifts: data ?? [] }
      },
    }),

    listRoles: tool({
      description: 'Toon alle job rollen.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await admin.from('job_role').select('id, name, code, role_type, productive_pct').eq('organization_id', orgId).order('name')
        return { roles: data ?? [] }
      },
    }),

    listProcesses: tool({
      description: 'Toon alle processen met norm UPH en eenheid.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await admin.from('process').select('id, name, code, unit_of_measure, norm_uph, process_type, department_id').eq('organization_id', orgId).eq('is_active', true).order('name')
        return { processes: data ?? [] }
      },
    }),

    listDepartments: tool({
      description: 'Toon alle afdelingen/departments.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await admin.from('department').select('id, name, code, site_id').eq('organization_id', orgId).eq('status', 'active').order('name')
        return { departments: data ?? [] }
      },
    }),

    // ── Tier 1: Mutations ─────────────────────────────────────────────
    assignSkill: tool({
      description: 'Wijs een skill/vaardigheid toe aan een medewerker voor een proces (niveau 1-5).',
      inputSchema: z.object({
        employee_id: z.string().describe('Employee UUID'),
        process_id: z.string().describe('Process UUID'),
        proficiency_level: z.number().min(1).max(5).describe('Vaardigheidsniveau 1-5'),
      }),
      execute: async (input) => {
        const { data, error } = await admin.from('employee_skill').upsert({
          organization_id: orgId, employee_id: input.employee_id, process_id: input.process_id,
          proficiency_level: input.proficiency_level, status: 'active',
        }, { onConflict: 'organization_id,employee_id,process_id' }).select('id').single()
        if (error) return { error: error.message }
        return { success: true, skill_id: data?.id }
      },
    }),

    assignCrew: tool({
      description: 'Wijs een medewerker toe aan een ploeg/crew.',
      inputSchema: z.object({
        employee_id: z.string().describe('Employee UUID'),
        crew_id: z.string().describe('Crew UUID'),
      }),
      execute: async (input) => {
        const { error } = await admin.from('employee').update({ crew_id: input.crew_id }).eq('id', input.employee_id).eq('organization_id', orgId)
        if (error) return { error: error.message }
        return { success: true }
      },
    }),

    bulkAddEmployees: tool({
      description: 'Voeg meerdere medewerkers tegelijk toe. Geef een lijst van namen.',
      inputSchema: z.object({
        employees: z.array(z.object({
          first_name: z.string(),
          last_name: z.string(),
          contract_type: z.enum(['full_time', 'part_time', 'temporary', 'seasonal', 'contractor']).default('full_time'),
        })).min(1).max(50),
      }),
      execute: async (input) => {
        const { data: sites } = await admin.from('site').select('id').eq('organization_id', orgId).limit(1)
        const siteId = sites?.[0]?.id
        if (!siteId) return { error: 'Geen site gevonden.' }

        const rows = input.employees.map((e, i) => ({
          organization_id: orgId, home_site_id: siteId,
          employee_number: (e.first_name[0] + e.last_name).toUpperCase().replace(/[^A-Z]/g, '').substring(0, 8) + Date.now().toString(36).slice(-3) + i,
          first_name: e.first_name, last_name: e.last_name,
          contract_type: e.contract_type, weekly_hours_contracted: 40,
          hire_date: new Date().toISOString().split('T')[0], status: 'active',
        }))

        const { data, error } = await admin.from('employee').insert(rows).select('id, first_name, last_name')
        if (error) return { error: error.message }
        // PII redaction on the response: only the pseudonym is sent back to Claude.
        return {
          success: true,
          added: data?.length ?? 0,
          employees: anonymizeEmployees(orgId, data),
        }
      },
    }),

    // ── Tier 2: Analysis ──────────────────────────────────────────────
    analyzeCapacity: tool({
      description: 'Analyseer de capaciteit: hoeveel FTE is nodig vs beschikbaar per proces.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data: wp } = await admin.from('workload_plan').select('process_id, demand_volume, hours_needed, fte_needed, hours_assigned, fte_assigned, coverage_pct').eq('organization_id', orgId)
        if (!wp || wp.length === 0) return { message: 'Geen workload data. Klik eerst op "Herbereken" in het FTE Dashboard.' }

        const byProcess = new Map<string, { demand: number; hours_needed: number; fte_needed: number; fte_available: number; coverage: number; count: number }>()
        for (const r of wp) {
          const pid = r.process_id as string
          const existing = byProcess.get(pid) ?? { demand: 0, hours_needed: 0, fte_needed: 0, fte_available: 0, coverage: 0, count: 0 }
          existing.demand += Number(r.demand_volume ?? 0)
          existing.hours_needed += Number(r.hours_needed ?? 0)
          existing.fte_needed += Number(r.fte_needed ?? 0)
          existing.fte_available += Number(r.hours_assigned ?? 0) / 40
          existing.coverage += Number(r.coverage_pct ?? 0)
          existing.count++
          byProcess.set(pid, existing)
        }

        const { data: procs } = await admin.from('process').select('id, name').eq('organization_id', orgId)
        const procNames = Object.fromEntries((procs ?? []).map(p => [p.id, p.name]))

        const analysis = [...byProcess.entries()].map(([pid, d]) => ({
          process: procNames[pid] ?? pid,
          total_demand: Math.round(d.demand),
          total_hours_needed: Math.round(d.hours_needed),
          fte_needed: Math.round(d.fte_needed * 10) / 10,
          fte_available: Math.round(d.fte_available * 10) / 10,
          gap: Math.round((d.fte_available - d.fte_needed) * 10) / 10,
          avg_coverage: d.count > 0 ? Math.round(d.coverage / d.count) : 0,
        }))

        return { analysis, summary: `${analysis.length} processen geanalyseerd` }
      },
    }),

    analyzeSkillGaps: tool({
      description: 'Identificeer welke processen te weinig getrainde medewerkers hebben.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data: procs } = await admin.from('process').select('id, name, norm_uph').eq('organization_id', orgId).eq('is_active', true)
        const { data: skills } = await admin.from('employee_skill').select('process_id, proficiency_level').eq('organization_id', orgId).eq('status', 'active')

        const skillCountByProcess = new Map<string, number>()
        for (const s of skills ?? []) {
          const pid = s.process_id as string
          skillCountByProcess.set(pid, (skillCountByProcess.get(pid) ?? 0) + 1)
        }

        const gaps = (procs ?? []).map(p => ({
          process: p.name as string,
          process_id: p.id as string,
          skilled_employees: skillCountByProcess.get(p.id as string) ?? 0,
          norm_uph: p.norm_uph as number,
        })).sort((a, b) => a.skilled_employees - b.skilled_employees)

        return { gaps, worst: gaps.filter(g => g.skilled_employees === 0).map(g => g.process) }
      },
    }),

    whatIfScenario: tool({
      description: 'Bereken het effect van extra medewerkers op een proces. "Wat als ik 2 extra pickers aanneem?"',
      inputSchema: z.object({
        process_id: z.string().describe('Process UUID'),
        additional_employees: z.number().min(1).describe('Aantal extra medewerkers'),
        skill_level: z.number().min(1).max(5).default(3).describe('Verwacht skill niveau'),
      }),
      execute: async (input) => {
        const { data: proc } = await admin.from('process').select('name, norm_uph').eq('id', input.process_id).single()
        const { data: wp } = await admin.from('workload_plan').select('fte_needed, fte_assigned, coverage_pct').eq('process_id', input.process_id).eq('organization_id', orgId)

        const currentFteNeeded = (wp ?? []).reduce((s, r) => s + Number(r.fte_needed ?? 0), 0) / Math.max((wp ?? []).length, 1)
        const currentFteAvail = (wp ?? []).reduce((s, r) => s + Number(r.fte_assigned ?? 0) / 40, 0) / Math.max((wp ?? []).length, 1)
        const newFteAvail = currentFteAvail + input.additional_employees
        const newCoverage = currentFteNeeded > 0 ? Math.round((newFteAvail / currentFteNeeded) * 100) : 100

        return {
          process: proc?.name ?? input.process_id,
          current: { fte_needed: Math.round(currentFteNeeded * 10) / 10, fte_available: Math.round(currentFteAvail * 10) / 10, coverage: Math.round((currentFteAvail / Math.max(currentFteNeeded, 0.1)) * 100) },
          after_adding: { fte_available: Math.round(newFteAvail * 10) / 10, coverage: newCoverage },
          improvement: `+${input.additional_employees} medewerkers → coverage van ${Math.round((currentFteAvail / Math.max(currentFteNeeded, 0.1)) * 100)}% naar ${newCoverage}%`,
        }
      },
    }),

    // ── Tier 3: Actions ───────────────────────────────────────────────
    generateWeekSummary: tool({
      description: 'Genereer een samenvatting van de workload voor een bepaalde week.',
      inputSchema: z.object({
        week_start: z.string().optional().describe('Maandag ISO datum (bijv. 2026-03-23). Leeg = huidige week.'),
      }),
      execute: async (input) => {
        const start = input.week_start ?? new Date().toISOString().split('T')[0]
        const { data: wp } = await admin.from('workload_plan').select('process_id, demand_volume, hours_needed, fte_needed, hours_assigned, coverage_pct, status').eq('organization_id', orgId).gte('period_start', start)

        if (!wp || wp.length === 0) return { message: 'Geen workload data voor deze periode. Voer eerst demand in en klik "Herbereken".' }

        const { data: procs } = await admin.from('process').select('id, name').eq('organization_id', orgId)
        const procNames = Object.fromEntries((procs ?? []).map(p => [p.id, p.name]))

        const totalDemand = wp.reduce((s, r) => s + Number(r.demand_volume ?? 0), 0)
        const totalHours = wp.reduce((s, r) => s + Number(r.hours_needed ?? 0), 0)
        const totalFteNeeded = wp.reduce((s, r) => s + Number(r.fte_needed ?? 0), 0)

        const issues = wp.filter(r => Number(r.coverage_pct ?? 0) < 70).map(r => ({
          process: procNames[r.process_id as string] ?? 'Onbekend',
          coverage: r.coverage_pct,
        }))

        return { period: start, total_demand: Math.round(totalDemand), total_hours: Math.round(totalHours), total_fte_needed: Math.round(totalFteNeeded * 10) / 10, records: wp.length, critical_issues: issues }
      },
    }),

    suggestOptimization: tool({
      description: 'Analyseer de huidige situatie en geef optimalisatieadvies.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data: wp } = await admin.from('workload_plan').select('process_id, fte_needed, hours_assigned, coverage_pct').eq('organization_id', orgId)
        const { data: skills } = await admin.from('employee_skill').select('employee_id, process_id').eq('organization_id', orgId).eq('status', 'active')
        const { data: emps } = await admin.from('employee').select('id').eq('organization_id', orgId).eq('status', 'active')
        const { data: procs } = await admin.from('process').select('id, name').eq('organization_id', orgId).eq('is_active', true)
        const procNames = Object.fromEntries((procs ?? []).map(p => [p.id, p.name]))

        const recommendations: string[] = []

        // Understaffed processes
        const understaffed = (wp ?? []).filter(r => Number(r.coverage_pct ?? 0) < 80)
        if (understaffed.length > 0) {
          const processNames = [...new Set(understaffed.map(r => procNames[r.process_id as string] ?? 'Onbekend'))]
          recommendations.push(`⚠️ ${processNames.join(', ')} ${processNames.length === 1 ? 'heeft' : 'hebben'} een dekkingstekort (<80%). Overweeg extra medewerkers of cross-training.`)
        }

        // Overstaffed processes
        const overstaffed = (wp ?? []).filter(r => Number(r.coverage_pct ?? 0) > 120)
        if (overstaffed.length > 0) {
          const processNames = [...new Set(overstaffed.map(r => procNames[r.process_id as string] ?? 'Onbekend'))]
          recommendations.push(`📈 ${processNames.join(', ')} ${processNames.length === 1 ? 'is' : 'zijn'} overstaffed (>120%). Je kunt medewerkers herplaatsen naar processen met een tekort.`)
        }

        // Single-skilled employees
        const skillsPerEmployee = new Map<string, number>()
        for (const s of skills ?? []) { skillsPerEmployee.set(s.employee_id as string, (skillsPerEmployee.get(s.employee_id as string) ?? 0) + 1) }
        const singleSkilled = [...skillsPerEmployee.entries()].filter(([, count]) => count <= 1).length
        const totalEmps = emps?.length ?? 0
        if (singleSkilled > 0 && totalEmps > 0) {
          recommendations.push(`🎯 ${singleSkilled} van ${totalEmps} medewerkers heeft slechts 1 skill. Cross-training verhoogt je flexibiliteit.`)
        }

        // No skills at all
        const empsWithSkills = new Set([...(skills ?? []).map(s => s.employee_id)])
        const empsWithout = totalEmps - empsWithSkills.size
        if (empsWithout > 0) {
          recommendations.push(`📋 ${empsWithout} medewerkers hebben nog geen skills toegewezen. Wijs skills toe voor betere planning.`)
        }

        if (recommendations.length === 0) {
          recommendations.push('✅ Je planning ziet er goed uit! Alle processen hebben voldoende dekking.')
        }

        return { recommendations, total_employees: totalEmps, total_processes: procs?.length ?? 0 }
      },
    }),

    crossTrainSuggestion: tool({
      description: 'Geef suggesties voor cross-training: welke medewerkers moeten welke extra skills leren.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data: skills } = await admin.from('employee_skill').select('employee_id, process_id, proficiency_level').eq('organization_id', orgId).eq('status', 'active')
        // PII redaction: we only need the employee id here, not first/last name.
        // The id is used to derive a stable per-org pseudonym below.
        const { data: emps } = await admin.from('employee').select('id').eq('organization_id', orgId).eq('status', 'active')
        const { data: procs } = await admin.from('process').select('id, name').eq('organization_id', orgId).eq('is_active', true)
        const { data: wp } = await admin.from('workload_plan').select('process_id, coverage_pct').eq('organization_id', orgId)

        const procNames = Object.fromEntries((procs ?? []).map(p => [p.id, p.name]))
        const empPseudonyms = buildPseudonymMap(orgId, (emps ?? []).map(e => String(e.id)))

        // Find processes with lowest coverage (highest need)
        const coverageByProcess = new Map<string, number[]>()
        for (const r of wp ?? []) { const pid = r.process_id as string; const arr = coverageByProcess.get(pid) ?? []; arr.push(Number(r.coverage_pct ?? 0)); coverageByProcess.set(pid, arr) }
        const avgCoverage = [...coverageByProcess.entries()].map(([pid, vals]) => ({ process_id: pid, avg: vals.reduce((a, b) => a + b, 0) / vals.length })).sort((a, b) => a.avg - b.avg)

        // Find employees with fewest skills
        const skillsPerEmp = new Map<string, Set<string>>()
        for (const s of skills ?? []) { const set = skillsPerEmp.get(s.employee_id as string) ?? new Set(); set.add(s.process_id as string); skillsPerEmp.set(s.employee_id as string, set) }

        const suggestions: Array<{ employee: string; learn_process: string; reason: string }> = []
        for (const { process_id } of avgCoverage.slice(0, 3)) {
          const needsTraining = [...skillsPerEmp.entries()]
            .filter(([, procs]) => !procs.has(process_id))
            .sort((a, b) => a[1].size - b[1].size)
            .slice(0, 2)

          for (const [empId] of needsTraining) {
            suggestions.push({
              employee: empPseudonyms.get(empId) ?? pseudonymFor(orgId, empId),
              learn_process: procNames[process_id] ?? process_id,
              reason: `Dit proces heeft de laagste dekking en deze medewerker heeft maar ${skillsPerEmp.get(empId)?.size ?? 0} skills.`,
            })
          }
        }

        return { suggestions: suggestions.slice(0, 5) }
      },
    }),

    // ── Tier 4: Conversational ────────────────────────────────────────
    explainMetric: tool({
      description: 'Leg een metric of begrip uit: coverage, FTE, UPH, weighted UPH, proficiency, etc.',
      inputSchema: z.object({
        metric: z.string().describe('De metric om uit te leggen, bijv. "coverage", "FTE", "UPH"'),
      }),
      execute: async (input) => {
        const explanations: Record<string, string> = {
          coverage: 'Coverage (dekking) = beschikbare FTE ÷ benodigde FTE × 100%. >110% = overstaffed (blauw), 90-110% = goed (groen), 70-89% = krap (amber), <70% = tekort (rood).',
          fte: 'FTE = Full Time Equivalent. 1 FTE = 40 uur per week. Als een proces 80 uur werk per week heeft, heb je 2 FTE nodig.',
          uph: 'UPH = Units Per Hour. Het aantal eenheden dat een medewerker per uur kan verwerken. Bijv. 180 dozen/uur voor een orderpicker.',
          'weighted uph': 'Weighted UPH = gewogen UPH op basis van skill levels. Medewerkers met level 5 (expert) halen 1.3x de standaard, level 1 (novice) slechts 0.6x.',
          proficiency: 'Proficiency levels 1-5: 1=Novice (0.6x), 2=Basis (0.8x), 3=Competent (1.0x standaard), 4=Gevorderd (1.15x), 5=Expert (1.3x). Beïnvloedt UPH berekening.',
          'norm uph': 'Norm UPH = de standaard UPH voor een proces (level 3). Wordt vermenigvuldigd met de proficiency multiplier per medewerker.',
          demand: 'Demand = het verwachte werkvolume per dag/week. Wordt omgerekend naar uren en FTE via: uren = volume ÷ UPH, FTE = uren ÷ 40.',
        }
        const key = input.metric.toLowerCase().replace(/[^a-z ]/g, '')
        const match = Object.entries(explanations).find(([k]) => key.includes(k))
        return { explanation: match ? match[1] : `Geen specifieke uitleg beschikbaar voor "${input.metric}". Stel je vraag anders en ik probeer het uit te leggen.` }
      },
    }),

    getSetupProgress: tool({
      description:
        'Haal de voortgang van de setup op: welke stappen zijn ingevuld.',
      inputSchema: z.object({}),
      execute: async () => {
        const [sites, shifts, roles, processes, departments] =
          await Promise.all([
            admin
              .from('site')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', orgId),
            admin
              .from('shift_pattern')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', orgId),
            admin
              .from('job_role')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', orgId),
            admin
              .from('process')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', orgId)
              .eq('is_active', true),
            admin
              .from('department')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', orgId)
              .eq('status', 'active'),
          ])

        return {
          sites: sites.count ?? 0,
          shifts: shifts.count ?? 0,
          roles: roles.count ?? 0,
          processes: processes.count ?? 0,
          departments: departments.count ?? 0,
        }
      },
    }),
  }

  /* ── Build progress summary for system prompt ─────────────── */
  const [pSites, pShifts, pRoles, pProcesses, pDepts] = await Promise.all([
    admin.from('site').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    admin.from('shift_pattern').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    admin.from('job_role').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    admin.from('process').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_active', true),
    admin.from('department').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'active'),
  ])
  const progress = `Sites: ${pSites.count ?? 0}, Shifts: ${pShifts.count ?? 0}, Rollen: ${pRoles.count ?? 0}, Processen: ${pProcesses.count ?? 0}, Afdelingen: ${pDepts.count ?? 0}`

  /* ── Stream ───────────────────────────────────────────────── */
  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: `Je bent AstraAI, de onboarding assistent van AstraPlanner — een workforce planning platform voor logistiek.

Je helpt de gebruiker met alles in AstraPlanner:
1. Sites (vestigingen) aanmaken
2. Shifts (diensten) configureren
3. Departments (afdelingen) aanmaken
4. Processen instellen
5. Rollen definiëren
6. Medewerkers toevoegen en beheren
7. Demand/volume invoeren per proces
8. Vragen beantwoorden over workforce planning

Regels:
- Antwoord altijd in het Nederlands
- Wees vriendelijk, kort en praktisch
- Stel één vraag tegelijk
- Gebruik tools om acties uit te voeren als de gebruiker dat wil
- Bevestig elke actie die je uitvoert
- Als de gebruiker een vraag stelt, beantwoord die eerst en ga dan verder

Context:
- Organisatie ID: ${orgId}
- Huidige setup voortgang: ${progress}`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
  })

  return result.toUIMessageStreamResponse()
}
