/**
 * Demo mode guard utilities.
 * Use `demoToast()` to block mutations in demo mode.
 * Use `isDemo` to conditionally disable tRPC queries.
 */
import { useDemoStore } from './use-demo'

const DEMO_MSG = 'Dit is een demo — start je eigen omgeving om wijzigingen te maken'

export function useDemoGuard() {
  const isDemo = useDemoStore((s) => s.isDemo)

  /** Show toast and return true if in demo mode (blocks the action) */
  function demoToast(): boolean {
    if (isDemo) {
      if (typeof window !== 'undefined') {
        window.alert(DEMO_MSG)
      }
      return true
    }
    return false
  }

  return { isDemo, demoToast }
}
