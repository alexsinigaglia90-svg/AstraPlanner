'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { snappy, fadeInUp } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { createClient } from '@/lib/supabase/client'

export default function JoinPendingPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.onboarding.getJoinStatus.useQuery(undefined, {
    refetchInterval: 10000,
  })

  // Supabase Realtime subscription for instant updates
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null

    async function setupRealtime() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      channel = supabase
        .channel('join-status')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'join_request',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            utils.onboarding.getJoinStatus.invalidate()
          }
        )
        .subscribe()
    }

    setupRealtime()

    return () => {
      if (channel) {
        const supabase = createClient()
        supabase.removeChannel(channel)
      }
    }
  }, [utils])

  // Handle approved: refresh session and redirect
  useEffect(() => {
    if (data?.status === 'approved') {
      const timeout = setTimeout(async () => {
        const supabase = createClient()
        await supabase.auth.refreshSession()
        router.push('/dashboard')
      }, 1500)
      return () => clearTimeout(timeout)
    }
  }, [data?.status, router])

  const status = data?.status ?? null
  const orgName = data?.organizationName ?? '...'

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '20px',
        border: '1px solid rgba(0,0,0,0.06)',
        padding: '40px 36px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 30px rgba(0,0,0,0.04)',
        position: 'relative',
        overflow: 'hidden',
        textAlign: 'center',
      }}
    >
      {/* Top highlight line */}
      <div
        className="absolute top-0 left-8 right-8 h-[1px]"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.9) 30%, rgba(255,255,255,0.9) 70%, transparent)',
        }}
      />

      {/* Decorative corner accent */}
      <div
        className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-30"
        style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%)',
        }}
      />

      {isLoading && !data ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <div
            className="animate-spin"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '3px solid rgba(99,102,241,0.15)',
              borderTopColor: '#6366F1',
            }}
          />
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              color: 'rgba(100,116,139,0.6)',
            }}
          >
            Even geduld...
          </p>
        </div>
      ) : status === 'approved' ? (
        // Approved state
        <motion.div
          key="approved"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          className="flex flex-col items-center gap-5 py-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.1 }}
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              boxShadow: '0 8px 28px rgba(16,185,129,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </motion.div>

          <div>
            <h2
              className="text-[24px] font-black mb-2"
              style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
            >
              Je bent toegelaten!
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'rgba(100,116,139,0.65)',
              }}
            >
              Je wordt doorgestuurd naar het dashboard...
            </p>
          </div>
        </motion.div>
      ) : status === 'rejected' ? (
        // Rejected state
        <motion.div
          key="rejected"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          className="flex flex-col items-center gap-5 py-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.1 }}
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
              boxShadow: '0 8px 28px rgba(239,68,68,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </motion.div>

          <div>
            <h2
              className="text-[22px] font-black mb-2"
              style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
            >
              Je verzoek is afgewezen
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'rgba(100,116,139,0.65)',
                marginBottom: '24px',
              }}
            >
              De beheerder heeft je verzoek niet goedgekeurd.
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={snappy}
            onClick={() => router.push('/welcome/create-org')}
            style={{
              background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 24px',
              color: 'white',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
            }}
          >
            Eigen organisatie maken
          </motion.button>
        </motion.div>
      ) : (
        // Pending state (default)
        <motion.div
          key="pending"
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center gap-6 py-4"
        >
          {/* Animated pulsing indigo ring */}
          <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
            {/* Outer pulse ring */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '3px solid rgba(99,102,241,0.25)',
                animation: 'pulse-ring 2s ease-in-out infinite',
              }}
            />
            {/* Middle ring */}
            <div
              style={{
                position: 'absolute',
                inset: 8,
                borderRadius: '50%',
                border: '3px solid rgba(99,102,241,0.4)',
                animation: 'pulse-ring 2s ease-in-out infinite 0.3s',
              }}
            />
            {/* Inner filled circle */}
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>

          <motion.div variants={fadeInUp}>
            <h2
              className="text-[22px] font-black mb-2"
              style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B', lineHeight: 1.3 }}
            >
              We hebben je verzoek verstuurd naar{' '}
              <span style={{ color: '#6366F1' }}>{orgName}</span>
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'rgba(100,116,139,0.65)',
              }}
            >
              Dit duurt meestal minder dan een minuut
            </p>
          </motion.div>
        </motion.div>
      )}

      {/* Back link */}
      <div className="mt-6">
        <button
          onClick={() => router.push('/welcome')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            color: 'rgba(100,116,139,0.45)',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#6366F1' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(100,116,139,0.45)' }}
        >
          &larr; Terug naar start
        </button>
      </div>

      {/* Keyframe animation for pulsing rings */}
      <style>{`
        @keyframes pulse-ring {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
