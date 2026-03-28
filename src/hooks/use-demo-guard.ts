/**
 * Demo mode guard utilities.
 * Use `demoToast()` to block mutations in demo mode with a proper toast.
 * Use `isDemo` to conditionally disable tRPC queries.
 */
import { useDemoStore } from './use-demo'
import { useToast } from '@/components/domain/toast'

const DEMO_MSG = 'Dit is een demo — start je eigen omgeving om wijzigingen te maken'

export { DEMO_MSG }

export function useDemoGuard() {
  const isDemo = useDemoStore((s) => s.isDemo)
  const toast = useToast()

  /** Show toast and return true if in demo mode (blocks the action) */
  function demoToast(): boolean {
    if (isDemo) {
      toast.showError(DEMO_MSG)
      return true
    }
    return false
  }

  return { isDemo, demoToast }
}
