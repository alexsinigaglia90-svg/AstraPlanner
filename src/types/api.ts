/**
 * Shared Zod schemas used across tRPC routers.
 * Source of truth: docs/api-contracts.md
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const PaginationInput = z.object({
  cursor: z
    .string()
    .optional()
    .describe('Opaque cursor from previous response'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(50)
    .describe('Number of items to return (default 50, max 1000)'),
})

export type PaginationInputType = z.infer<typeof PaginationInput>

export function buildPaginatedResult<T>(
  items: T[],
  limit: number,
  getCursor: (item: T) => string,
): { items: T[]; next_cursor: string | null; total_count: number } {
  const hasMore = items.length > limit
  const page = hasMore ? items.slice(0, limit) : items
  const next_cursor = hasMore ? getCursor(page[page.length - 1]!) : null
  return { items: page, next_cursor, total_count: page.length }
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ContractTypeSchema = z
  .enum(['full_time', 'part_time', 'temporary', 'seasonal', 'contractor'])
  .describe('Employee contract type')

export type ContractType = z.infer<typeof ContractTypeSchema>

export const EmployeeStatusSchema = z
  .enum(['active', 'on_leave', 'suspended', 'terminated'])
  .describe('Employee lifecycle status')

export type EmployeeStatus = z.infer<typeof EmployeeStatusSchema>

export const OverrideTypeSchema = z
  .enum([
    'leave',
    'absence',
    'training',
    'unavailable',
    'extra_availability',
  ])
  .describe('Type of availability override')

export type OverrideType = z.infer<typeof OverrideTypeSchema>

export const OverrideStatusSchema = z
  .enum(['planned', 'confirmed', 'cancelled'])
  .describe('Lifecycle status of an availability override')

export type OverrideStatus = z.infer<typeof OverrideStatusSchema>

export const SubscriptionTierSchema = z
  .enum(['trial', 'starter', 'professional', 'enterprise'])
  .describe('Organization subscription tier')

export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>
