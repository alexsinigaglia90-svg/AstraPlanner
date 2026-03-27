'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { snappy, containerStagger, fadeInUp } from '@/lib/motion'

const choices = [
  {
    id: 'ai_assisted',
    title: 'AI Assistent',
    description: 'Laat onze AI je begeleiden bij het inrichten van je organisatie.',
    gradient: 'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)',
    shadowColor: 'rgba(99,102,241,0.3)',
    badge: 'Aanbevolen',
    href: '/welcome/create-org?mode=ai_assisted',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10" />
        <path d="M12 6v6l4 2" />
        <path d="M18 2l4 4-4 4" />
        <path d="M22 2h-4" />
      </svg>
    ),
  },
  {
    id: 'contact',
    title: 'Contact AstraDesk',
    description: 'Ons onboarding team staat voor je klaar voor een persoonlijke begeleiding.',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    shadowColor: 'rgba(245,158,11,0.3)',
    badge: null,
    href: '/welcome/contact',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
]

export default function OnboardingChoicePage() {
  const router = useRouter()

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
        Onboarding programma
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 20 }}
        className="text-[14px] mb-8"
        style={{ color: 'rgba(100,116,139,0.7)', fontFamily: 'var(--font-body)' }}
      >
        Kies hoe je begeleid wilt worden
      </motion.p>

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
            onClick={() => router.push(choice.href)}
            className="w-full text-left flex items-center gap-4 group"
            style={{
              background: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(99,102,241,0.08)',
              borderRadius: '16px',
              padding: '18px 20px',
              cursor: 'pointer',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
              boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.9)'
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.15)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'
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
              {choice.icon}
            </div>

            {/* Text */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="text-[15px] font-bold"
                  style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
                >
                  {choice.title}
                </span>
                {choice.badge && (
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{
                      background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                      color: 'white',
                    }}
                  >
                    {choice.badge}
                  </span>
                )}
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

      {/* Back link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="mt-6 text-center"
      >
        <Link href="/welcome"
          className="text-[13px] font-semibold transition-colors duration-200"
          style={{ color: 'rgba(99,102,241,0.6)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#6366F1' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(99,102,241,0.6)' }}
        >
          ← Terug
        </Link>
      </motion.div>
    </div>
  )
}
