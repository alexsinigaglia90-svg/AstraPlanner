import { AppShell } from '@/components/layout/app-shell'
import { DemoProvider } from '@/components/onboarding/demo-provider'
import { DemoBanner } from '@/components/onboarding/demo-banner'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoProvider>
      <AppShell>{children}</AppShell>
      <DemoBanner />
    </DemoProvider>
  )
}
