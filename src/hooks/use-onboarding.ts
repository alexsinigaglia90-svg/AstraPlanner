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

function getStorageBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function setStorageBool(key: string) {
  try {
    localStorage.setItem(key, 'true')
  } catch {
    // ignore — localStorage may be unavailable in private browsing
  }
}

export interface OnboardingStep {
  id: string
  label: string
  completed: boolean
  href: string
}

export function useOnboarding() {
  const isDemo = useDemoStore((s) => s.isDemo)
  const demoResolved = useDemoStore((s) => s.demoResolved)
  const { activeSiteId } = useSiteStore()

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return getStorageBool(DISMISSED_KEY)
  })

  // Re-sync on hydration
  useEffect(() => {
    setDismissed(getStorageBool(DISMISSED_KEY))
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

  const departmentsQuery = trpc.org.listDepartments.useQuery(
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

  const isLoading = enabled && (
    sitesQuery.isLoading ||
    shiftsQuery.isLoading ||
    departmentsQuery.isLoading ||
    rolesQuery.isLoading ||
    employeesQuery.isLoading ||
    processesQuery.isLoading
  )

  const steps: OnboardingStep[] = [
    { id: 'sites',       label: 'Maak een site aan',      completed: sitesQuery.data ?? false,       href: '/dashboard/settings/sites' },
    { id: 'shifts',      label: 'Stel shifts in',         completed: shiftsQuery.data ?? false,      href: '/dashboard/settings/shifts' },
    { id: 'departments', label: 'Maak departments aan',   completed: departmentsQuery.data ?? false, href: '/dashboard/processes' },
    { id: 'processes',   label: 'Definieer processen',    completed: processesQuery.data ?? false,   href: '/dashboard/processes' },
    { id: 'roles',       label: 'Voeg rollen toe',        completed: rolesQuery.data ?? false,       href: '/dashboard/settings/roles' },
    { id: 'employees', label: 'Voeg medewerkers toe', completed: employeesQuery.data ?? false, href: '/dashboard/employees' },
  ]

  const completedCount = steps.filter((s) => s.completed).length
  const totalCount = steps.length

  const showChecklist = enabled && !dismissed

  const dismissChecklist = useCallback(() => {
    setStorageBool(DISMISSED_KEY)
    setDismissed(true)
  }, [])

  return {
    showChecklist,
    isLoading,
    steps,
    completedCount,
    totalCount,
    dismissChecklist,
  }
}
