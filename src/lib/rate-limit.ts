/**
 * Application-level rate limiting for AstraPlanner.
 *
 * Backed by Upstash Redis via `@upstash/ratelimit`. In environments where
 * the Upstash credentials are not configured (local dev, preview branches
 * without the env vars, CI), this module degrades gracefully to a fail-open
 * no-op with a single console warning, so the app still boots and works.
 *
 * Rationale: rate limiting is a hard requirement for the production
 * environment (see security document §15 item #3), but it must not be a
 * hard dependency for developer onboarding. The graceful fallback is
 * explicit and logged so misconfiguration in production is obvious.
 *
 * Three separate buckets are defined so that a burst on the chat endpoint
 * cannot starve contact-form submissions, and so we can tune the limits
 * per use case:
 *
 *   ai        — AI endpoints (expensive per call, strict limit)
 *   mutations — tRPC mutations (writes to the database, moderate limit)
 *   public    — unauthenticated endpoints like /api/contact (anti-abuse)
 *
 * Keys are namespaced per identifier (user id when available, otherwise IP)
 * and per bucket, so the same user gets independent quotas per endpoint
 * category.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

type Bucket = 'ai' | 'mutations' | 'public'

interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const RATE_LIMIT_ENABLED = Boolean(UPSTASH_URL && UPSTASH_TOKEN)

let warned = false
function warnOnce() {
  if (warned) return
  warned = true
  // eslint-disable-next-line no-console
  console.warn(
    '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — ' +
      'rate limiting is DISABLED. This is acceptable in local development ' +
      'but must be configured in production (see security document §15 #3).',
  )
}

const redis = RATE_LIMIT_ENABLED
  ? new Redis({ url: UPSTASH_URL!, token: UPSTASH_TOKEN! })
  : null

/**
 * Limiter definitions per bucket. The sliding-window algorithm is preferred
 * over fixed-window because it avoids the "reset cliff" where a user can
 * send 2× the limit across a window boundary.
 *
 * Current limits (can be tuned based on real usage data):
 *   ai:        20 requests / minute    — protects Anthropic spend
 *   mutations: 120 requests / minute   — generous for normal planner work
 *   public:    5 requests / minute     — contact form, anti-spam
 */
const LIMITERS: Record<Bucket, Ratelimit | null> = redis
  ? {
      ai: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, '1 m'),
        analytics: true,
        prefix: 'astra:rl:ai',
      }),
      mutations: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(120, '1 m'),
        analytics: true,
        prefix: 'astra:rl:mut',
      }),
      public: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '1 m'),
        analytics: true,
        prefix: 'astra:rl:pub',
      }),
    }
  : { ai: null, mutations: null, public: null }

/**
 * Check whether the given identifier is within its quota for the given
 * bucket. Returns `success: true` (fail-open) if rate limiting is disabled
 * or if the Upstash request itself errors — we would rather let traffic
 * through than take the application down when the rate-limit backend
 * misbehaves.
 */
export async function checkRateLimit(
  bucket: Bucket,
  identifier: string,
): Promise<RateLimitResult> {
  const limiter = LIMITERS[bucket]
  if (!limiter) {
    warnOnce()
    return { success: true, limit: 0, remaining: 0, reset: 0 }
  }

  try {
    const result = await limiter.limit(identifier)
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    }
  } catch (err) {
    // Fail open: log, then let the request through. Better than 500ing.
    // Uses dynamic import to avoid a circular dependency with any
    // module that may in turn import rate-limit during initial load.
    void import('./logger').then(({ logger }) =>
      logger.error('rate_limit_backend_error', {
        bucket,
        message: err instanceof Error ? err.message : 'unknown',
      }),
    )
    return { success: true, limit: 0, remaining: 0, reset: 0 }
  }
}

/**
 * Build a stable identifier for a request: user id if authenticated,
 * otherwise the client IP (via `x-forwarded-for` on Vercel). Returns
 * `'anonymous'` as a last resort so we still apply some limit.
 */
export function identifierFor(opts: {
  userId?: string | null
  headers?: Headers
}): string {
  if (opts.userId) return `u:${opts.userId}`
  const h = opts.headers
  if (h) {
    const xff = h.get('x-forwarded-for')
    if (xff) return `ip:${xff.split(',')[0]!.trim()}`
    const xr = h.get('x-real-ip')
    if (xr) return `ip:${xr}`
  }
  return 'anonymous'
}

/**
 * Convenience: check rate limit and produce a Response with the standard
 * `429 Too Many Requests` + rate-limit headers if denied. Returns `null`
 * if the request is within quota (caller should proceed).
 */
export async function enforceRateLimit(
  bucket: Bucket,
  identifier: string,
): Promise<Response | null> {
  const result = await checkRateLimit(bucket, identifier)
  if (result.success) return null

  return new Response(
    JSON.stringify({
      error: 'Te veel verzoeken. Probeer het over enkele momenten opnieuw.',
      retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.reset),
        'Retry-After': String(
          Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
        ),
      },
    },
  )
}

export { RATE_LIMIT_ENABLED }
