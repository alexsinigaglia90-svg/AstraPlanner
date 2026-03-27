'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { bouncy, snappy, containerStagger, fadeInUp } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { createClient } from '@/lib/supabase/client'

const SECTORS = [
  'Logistiek & Warehousing',
  'Productie & Manufacturing',
  'Retail & E-commerce',
  'Food & Beverage',
  'Gezondheidszorg',
  'Overheid & Publieke sector',
  'Anders',
]

function CreateOrgForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') ?? 'self_guided'

  const [name, setName] = useState('')
  const [sector, setSector] = useState('')
  const [focusedField, setFocusedField] = useState<string | null>(null)

  const createOrg = trpc.onboarding.createOrganization.useMutation({
    onSuccess: async () => {
      // Force session refresh so JWT contains the new org_id
      const supabase = createClient()
      await supabase.auth.refreshSession()

      if (mode === 'ai_assisted') {
        router.push('/dashboard?ai=open')
      } else {
        router.push('/dashboard')
      }
      router.refresh()
    },
  })

  const canSubmit = name.trim().length > 0 && sector.length > 0 && !createOrg.isPending

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    createOrg.mutate({ name: name.trim(), sector })
  }

  const inputStyle: React.CSSProperties = {
    height: '52px',
    width: '100%',
    borderRadius: '16px',
    border: `2px solid ${focusedField === 'name' ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.08)'}`,
    padding: '0 18px',
    fontSize: '15px',
    fontFamily: 'var(--font-body)',
    color: '#1E1B4B',
    background: focusedField === 'name' ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)',
    outline: 'none',
    transition: 'all 0.25s ease',
    boxShadow: focusedField === 'name'
      ? '0 0 0 4px rgba(99,102,241,0.08), 0 4px 20px rgba(99,102,241,0.08)'
      : '0 1px 3px rgba(0,0,0,0.02)',
    boxSizing: 'border-box',
  }

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
        transition={{ delay: 0.2, ...bouncy }}
        className="text-[26px] font-black mb-1"
        style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
      >
        Je organisatie
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, ...bouncy }}
        className="text-[14px] mb-8"
        style={{ color: 'rgba(100,116,139,0.7)', fontFamily: 'var(--font-body)' }}
      >
        Vertel ons over je bedrijf om van start te gaan
      </motion.p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {/* Org name */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, ...bouncy }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="org-name" className="text-[12px] font-bold uppercase tracking-[0.1em]"
            style={{ color: 'rgba(79,70,229,0.6)', fontFamily: 'var(--font-body)' }}
          >
            Naam organisatie
          </label>
          <input
            id="org-name"
            type="text"
            autoComplete="organization"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setFocusedField('name')}
            onBlur={() => setFocusedField(null)}
            disabled={createOrg.isPending}
            placeholder="Bijv. Logistiek BV"
            style={inputStyle}
          />
        </motion.div>

        {/* Sector pills */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, ...bouncy }}
          className="flex flex-col gap-3"
        >
          <label className="text-[12px] font-bold uppercase tracking-[0.1em]"
            style={{ color: 'rgba(79,70,229,0.6)', fontFamily: 'var(--font-body)' }}
          >
            Sector
          </label>
          <motion.div
            variants={containerStagger}
            initial="hidden"
            animate="show"
            className="flex flex-wrap gap-2"
          >
            {SECTORS.map((s) => {
              const selected = sector === s
              return (
                <motion.button
                  key={s}
                  type="button"
                  variants={fadeInUp}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  transition={snappy}
                  onClick={() => setSector(s)}
                  disabled={createOrg.isPending}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: selected ? 700 : 500,
                    fontFamily: 'var(--font-body)',
                    cursor: createOrg.isPending ? 'not-allowed' : 'pointer',
                    border: selected ? '2px solid #6366F1' : '2px solid rgba(99,102,241,0.1)',
                    background: selected ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.6)',
                    color: selected ? '#6366F1' : '#1E1B4B',
                    transition: 'all 0.2s ease',
                    boxShadow: selected ? '0 0 0 3px rgba(99,102,241,0.08)' : 'none',
                  }}
                >
                  {s}
                </motion.button>
              )
            })}
          </motion.div>
        </motion.div>

        {/* Error state */}
        {createOrg.isError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2.5 text-[13px] px-4 py-3 rounded-2xl"
            style={{
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.12)',
              color: '#DC2626',
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {createOrg.error?.message ?? 'Er is iets misgegaan. Probeer opnieuw.'}
          </motion.div>
        )}

        {/* Submit */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, ...bouncy }}
        >
          <motion.button
            type="submit"
            disabled={!canSubmit}
            whileHover={canSubmit ? { scale: 1.015, y: -2 } : undefined}
            whileTap={canSubmit ? { scale: 0.975 } : undefined}
            transition={snappy}
            className="w-full relative overflow-hidden group"
            style={{
              height: '54px',
              borderRadius: '16px',
              border: 'none',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: 'var(--font-body)',
              cursor: !canSubmit ? 'not-allowed' : 'pointer',
              color: 'white',
              background: canSubmit
                ? 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)'
                : 'rgba(99,102,241,0.3)',
              boxShadow: canSubmit
                ? '0 4px 14px rgba(99,102,241,0.35), 0 1px 3px rgba(99,102,241,0.2), inset 0 1px 0 rgba(255,255,255,0.15)'
                : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              letterSpacing: '0.01em',
              transition: 'background 0.3s ease, box-shadow 0.3s ease',
            }}
          >
            {canSubmit && (
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                style={{
                  background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.2) 42%, rgba(255,255,255,0.25) 48%, rgba(255,255,255,0.2) 54%, transparent 65%)',
                  backgroundSize: '250% 100%',
                  animation: 'btnShimmer 2s ease-in-out infinite',
                }}
              />
            )}
            {createOrg.isPending ? (
              <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            ) : (
              <>
                Organisatie aanmaken
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200 group-hover:translate-x-0.5">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </>
            )}
          </motion.button>
        </motion.div>
      </form>

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

      <style>{`
        @keyframes btnShimmer {
          0% { background-position: 250% 0; }
          100% { background-position: -250% 0; }
        }
        input::placeholder {
          color: rgba(100, 116, 139, 0.35) !important;
        }
      `}</style>
    </div>
  )
}

export default function CreateOrgPage() {
  return (
    <Suspense fallback={null}>
      <CreateOrgForm />
    </Suspense>
  )
}
