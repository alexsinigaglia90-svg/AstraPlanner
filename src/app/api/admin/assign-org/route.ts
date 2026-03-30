import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/assign-org
 * Body: { target_email: string, organization_id: string, role: string }
 *
 * Assigns a user to an organization. Caller must be tenant_admin of that org.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const callerRole = user.app_metadata?.role
  if (callerRole !== 'tenant_admin' && callerRole !== 'super_admin') {
    return NextResponse.json({ error: 'Must be tenant_admin' }, { status: 403 })
  }

  // Verify caller's org matches the target organization (prevent cross-org escalation)
  const callerOrgId = user.app_metadata?.organization_id
  const body = await request.json()
  const { target_email, organization_id, role } = body

  if (!target_email || !organization_id || !role) {
    return NextResponse.json({ error: 'Missing fields: target_email, organization_id, role' }, { status: 400 })
  }

  if (callerRole !== 'super_admin' && callerOrgId !== organization_id) {
    return NextResponse.json({ error: 'Cannot assign users to a different organization' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Find the target user by email
  const { data: { users }, error: listError } = await admin.auth.admin.listUsers()
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 })
  }

  const targetUser = users.find((u) => u.email === target_email)
  if (!targetUser) {
    return NextResponse.json({ error: `User with email ${target_email} not found` }, { status: 404 })
  }

  // Update their metadata
  const { error: updateError } = await admin.auth.admin.updateUserById(targetUser.id, {
    app_metadata: {
      ...targetUser.app_metadata,
      organization_id,
      role,
      site_ids: [],
      mode: null,
    },
  })

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: `${target_email} is now ${role} in org ${organization_id}`,
  })
}
