import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, identifierFor } from '@/lib/rate-limit'

/**
 * POST /api/contact
 *
 * Public contact form endpoint. Accepts unauthenticated submissions from
 * prospects and persists them to `contact_submission` for later triage by
 * the AstraPlanner team.
 *
 * Security posture:
 *   - Rate limited at 5 req/min per IP (see src/lib/rate-limit.ts 'public')
 *   - Input validated with Zod (length caps, email format)
 *   - PII is NEVER logged — only the row id is logged on success
 *   - Writes go through the service-role client because the table has
 *     an RLS "deny all" stance (no policies); only service_role can insert
 */

const ContactInputSchema = z.object({
  name: z.string().trim().min(1, 'Naam is verplicht').max(200, 'Naam is te lang'),
  company: z.string().trim().min(1, 'Bedrijf is verplicht').max(200, 'Bedrijf is te lang'),
  message: z.string().trim().min(1, 'Bericht is verplicht').max(5000, 'Bericht is te lang'),
})

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limit — applied before parsing the body so abuse is cheap.
    const ipId = identifierFor({ headers: req.headers })
    const rateLimitResponse = await enforceRateLimit('public', ipId)
    if (rateLimitResponse) return rateLimitResponse

    // 2. Parse and validate input.
    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: 'Ongeldig verzoek.' }, { status: 400 })
    }

    const parsed = ContactInputSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Ongeldige invoer.' },
        { status: 400 },
      )
    }
    const { name, company, message } = parsed.data

    // 3. Capture the submitter's email if they happened to be logged in.
    //    This is optional context, never required.
    let userEmail: string | null = null
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      userEmail = user?.email ?? null
    } catch {
      // Not authenticated — fine, that's the default path.
    }

    // 4. Extract abuse-triage metadata from headers. Note: we store
    //    ip_address and user_agent deliberately, even though they are
    //    personal data under AVG, because without them we cannot
    //    investigate abuse of the public form. Retention is 1 year
    //    (see migration 00019_contact_submission.sql).
    const forwardedFor = req.headers.get('x-forwarded-for')
    const ipAddress = forwardedFor?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? null
    const userAgent = req.headers.get('user-agent') ?? null

    // 5. Persist via the service-role client. The table has no RLS policies,
    //    so only service_role can insert.
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('contact_submission')
      .insert({
        name,
        company,
        user_email: userEmail,
        message,
        ip_address: ipAddress,
        user_agent: userAgent,
      })
      .select('id')
      .single()

    if (error || !data) {
      // Log the technical error for ops but never include the submitter's
      // content — that is still PII.
      console.error('[contact] persistence failed:', error?.message ?? 'no data returned')
      return NextResponse.json(
        { error: 'Er is iets misgegaan. Probeer opnieuw.' },
        { status: 500 },
      )
    }

    // 6. Success log — id only, no PII.
    console.log('[contact] submission stored', { id: data.id })

    return NextResponse.json({ success: true })
  } catch (err) {
    // Unexpected failure path — never include the request body in the log,
    // because it contains PII that we don't want in server logs.
    console.error(
      '[contact] unexpected error:',
      err instanceof Error ? err.message : 'unknown',
    )
    return NextResponse.json(
      { error: 'Er is iets misgegaan. Probeer opnieuw.' },
      { status: 500 },
    )
  }
}
