/**
 * Debug RLS issues by querying with both service role and anon key
 */
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function run() {
  // 1. Service role (bypasses RLS)
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  console.log('=== SERVICE ROLE (bypasses RLS) ===')
  const { data: sites, error: sitesErr } = await admin.from('site').select('id, name, organization_id')
  console.log('Sites:', sitesErr?.message ?? JSON.stringify(sites, null, 2))

  const { data: orgs } = await admin.from('organization').select('id, name, slug')
  console.log('Orgs:', JSON.stringify(orgs, null, 2))

  // 2. Check user JWT claims
  const { data: { users } } = await admin.auth.admin.listUsers()
  for (const u of users ?? []) {
    console.log(`\nUser: ${u.email}`)
    console.log('  app_metadata:', JSON.stringify(u.app_metadata))
  }

  // 3. Check RLS functions
  const { data: fnOrg } = await admin.rpc('get_organization_id').maybeSingle()
  console.log('\nget_organization_id() via service role:', fnOrg)

  // 4. Try anon key (subject to RLS) - but without a session this won't have JWT claims
  const anon = createClient(url, anonKey)
  const { data: anonSites, error: anonErr } = await anon.from('site').select('id, name')
  console.log('\n=== ANON KEY (with RLS, no session) ===')
  console.log('Sites:', anonErr?.message ?? `${anonSites?.length ?? 0} rows`)

  // 5. Check the actual RLS policies
  const { data: policies } = await admin.rpc('pg_catalog.current_setting', { setting: 'test' }).maybeSingle()

  // Direct SQL to check policies
  const { data: polCheck } = await admin.from('site').select('id, name, organization_id, status')
  console.log('\n=== SITES DATA ===')
  polCheck?.forEach(s => {
    console.log(`  ${s.name}: org=${s.organization_id}, status=${s.status}`)
  })
}

run().catch(console.error)
