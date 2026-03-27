/**
 * Central demo-mode guard utilities.
 *
 * Provides:
 * - `useDemoGuard()` — returns `{ isDemo, guardMutation }` where
 *   `guardMutation` blocks the callback and shows a toast when in demo mode.
 */

import { useDemoStore } from './use-demo'
import { useToast } from '@/components/domain/toast'

const DEMO_MSG = 'Dit is een demo — start je eigen omgeving om wijzigingen te maken'

export function useDemoGuard() {
  const isDemo = useDemoStore((s) => s.isDemo)
  const toast = useToast()

  /** Wraps any mutation / side-effect: blocks it in demo mode with a toast. */
  function guardMutation<T extends (...args: unknown[]) => unknown>(fn: T): T {
    const guarded = (...args: unknown[]) => {
      if (isDemo) {
        toast.showError(DEMO_MSG)
        return
      }
      return fn(...args)
    }
    return guarded as unknown as T
  }

  return { isDemo, guardMutation, DEMO_MSG }
}
