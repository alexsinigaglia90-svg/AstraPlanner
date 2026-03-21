'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { bouncy, snappy } from '@/lib/motion'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shaking, setShaking] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setLoading(false)
      setError(authError.message)
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <motion.div
      animate={shaking ? { x: [0, -8, 8, -8, 8, -4, 4, 0] } : { x: 0 }}
      transition={shaking ? { duration: 0.5, ease: 'easeInOut' } : {}}
      className="relative overflow-hidden"
      style={{
        background: 'rgba(26, 24, 48, 0.6)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        borderRadius: '24px',
        border: '1px solid rgba(99, 102, 241, 0.15)',
        padding: '40px',
        boxShadow: `
          0 0 0 1px rgba(99, 102, 241, 0.05),
          0 20px 50px rgba(0, 0, 0, 0.3),
          0 0 100px rgba(99, 102, 241, 0.05)
        `,
      }}
    >
      {/* Subtle inner glow */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.3) 50%, transparent 100%)',
        }}
      />

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, ...bouncy }}
        className="text-2xl font-black mb-1"
        style={{
          fontFamily: 'var(--font-display)',
          color: '#F5F3FF',
        }}
      >
        Welcome back
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, ...bouncy }}
        className="text-sm mb-8"
        style={{ color: 'rgba(148, 163, 184, 0.7)', fontFamily: 'var(--font-body)' }}
      >
        Sign in to your workspace
      </motion.p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {/* Email */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, ...bouncy }}
          className="flex flex-col gap-2"
        >
          <label
            htmlFor="email"
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'rgba(196, 181, 253, 0.7)', fontFamily: 'var(--font-body)' }}
          >
            Email
          </label>
          <div className="relative">
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
              disabled={loading}
              placeholder="you@company.com"
              className="w-full outline-none transition-all duration-200"
              style={{
                height: '52px',
                borderRadius: '14px',
                border: `1.5px solid ${focusedField === 'email' ? 'rgba(99,102,241,0.6)' : 'rgba(99,102,241,0.15)'}`,
                padding: '0 16px',
                fontSize: '15px',
                fontFamily: 'var(--font-body)',
                color: '#F5F3FF',
                background: 'rgba(15, 14, 26, 0.5)',
                boxShadow: focusedField === 'email'
                  ? '0 0 0 4px rgba(99,102,241,0.1), 0 0 20px rgba(99,102,241,0.1)'
                  : 'none',
              }}
            />
            {/* Animated focus glow */}
            <AnimatePresence>
              {focusedField === 'email' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 rounded-[14px] pointer-events-none"
                  style={{
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.05) 0%, transparent 100%)',
                  }}
                />
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Password */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, ...bouncy }}
          className="flex flex-col gap-2"
        >
          <label
            htmlFor="password"
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'rgba(196, 181, 253, 0.7)', fontFamily: 'var(--font-body)' }}
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              disabled={loading}
              placeholder="••••••••"
              className="w-full outline-none transition-all duration-200"
              style={{
                height: '52px',
                borderRadius: '14px',
                border: `1.5px solid ${focusedField === 'password' ? 'rgba(99,102,241,0.6)' : 'rgba(99,102,241,0.15)'}`,
                padding: '0 48px 0 16px',
                fontSize: '15px',
                fontFamily: 'var(--font-body)',
                color: '#F5F3FF',
                background: 'rgba(15, 14, 26, 0.5)',
                boxShadow: focusedField === 'password'
                  ? '0 0 0 4px rgba(99,102,241,0.1), 0 0 20px rgba(99,102,241,0.1)'
                  : 'none',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors duration-150 hover:bg-white/5"
              style={{ color: 'rgba(148, 163, 184, 0.6)', border: 'none', background: 'none', cursor: 'pointer' }}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>
        </motion.div>

        {/* Submit */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, ...bouncy }}
        >
          <motion.button
            type="submit"
            disabled={loading}
            whileHover={loading ? undefined : { scale: 1.01, y: -1 }}
            whileTap={loading ? undefined : { scale: 0.97 }}
            transition={snappy}
            className="w-full relative overflow-hidden group"
            style={{
              height: '52px',
              borderRadius: '14px',
              border: 'none',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: 'var(--font-body)',
              cursor: loading ? 'not-allowed' : 'pointer',
              color: 'white',
              background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #7C3AED 100%)',
              boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3), 0 0 30px rgba(99, 102, 241, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {/* Animated shimmer on hover */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{
                background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.15) 55%, transparent 60%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s ease-in-out infinite',
              }}
            />
            {loading ? (
              <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            ) : (
              <>
                Sign in
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </>
            )}
          </motion.button>
        </motion.div>
      </form>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto', transition: bouncy }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <div
              className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#FCA5A5',
                fontFamily: 'var(--font-body)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Divider */}
      <div className="flex items-center gap-4 my-6">
        <div className="flex-1 h-px" style={{ background: 'rgba(99,102,241,0.1)' }} />
        <span className="text-xs" style={{ color: 'rgba(148, 163, 184, 0.4)', fontFamily: 'var(--font-body)' }}>or</span>
        <div className="flex-1 h-px" style={{ background: 'rgba(99,102,241,0.1)' }} />
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-sm text-center"
        style={{ color: 'rgba(148, 163, 184, 0.6)', fontFamily: 'var(--font-body)' }}
      >
        Don&apos;t have an account?{' '}
        <Link
          href="/signup"
          className="relative inline-block transition-colors duration-200"
          style={{ color: '#A5B4FC', fontWeight: 600, textDecoration: 'none' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#C7D2FE' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#A5B4FC' }}
        >
          Create account
        </Link>
      </motion.p>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        input::placeholder {
          color: rgba(148, 163, 184, 0.3) !important;
        }
      `}</style>
    </motion.div>
  )
}
