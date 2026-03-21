/**
 * Link a Supabase Auth user to the seed organization.
 * Usage: npx tsx scripts/link-user.ts
 */
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function run() {
  // 1. Get the organization ID
  const { data: org, error: orgErr } = await supabase
    .from('organization')
    .select('id, name')
    .eq('slug', 'astralogistics')
    .single()

  if (orgErr || !org) {
    console.error('❌ Organization not found:', orgErr?.message)
    return
  }
  console.log(`✅ Organization: ${org.name} (${org.id})`)

  // 2. List all auth users
  const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers()

  if (usersErr || !users?.length) {
    console.error('❌ No users found:', usersErr?.message)
    return
  }

  // 3. Update each user with org claims
  for (const user of users) {
    const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
      app_metadata: {
        organization_id: org.id,
        role: 'tenant_admin',
        site_ids: [],
      },
    })

    if (updateErr) {
      console.error(`❌ Failed to update ${user.email}:`, updateErr.message)
    } else {
      console.log(`✅ Linked ${user.email} → ${org.name} (tenant_admin)`)
    }
  }

  console.log('\n🔄 Log out and back in to get the new JWT claims.')
}

run().catch(console.error)
