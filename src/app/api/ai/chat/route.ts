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
import { createAdminClient } from '@/lib/supabase/admin'

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

  /* ── Body ─────────────────────────────────────────────────── */
  const { messages }: { messages: UIMessage[] } = await req.json()

  const admin = createAdminClient()

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
        full_name: z.string().describe('Volledige naam van de medewerker'),
        email: z.string().email().optional().describe('Email adres (optioneel)'),
        department_id: z.string().optional().describe('Department UUID'),
        job_role_id: z.string().optional().describe('Job role UUID'),
        contract_type: z.enum(['full_time', 'part_time', 'temporary', 'seasonal', 'contractor']).default('full_time'),
        weekly_hours_contracted: z.number().default(40),
      }),
      execute: async (input) => {
        // Get first site for home_site_id
        const { data: sites } = await admin
          .from('site')
          .select('id')
          .eq('organization_id', orgId)
          .limit(1)

        const siteId = sites?.[0]?.id
        if (!siteId) return { error: 'Geen site gevonden. Maak eerst een site aan.' }

        const code = input.full_name.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 6) + '_' + Date.now().toString(36).slice(-3)

        const { data, error } = await admin
          .from('employee')
          .insert({
            organization_id: orgId,
            home_site_id: siteId,
            department_id: input.department_id ?? null,
            job_role_id: input.job_role_id ?? null,
            employee_code: code,
            full_name: input.full_name,
            email: input.email ?? null,
            contract_type: input.contract_type,
            weekly_hours_contracted: input.weekly_hours_contracted,
            hire_date: new Date().toISOString().split('T')[0],
            status: 'active',
          })
          .select('id, full_name, employee_code')
          .single()

        if (error) return { error: error.message }
        return { success: true, employee: data }
      },
    }),

    listEmployees: tool({
      description: 'Toon alle medewerkers van de organisatie.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await admin
          .from('employee')
          .select('id, full_name, employee_code, contract_type, status')
          .eq('organization_id', orgId)
          .eq('status', 'active')
          .order('full_name')
          .limit(50)

        if (error) return { error: error.message }
        return { employees: data ?? [], count: data?.length ?? 0 }
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
