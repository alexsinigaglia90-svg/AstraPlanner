import { AppShell } from '@/components/layout/app-shell'
import { DemoProvider } from '@/components/onboarding/demo-provider'
import { DemoBanner } from '@/components/onboarding/demo-banner'
import { DemoPresenterBar, DemoPresenterStartButton } from '@/components/onboarding/demo-presenter-bar'
import { SetupChecklist } from '@/components/onboarding/setup-checklist'
import { AiOverlay } from '@/components/ai/ai-overlay'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoProvider>
      <AppShell>{children}</AppShell>
      <DemoBanner />
      <DemoPresenterBar />
      <DemoPresenterStartButton />
      <SetupChecklist />
      <AiOverlay />
    </DemoProvider>
  )
}
