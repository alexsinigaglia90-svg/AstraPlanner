'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { snappy, containerStagger, fadeInUp } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { createClient } from '@/lib/supabase/client'

const choices = [
  {
    id: 'demo',
    title: 'Rondkijken',
    description: 'Verken AstraPlanner met voorbeelddata, zonder verplichtingen.',
    gradient: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
    shadowColor: 'rgba(99,102,241,0.3)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    id: 'self_guided',
    title: 'Zelf aan de slag',
    description: 'Richt je organisatie zelf in en ga meteen aan de slag.',
    gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    shadowColor: 'rgba(16,185,129,0.3)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    id: 'onboarding',
    title: 'Onboarding programma',
    description: 'Laat je begeleiden door AI of ons team voor een vliegende start.',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    shadowColor: 'rgba(245,158,11,0.3)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
]

export default function WelcomePage() {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [showAllChoices, setShowAllChoices] = useState(false)

  const domainMatch = trpc.onboarding.checkDomainMatch.useQuery()

  const requestJoin = trpc.onboarding.requestJoin.useMutation({
    onSuccess: () => {
      router.push('/welcome/join-pending')
    },
    onError: () => {
      setLoadingId(null)
    },
  })

  const setDemoMode = trpc.onboarding.setDemoMode.useMutation({
    onSuccess: async () => {
      const supabase = createClient()
      await supabase.auth.refreshSession()
      router.push('/dashboard')
      router.refresh()
    },
    onError: () => {
      setLoadingId(null)
    },
  })

  async function handleChoice(id: string) {
    if (loadingId) return
    setLoadingId(id)

    if (id === 'demo') {
      setDemoMode.mutate()
    } else if (id === 'self_guided') {
      router.push('/welcome/create-org?mode=self_guided')
    } else if (id === 'onboarding') {
      router.push('/welcome/onboarding-choice')
    }
  }

  const hasMatch = domainMatch.data?.match === true
  const org = domainMatch.data?.organization

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '20px',
        border: '1px solid rgba(0,0,0,0.06)',
        padding: '36px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 30px rgba(0,0,0,0.04)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top highlight line */}
      <div className="absolute top-0 left-8 right-8 h-[1px]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9) 30%, rgba(255,255,255,0.9) 70%, transparent)' }}
      />

      {/* Decorative corner accent */}
      <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%)' }}
      />

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 20 }}
        className="text-[26px] font-black mb-1"
        style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
      >
        Welkom bij AstraPlanner
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 20 }}
        className="text-[14px] mb-8"
        style={{ color: 'rgba(100,116,139,0.7)', fontFamily: 'var(--font-body)' }}
      >
        Hoe wil je starten?
      </motion.p>

      {/* Smart Join card — shown when domain match found */}
      <AnimatePresence>
        {hasMatch && org && (
          <motion.div
            key="smart-join"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            className="mb-5"
            style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.04) 0%, rgba(255,255,255,0.75) 100%)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderRadius: '16px',
              border: '1px solid rgba(99,102,241,0.18)',
              borderLeft: '4px solid',
              borderLeftColor: '#6366F1',
              padding: '18px 20px',
              boxShadow: '0 4px 20px rgba(99,102,241,0.12)',
            }}
          >
            <div className="flex items-center gap-4">
              {/* Avatar circle */}
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                  boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: 'white',
                  fontSize: '20px',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                }}
              >
                {org.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div
                  className="text-[15px] font-bold mb-0.5 leading-snug"
                  style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
                >
                  Het lijkt erop dat <span style={{ color: '#6366F1' }}>{org.name}</span> al op AstraPlanner zit!
                </div>
                <div
                  className="text-[12px]"
                  style={{ color: 'rgba(100,116,139,0.65)', fontFamily: 'var(--font-body)' }}
                >
                  {org.siteCount} site{org.siteCount !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              transition={snappy}
              onClick={() => {
                if (loadingId) return
                setLoadingId('smart-join')
                requestJoin.mutate({ organization_id: org.id })
              }}
              disabled={!!loadingId}
              className="mt-4 w-full flex items-center justify-center gap-2"
              style={{
                background: loadingId === 'smart-join'
                  ? 'rgba(99,102,241,0.7)'
                  : 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                border: 'none',
                borderRadius: '12px',
                padding: '12px 20px',
                color: 'white',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '14px',
                cursor: loadingId ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
                transition: 'opacity 0.2s',
              }}
            >
              {loadingId === 'smart-join' ? (
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
              )}
              Word lid van {org.name}
            </motion.button>

            {/* Collapse/expand toggle */}
            <button
              onClick={() => setShowAllChoices((v) => !v)}
              className="mt-3 w-full text-center text-[12px] transition-colors"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(100,116,139,0.55)',
                fontFamily: 'var(--font-body)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#6366F1' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(100,116,139,0.55)' }}
            >
              {showAllChoices ? 'Verberg andere opties' : 'Of maak een eigen organisatie'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Show normal choices if: no match found, or user toggled "show all" */}
      <AnimatePresence>
        {(!hasMatch || showAllChoices) && (
          <motion.div
            key="choices"
            initial={hasMatch ? { opacity: 0, height: 0 } : { opacity: 1, height: 'auto' }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            style={{ overflow: 'hidden' }}
          >
            <motion.div
              variants={containerStagger}
              initial="hidden"
              animate="show"
              className="flex flex-col gap-3"
            >
              {choices.map((choice) => (
                <motion.button
                  key={choice.id}
                  variants={fadeInUp}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  transition={snappy}
                  onClick={() => handleChoice(choice.id)}
                  disabled={!!loadingId}
                  className="w-full text-left flex items-center gap-4 group"
                  style={{
                    background: 'rgba(255,255,255,0.6)',
                    border: '1px solid rgba(99,102,241,0.08)',
                    borderRadius: '16px',
                    padding: '18px 20px',
                    cursor: loadingId ? 'not-allowed' : 'pointer',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                    opacity: loadingId && loadingId !== choice.id ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!loadingId) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.9)'
                      e.currentTarget.style.borderColor = 'rgba(99,102,241,0.15)'
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.6)'
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.08)'
                    e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.03)'
                  }}
                >
                  {/* Icon box */}
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '14px',
                      background: choice.gradient,
                      boxShadow: `0 4px 14px ${choice.shadowColor}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {loadingId === choice.id ? (
                      <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                        <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                      </svg>
                    ) : (
                      choice.icon
                    )}
                  </div>

                  {/* Text */}
                  <div className="flex-1">
                    <div
                      className="text-[15px] font-bold mb-0.5"
                      style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
                    >
                      {choice.title}
                    </div>
                    <div
                      className="text-[13px]"
                      style={{ color: 'rgba(100,116,139,0.7)', fontFamily: 'var(--font-body)' }}
                    >
                      {choice.description}
                    </div>
                  </div>

                  {/* Chevron */}
                  <svg
                    width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className="flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                    style={{ color: 'rgba(100,116,139,0.35)' }}
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </motion.button>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
