/**
 * Reset and re-seed the database.
 * Usage: npx tsx scripts/reset-seed.ts
 */
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function run() {
  console.log('🗑️  Deleting existing org...')
  const { error: delErr } = await supabase
    .from('organization')
    .delete()
    .eq('slug', 'astralogistics')

  if (delErr) {
    console.log('  No existing org or delete failed:', delErr.message)
  } else {
    console.log('  Done.')
  }

  console.log('\n📊 Checking table counts...')
  for (const table of ['organization', 'site', 'department', 'process', 'employee']) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
    console.log(`  ${table}: ${count ?? 0} rows`)
  }

  console.log('\n✅ Ready for seed. Run the seed.sql in Supabase SQL Editor.')
  console.log('   After seeding, run: npx tsx scripts/link-user.ts')
}

run().catch(console.error)
