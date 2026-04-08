import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClientForUser } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

/**
 * POST /api/admin/assign-org
 * Body: { target_email: string, organization_id: string, role: string }
 *
 * Assigns a user to an organization. Caller must be tenant_admin of that org
 * (or super_admin) and cannot assign users to a different organization.
 *
 * This endpoint operates on auth.users, which is not covered by
 * fn_audit_trigger (the trigger is only attached to the six domain tables
 * in 00001_initial_schema.sql). We therefore write an explicit audit_log
 * row so that role assignments remain attributable.
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

  // Admin client carries the caller's user id as x-actor-id so any mutations
  // on audited tables (none here, but future additions) are attributable.
  const admin = createAdminClientForUser(user.id)

  // Find the target user by email
  const { data: { users }, error: listError } = await admin.auth.admin.listUsers()
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 })
  }

  const targetUser = users.find((u) => u.email === target_email)
  if (!targetUser) {
    return NextResponse.json({ error: `User with email ${target_email} not found` }, { status: 404 })
  }

  const previousMetadata = targetUser.app_metadata ?? {}

  // Update their metadata
  const { error: updateError } = await admin.auth.admin.updateUserById(targetUser.id, {
    app_metadata: {
      ...previousMetadata,
      organization_id,
      role,
      site_ids: [],
      mode: null,
    },
  })

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Explicit audit trail — auth.users is not covered by fn_audit_trigger,
  // so we write a row ourselves. entity_type = 'auth.user' lets us
  // distinguish these rows from domain-table audits.
  const { error: auditError } = await admin.from('audit_log').insert({
    organization_id,
    actor_id: user.id,
    actor_type: 'user',
    action: 'ASSIGN_ORG',
    entity_type: 'auth.user',
    entity_id: targetUser.id,
    before_state: {
      organization_id: previousMetadata.organization_id ?? null,
      role: previousMetadata.role ?? null,
    },
    after_state: {
      organization_id,
      role,
    },
    metadata_json: {
      target_email,
      caller_role: callerRole,
    },
  })

  if (auditError) {
    // The user mutation already succeeded, so we log the audit failure but
    // don't roll back — operator visibility is still preserved via the
    // structured logger.
    logger.error('assign_org_audit_write_failed', {
      supabase_error: auditError.message,
      target_user_id: targetUser.id,
      organization_id,
      caller_id: user.id,
    })
  } else {
    logger.info('assign_org_completed', {
      target_user_id: targetUser.id,
      organization_id,
      role,
      caller_id: user.id,
    })
  }

  return NextResponse.json({
    success: true,
    message: `${target_email} is now ${role} in org ${organization_id}`,
  })
}
