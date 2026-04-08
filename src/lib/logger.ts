/**
 * Structured server-side logger with optional external shipping.
 *
 * Goals
 * -----
 * 1. Every significant server-side event becomes a structured JSON
 *    record (level + event + context) instead of a free-form
 *    console.log string. This makes logs searchable in any
 *    downstream system (Betterstack, Datadog, ELK, CloudWatch).
 *
 * 2. In development — or when no shipping endpoint is configured —
 *    the logger still writes to the local console so you can debug
 *    without any setup. The shipping layer is strictly additive.
 *
 * 3. The shipping call is fire-and-forget: a failing / slow external
 *    service must NEVER take down a request path. We track the
 *    promise but never await it, and we catch all errors locally.
 *
 * 4. A minimal PII redactor sanitises a handful of known-sensitive
 *    keys (email, phone, password, token, first_name, last_name)
 *    before logging. It is NOT a substitute for discipline — the
 *    single best rule is "don't put PII in logs at all" — but it
 *    provides defence-in-depth for developers who forget.
 *
 * Provider
 * --------
 * Configured via two environment variables:
 *
 *   LOG_INGEST_URL     e.g. https://in.logs.betterstack.com
 *   LOG_INGEST_TOKEN   opaque bearer token from the provider
 *
 * When both are set, events are POSTed as JSON to the URL with the
 * token as a Bearer header. When either is missing, the logger
 * degrades to console-only and emits a single startup warning.
 *
 * Adding a different provider (Axiom, Datadog, etc.) only requires
 * swapping those two env vars to the provider's HTTP ingestion
 * endpoint. The body shape is deliberately provider-agnostic JSON.
 */

type Level = 'debug' | 'info' | 'warn' | 'error'

interface LogEvent {
  level: Level
  event: string
  // Arbitrary structured context. Keys are redacted by redactPII below.
  [key: string]: unknown
}

const LOG_INGEST_URL = process.env.LOG_INGEST_URL
const LOG_INGEST_TOKEN = process.env.LOG_INGEST_TOKEN
const SHIPPING_ENABLED = Boolean(LOG_INGEST_URL && LOG_INGEST_TOKEN)
const NODE_ENV = process.env.NODE_ENV ?? 'development'
const SERVICE = process.env.LOG_SERVICE_NAME ?? 'astraplanner'

let warned = false
function warnOnce() {
  if (warned) return
  warned = true
  // eslint-disable-next-line no-console
  console.warn(
    '[logger] LOG_INGEST_URL / LOG_INGEST_TOKEN not set — external log ' +
      'shipping is DISABLED. This is acceptable in local development but ' +
      'should be configured in production for incident response retention.',
  )
}

// Keys whose values should be replaced with "[REDACTED]" before logging.
// Matching is case-insensitive. Extend this set whenever a new PII-style
// field is introduced into the application.
const REDACT_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'set-cookie',
  'email',
  'user_email',
  'phone',
  'first_name',
  'last_name',
  'full_name',
])

/**
 * Walk an object and replace any sensitive field values with
 * "[REDACTED]". Returns a NEW object, never mutates the input.
 * Arrays and primitives pass through unchanged except when nested
 * inside objects.
 */
function redactPII(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[DEPTH_LIMIT]'
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => redactPII(v, depth + 1))

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]'
    } else {
      out[k] = redactPII(v, depth + 1)
    }
  }
  return out
}

/**
 * Ship a single event to the external ingestion endpoint. Fire-and-forget
 * semantics: we create the Promise but never await it, and we swallow
 * any errors locally. Failures are logged to console.warn so operators
 * can notice if shipping is broken, but never impact the request path.
 */
function shipEvent(payload: Record<string, unknown>): void {
  if (!SHIPPING_ENABLED) {
    warnOnce()
    return
  }

  // Fire-and-forget. The void operator makes the intent explicit.
  void fetch(LOG_INGEST_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LOG_INGEST_TOKEN!}`,
    },
    body: JSON.stringify(payload),
    // Short timeout — the logger must never add latency to the request.
    signal: AbortSignal.timeout(2000),
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(
      '[logger] shipping failed:',
      err instanceof Error ? err.message : 'unknown',
    )
  })
}

/**
 * Core log function. Builds a structured record, writes it to console
 * (always), and optionally ships it to the external service. Safe to
 * call from any server-side code path.
 */
function log(level: Level, event: string, context: Record<string, unknown> = {}): void {
  const redactedContext = redactPII(context) as Record<string, unknown>
  const record: LogEvent = {
    level,
    event,
    timestamp: new Date().toISOString(),
    service: SERVICE,
    env: NODE_ENV,
    ...redactedContext,
  }

  // Local console output — this is what shows up in Vercel function logs.
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
  // eslint-disable-next-line no-console
  console[method](`[${event}]`, JSON.stringify(redactedContext))

  // Optional external shipping.
  shipEvent(record)
}

export const logger = {
  debug: (event: string, context?: Record<string, unknown>) => log('debug', event, context),
  info: (event: string, context?: Record<string, unknown>) => log('info', event, context),
  warn: (event: string, context?: Record<string, unknown>) => log('warn', event, context),
  error: (event: string, context?: Record<string, unknown>) => log('error', event, context),
}

export { SHIPPING_ENABLED }
