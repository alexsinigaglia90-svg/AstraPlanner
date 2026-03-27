'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useDemoStore } from '@/hooks/use-demo'

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const setDemo = useDemoStore((s) => s.setDemo)

  useEffect(() => {
    const supabase = createClient()

    async function checkDemoMode() {
      const { data } = await supabase.auth.getUser()
      const mode = data?.user?.app_metadata?.mode
      setDemo(mode === 'demo')
    }

    checkDemoMode()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const mode = session?.user?.app_metadata?.mode
      setDemo(mode === 'demo')
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [setDemo])

  return <>{children}</>
}
