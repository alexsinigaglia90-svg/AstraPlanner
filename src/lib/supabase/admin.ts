import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role client for trusted server-side code.
 *
 * IMPORTANT: this client bypasses Row-Level Security and must never be
 * reachable from the browser. Only import from server-side files under
 * `src/server/**`, `src/app/api/**`, or `src/lib/` modules that are
 * themselves server-only.
 *
 * Two variants are exposed:
 *
 *   createAdminClient()
 *     Unscoped service-role client, for operations that do not originate
 *     from a specific end user (cron jobs, system maintenance).
 *     Mutations performed through this client will be recorded in
 *     audit_log with actor_id = NULL.
 *
 *   createAdminClientForUser(userId)
 *     Service-role client that carries an `x-actor-id` HTTP header on every
 *     PostgREST request. The audit trigger fn_audit_trigger() reads this
 *     header from `request.headers` and records it as actor_id, so changes
 *     performed through the AI chat tools, admin API routes, or any other
 *     code path that acts on behalf of a specific user remain fully
 *     attributable. See migration 00018_audit_actor_fix.sql.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export function createAdminClient() {
  return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export function createAdminClientForUser(userId: string) {
  return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        // Read by fn_audit_trigger() via current_setting('request.headers')
        // so audit_log rows carry the real acting user rather than NULL.
        'x-actor-id': userId,
      },
    },
  })
}
