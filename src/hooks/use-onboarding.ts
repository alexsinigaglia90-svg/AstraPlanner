'use client'

/**
 * useOnboarding hook
 * Manages the setup checklist state for new organizations.
 * Queries only fire when: user has an org, not in demo mode, checklist not dismissed.
 */

import { useState, useEffect, useCallback } from 'react'
import { trpc } from '@/lib/trpc/client'
import { useDemoStore } from './use-demo'
import { useSiteStore } from '@/stores/site-store'

const DISMISSED_KEY = 'astra_checklist_dismissed'

export interface OnboardingStep {
  id: string
  label: string
  completed: boolean
}

export function useOnboarding() {
  const isDemo = useDemoStore((s) => s.isDemo)
  const demoResolved = useDemoStore((s) => s.demoResolved)
  const { activeSiteId } = useSiteStore()

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(DISMISSED_KEY) === 'true'
  })

  // Re-sync on hydration
  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true')
  }, [])

  // Only enable queries when: demo resolved, not demo, not dismissed
  const enabled = demoResolved && !isDemo && !dismissed

  const sitesQuery = trpc.org.listSites.useQuery(undefined, {
    enabled,
    select: (data) => data.length > 0,
  })

  const shiftsQuery = trpc.org.listShifts.useQuery(
    { site_id: activeSiteId! },
    {
      enabled: enabled && !!activeSiteId,
      select: (data) => data.length > 0,
    },
  )

  const rolesQuery = trpc.org.listRoles.useQuery(
    { site_id: activeSiteId! },
    {
      enabled: enabled && !!activeSiteId,
      select: (data) => data.length > 0,
    },
  )

  const employeesQuery = trpc.workforce.listEmployees.useQuery(
    {
      site_id: activeSiteId!,
      limit: 1,
    },
    {
      enabled: enabled && !!activeSiteId,
      select: (data) => data.items.length > 0,
    },
  )

  const processesQuery = trpc.org.listProcesses.useQuery(
    { site_id: activeSiteId! },
    {
      enabled: enabled && !!activeSiteId,
      select: (data) => data.length > 0,
    },
  )

  const steps: OnboardingStep[] = [
    { id: 'sites',     label: 'Maak een site aan',        completed: sitesQuery.data ?? false },
    { id: 'shifts',    label: 'Stel shifts in',           completed: shiftsQuery.data ?? false },
    { id: 'roles',     label: 'Voeg rollen toe',          completed: rolesQuery.data ?? false },
    { id: 'employees', label: 'Voeg medewerkers toe',     completed: employeesQuery.data ?? false },
    { id: 'processes', label: 'Definieer processen',      completed: processesQuery.data ?? false },
    { id: 'planning',  label: 'Plan je eerste week',      completed: false },
  ]

  const completedCount = steps.filter((s) => s.completed).length
  const totalCount = steps.length

  const showChecklist = enabled && !dismissed

  const dismissChecklist = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setDismissed(true)
  }, [])

  return {
    showChecklist,
    steps,
    completedCount,
    totalCount,
    dismissChecklist,
  }
}
