import { anthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, identifierFor } from '@/lib/rate-limit'

export async function POST(req: Request) {
  // Auth check
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return new Response('Unauthorized', { status: 401 })

  const orgId = user.app_metadata?.organization_id as string | undefined
  if (!orgId) return new Response('No organization', { status: 400 })

  // Rate limit (AI bucket: 20/min per user)
  const rateLimitResponse = await enforceRateLimit(
    'ai',
    identifierFor({ userId: user.id, headers: req.headers }),
  )
  if (rateLimitResponse) return rateLimitResponse

  const { site_id } = await req.json() as { site_id: string }
  if (!site_id) return new Response('Missing site_id', { status: 400 })

  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  // Gather data in parallel
  const [signalsResult, absencesResult, employeesResult, departmentsResult] = await Promise.all([
    admin.from('external_signal').select('source, signal_type, value, severity, region, metadata')
      .or(`organization_id.eq.${orgId},organization_id.is.null`)
      .order('fetched_at', { ascending: false }).limit(30),
    admin.from('employee_availability_override').select('id, start_date, end_date, override_type, status')
      .eq('organization_id', orgId).eq('override_type', 'absence').neq('status', 'cancelled').gte('end_date', today),
    admin.from('employee').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    admin.from('department').select('id, name').eq('site_id', site_id).eq('organization_id', orgId),
  ])

  const signals = signalsResult.data ?? []
  const activeAbsences = absencesResult.data ?? []
  const totalEmployees = employeesResult.count ?? 0
  const departments = departmentsResult.data ?? []
  const absencePct = totalEmployees > 0 ? ((activeAbsences.length / totalEmployees) * 100).toFixed(1) : '0'

  const signalSummary = signals.map((s) =>
    `${s.source} / ${s.signal_type}: ${s.value} (${s.severity ?? 'n/a'}) ${s.region ?? ''}`
  ).join('\n')

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: `Je bent Astra, de AI-adviseur van een workforce planning platform voor logistiek.
Je communiceert in het Nederlands. Je bent bondig, data-gedreven, en geeft concrete acties.
Gebruik geen markdown headers — alleen paragrafen en opsommingen.`,
    prompt: `Analyseer de volgende data en geef concrete, actionable adviezen.

EXTERNE SIGNALEN:
${signalSummary}

INTERN VERZUIM:
- Actieve ziekmeldingen: ${activeAbsences.length} van ${totalEmployees} medewerkers (${absencePct}%)
- Afdelingen: ${departments.map((d: { name: string }) => d.name).join(', ')}

GEEF:
1. Wat valt op? (max 2 observaties, kort)
2. Wat verwacht je komende 2 weken? (met confidence: hoog/medium/laag)
3. Concrete acties (max 3, specifiek per afdeling waar mogelijk)`,
    maxOutputTokens: 500,
  })

  return result.toTextStreamResponse()
}
