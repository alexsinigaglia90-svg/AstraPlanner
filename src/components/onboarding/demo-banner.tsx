'use client'

import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { createClient } from '@/lib/supabase/client'
import { useDemoStore } from '@/hooks/use-demo'
import { useDemoScenarioStore } from '@/stores/demo-scenario-store'
import { bouncy } from '@/lib/motion'

export function DemoBanner() {
  const isDemo = useDemoStore((s) => s.isDemo)
  const isPresenting = useDemoScenarioStore((s) => s.isPresenting)
  const setDemo = useDemoStore((s) => s.setDemo)
  const router = useRouter()

  const exitMutation = trpc.onboarding.exitDemoMode.useMutation({
    onSuccess: async () => {
      const supabase = createClient()
      await supabase.auth.refreshSession()
      setDemo(false)
      router.push('/welcome/create-org')
    },
  })

  function handleStart() {
    if (exitMutation.isPending) return
    exitMutation.mutate()
  }

  return (
    <AnimatePresence>
      {isDemo && !isPresenting && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ ...bouncy, delay: 1 }}
          style={{
            position: 'fixed',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            pointerEvents: 'auto',
          }}
        >
          <motion.button
            onClick={handleStart}
            disabled={exitMutation.isPending}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            transition={bouncy}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 28px',
              borderRadius: '9999px',
              border: 'none',
              background: exitMutation.isPending
                ? 'linear-gradient(135deg, #818CF8, #A78BFA)'
                : 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              color: '#FFFFFF',
              fontFamily: 'var(--font-display)',
              fontSize: '15px',
              fontWeight: 700,
              letterSpacing: '0.01em',
              cursor: exitMutation.isPending ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 24px rgba(99,102,241,0.45), 0 1px 4px rgba(0,0,0,0.12)',
              backdropFilter: 'blur(20px)',
              whiteSpace: 'nowrap' as const,
            }}
          >
            {/* Pulsing glow ring */}
            <motion.span
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '9999px',
                background: 'rgba(99,102,241,0.3)',
                pointerEvents: 'none',
              }}
            />
            <Sparkles size={16} style={{ flexShrink: 0 }} />
            {exitMutation.isPending ? 'Even geduld…' : 'Start voor echt'}
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
