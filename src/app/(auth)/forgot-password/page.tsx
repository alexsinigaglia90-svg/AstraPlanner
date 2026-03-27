'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { bouncy, snappy } from '@/lib/motion'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    setLoading(false)

    if (resetError) {
      setError(resetError.message)
      return
    }

    setSent(true)
  }

  const inputClasses = (field: string) => ({
    style: {
      height: '52px',
      width: '100%',
      borderRadius: '16px',
      border: `2px solid ${focusedField === field ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.08)'}`,
      padding: '0 18px',
      fontSize: '15px',
      fontFamily: 'var(--font-body)',
      color: '#1E1B4B',
      background: focusedField === field ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)',
      outline: 'none',
      transition: 'all 0.25s ease',
      boxShadow: focusedField === field
        ? '0 0 0 4px rgba(99,102,241,0.08), 0 4px 20px rgba(99,102,241,0.08)'
        : '0 1px 3px rgba(0,0,0,0.02)',
      boxSizing: 'border-box' as const,
    } satisfies React.CSSProperties,
  })

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={bouncy}
        className="relative text-center"
        style={{
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '20px',
          border: '1px solid rgba(0, 0, 0, 0.06)',
          padding: '48px 36px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 30px rgba(0,0,0,0.04)',
        }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ ...bouncy, delay: 0.1 }}
          className="mx-auto mb-4 flex items-center justify-center"
          style={{ width: 56, height: 56, borderRadius: '16px', background: 'rgba(99,102,241,0.08)' }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </motion.div>
        <h2 className="text-[22px] font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}>
          Check your email
        </h2>
        <p className="text-[14px] mb-6" style={{ color: 'rgba(100,116,139,0.7)', fontFamily: 'var(--font-body)' }}>
          We sent a password reset link to <strong style={{ color: '#1E1B4B' }}>{email}</strong>
        </p>
        <Link href="/login"
          className="inline-flex items-center gap-2 text-[14px] font-semibold transition-all duration-200 px-5 py-2.5 rounded-xl"
          style={{
            color: '#6366F1',
            textDecoration: 'none',
            fontFamily: 'var(--font-body)',
            background: 'rgba(99,102,241,0.04)',
            border: '1px solid rgba(99,102,241,0.08)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
          </svg>
          Back to sign in
        </Link>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="relative"
      style={{
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '20px',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        padding: '36px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 30px rgba(0,0,0,0.04)',
      }}
    >
      <div className="absolute top-0 left-8 right-8 h-[1px]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9) 30%, rgba(255,255,255,0.9) 70%, transparent)' }}
      />

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, ...bouncy }}
        className="text-[26px] font-black mb-1"
        style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
      >
        Forgot password?
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, ...bouncy }}
        className="text-[14px] mb-8"
        style={{ color: 'rgba(100, 116, 139, 0.7)', fontFamily: 'var(--font-body)' }}
      >
        Enter your email and we&apos;ll send you a reset link
      </motion.p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, ...bouncy }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="email" className="text-[12px] font-bold uppercase tracking-[0.1em]"
            style={{ color: 'rgba(79, 70, 229, 0.6)', fontFamily: 'var(--font-body)' }}
          >
            Email address
          </label>
          <input
            id="email" type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)}
            disabled={loading} placeholder="you@company.com"
            {...inputClasses('email')}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, ...bouncy }}
          className="pt-1"
        >
          <motion.button
            type="submit" disabled={loading}
            whileHover={loading ? undefined : { scale: 1.015, y: -2 }}
            whileTap={loading ? undefined : { scale: 0.975 }}
            transition={snappy}
            className="w-full relative overflow-hidden group"
            style={{
              height: '54px',
              borderRadius: '16px',
              border: 'none',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: 'var(--font-body)',
              cursor: loading ? 'not-allowed' : 'pointer',
              color: 'white',
              background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)',
              boxShadow: '0 4px 14px rgba(99,102,241,0.35), 0 1px 3px rgba(99,102,241,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              letterSpacing: '0.01em',
            }}
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
              style={{
                background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.2) 42%, rgba(255,255,255,0.25) 48%, rgba(255,255,255,0.2) 54%, transparent 65%)',
                backgroundSize: '250% 100%',
                animation: 'btnShimmer 2s ease-in-out infinite',
              }}
            />
            {loading ? (
              <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            ) : (
              <>
                Send reset link
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </>
            )}
          </motion.button>
        </motion.div>
      </form>

      <AnimatePresence>
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto', transition: bouncy }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="mt-5 overflow-hidden"
          >
            <div className="flex items-center gap-2.5 text-[13px] px-4 py-3 rounded-2xl"
              style={{
                background: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.12)',
                color: '#DC2626',
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-4 my-7">
        <div className="flex-1 h-[1px]" style={{ background: 'rgba(99,102,241,0.08)' }} />
        <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'rgba(100, 116, 139, 0.35)', fontFamily: 'var(--font-body)' }}>
          or
        </span>
        <div className="flex-1 h-[1px]" style={{ background: 'rgba(99,102,241,0.08)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-center"
      >
        <Link href="/login"
          className="inline-flex items-center gap-2 text-[14px] font-semibold transition-all duration-200 px-5 py-2.5 rounded-xl"
          style={{
            color: '#6366F1',
            textDecoration: 'none',
            fontFamily: 'var(--font-body)',
            background: 'rgba(99,102,241,0.04)',
            border: '1px solid rgba(99,102,241,0.08)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
          </svg>
          Back to sign in
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
    </motion.div>
  )
}
