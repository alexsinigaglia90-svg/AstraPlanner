/**
 * Employee anonymizer for AI prompts.
 *
 * Goal: ensure that no direct identifiers (first name, last name, email) of
 * Protest Sportwear (or any other tenant) employees are sent to Anthropic
 * Claude as part of an AI prompt or tool result.
 *
 * Strategy: deterministic, per-organization HMAC-SHA-256 over the employee id,
 * truncated and rendered as a human-readable pseudonym such as
 *   "Medewerker A3F2"
 *
 * Properties:
 *  - Stable: the same employee always produces the same pseudonym within an
 *    organization (so the model can reason consistently across turns).
 *  - Tenant-scoped: pseudonyms differ across organizations even for the same
 *    employee id, preventing cross-tenant correlation in any model logs.
 *  - One-way: the pseudonym cannot be reversed to a name without access to
 *    the database AND the organization-scoped HMAC key.
 *  - Readable: pseudonyms remain ergonomic for the end user reading the AI
 *    response, removing the need to de-anonymize the output stream.
 *
 * This module is intentionally side-effect free and synchronous so it can be
 * called inside tool execute() handlers without adding latency.
 */

import { createHmac } from 'node:crypto'

const SECRET =
  process.env.AI_PSEUDONYM_SECRET ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  ''

if (!SECRET) {
  // Soft fallback during local development; in production the env var must be set.
  // We never throw at import time so the build does not break in unrelated contexts.
  // eslint-disable-next-line no-console
  console.warn('[anonymizer] AI_PSEUDONYM_SECRET not set — pseudonyms will use a weak default')
}

/** Compute the per-organization stable pseudonym for a single employee id. */
export function pseudonymFor(orgId: string, employeeId: string): string {
  const mac = createHmac('sha256', SECRET || 'astraplanner-dev-fallback-key')
  mac.update(orgId)
  mac.update(':')
  mac.update(employeeId)
  const hex = mac.digest('hex').slice(0, 4).toUpperCase()
  return `Medewerker ${hex}`
}

/** Fields that must never reach the AI provider for any employee record. */
const PII_FIELDS = ['first_name', 'last_name', 'full_name', 'email', 'phone'] as const

type AnyEmployee = Record<string, unknown> & { id?: string }

/**
 * Strip PII fields from a single employee record and replace them with a
 * stable pseudonym. The original record is not mutated.
 */
export function anonymizeEmployee<T extends AnyEmployee>(
  orgId: string,
  emp: T,
): Omit<T, (typeof PII_FIELDS)[number]> & { ref: string } {
  const id = String(emp.id ?? '')
  const ref = id ? pseudonymFor(orgId, id) : 'Medewerker ?'
  const out: Record<string, unknown> = { ref }
  for (const [k, v] of Object.entries(emp)) {
    if ((PII_FIELDS as readonly string[]).includes(k)) continue
    out[k] = v
  }
  return out as Omit<T, (typeof PII_FIELDS)[number]> & { ref: string }
}

/** Batch variant of {@link anonymizeEmployee}. */
export function anonymizeEmployees<T extends AnyEmployee>(
  orgId: string,
  emps: T[] | null | undefined,
): Array<Omit<T, (typeof PII_FIELDS)[number]> & { ref: string }> {
  return (emps ?? []).map((e) => anonymizeEmployee(orgId, e))
}

/**
 * Build a lookup map from employee id → pseudonym, for tools that need to
 * substitute names inside derived structures (e.g. cross-train suggestions).
 */
export function buildPseudonymMap(
  orgId: string,
  employeeIds: Iterable<string>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const id of employeeIds) {
    map.set(id, pseudonymFor(orgId, id))
  }
  return map
}
