import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit, identifierFor } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    // Rate limit (public bucket: 5/min per IP). Applied before parsing the
    // body to keep the abuse path cheap.
    const rateLimitResponse = await enforceRateLimit(
      'public',
      identifierFor({ headers: req.headers }),
    )
    if (rateLimitResponse) return rateLimitResponse

    const body = await req.json() as { name?: string; company?: string; message?: string }
    const { name, company, message } = body

    if (!name || !company || !message) {
      return NextResponse.json({ error: 'Alle velden zijn verplicht.' }, { status: 400 })
    }

    // Get the authenticated user's email (optional — contact form works without auth too)
    let userEmail: string | null = null
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      userEmail = user?.email ?? null
    } catch {
      // Not authenticated — that's fine
    }

    // Log the contact submission
    console.log('[AstraDesk Contact]', {
      name,
      company,
      message,
      userEmail,
      submittedAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[AstraDesk Contact] Error:', err)
    return NextResponse.json({ error: 'Er is iets misgegaan. Probeer opnieuw.' }, { status: 500 })
  }
}
