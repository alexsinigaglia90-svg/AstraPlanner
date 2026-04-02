/**
 * Hook that returns pre-computed demo plan data in the same shape
 * as tRPC planning queries, so pages can switch seamlessly.
 */

import { useMemo } from 'react'
import { getDemoPlan, demoPlanVersions } from '@/components/onboarding/demo-seed-plans'
import type { DemoPlanVersion } from '@/components/onboarding/demo-seed-plans'

export function useDemoPlanData(planId: string | null): DemoPlanVersion | null {
  return useMemo(() => {
    if (!planId) return null
    return getDemoPlan(planId)
  }, [planId])
}

export function useDemoPlanList() {
  return demoPlanVersions
}
