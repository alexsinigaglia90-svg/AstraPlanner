'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { bouncy, snappy, wobbly } from '@/lib/motion'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  function shake() {
    setShaking(true)
    setTimeout(() => setShaking(false), 500)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      shake()
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      shake()
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })

    if (authError) {
      setLoading(false)
      setError(authError.message)
      shake()
      return
    }

    setLoading(false)
    setSuccess(true)
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    height: '52px',
    width: '100%',
    borderRadius: '14px',
    border: `1.5px solid ${focusedField === field ? 'rgba(99,102,241,0.6)' : 'rgba(99,102,241,0.15)'}`,
    padding: '0 16px',
    fontSize: '15px',
    fontFamily: 'var(--font-body)',
    color: '#F5F3FF',
    background: 'rgba(15, 14, 26, 0.5)',
    outline: 'none',
    transition: 'all 0.2s ease',
    boxShadow: focusedField === field
      ? '0 0 0 4px rgba(99,102,241,0.1), 0 0 20px rgba(99,102,241,0.1)'
      : 'none',
    boxSizing: 'border-box' as const,
  })

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={wobbly}
        className="relative overflow-hidden text-center"
        style={{
          background: 'rgba(26, 24, 48, 0.6)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          borderRadius: '24px',
          border: '1px solid rgba(99, 102, 241, 0.15)',
          padding: '48px 40px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3), 0 0 100px rgba(99, 102, 241, 0.05)',
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(16,185,129,0.4) 50%, transparent 100%)' }} />

        {/* Animated checkmark */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ ...wobbly, delay: 0.2 }}
          className="mx-auto mb-6 flex items-center justify-center"
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '22px',
            background: 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.05) 100%)',
            border: '1px solid rgba(16,185,129,0.3)',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12l6 6L21 6" />
          </svg>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, ...bouncy }}
          className="text-xl font-black mb-3"
          style={{ fontFamily: 'var(--font-display)', color: '#F5F3FF' }}
        >
          Check your email
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, ...bouncy }}
          className="text-sm leading-relaxed"
          style={{ color: 'rgba(148, 163, 184, 0.7)', fontFamily: 'var(--font-body)' }}
        >
          We sent a confirmation link to<br />
          <strong style={{ color: '#A5B4FC' }}>{email}</strong>
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8"
        >
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm font-semibold transition-colors duration-200"
            style={{ color: '#A5B4FC', textDecoration: 'none', fontFamily: 'var(--font-body)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
            </svg>
            Back to sign in
          </Link>
        </motion.div>
      </motion.div>
    )
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
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3), 0 0 100px rgba(99, 102, 241, 0.05)',
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.3) 50%, transparent 100%)' }} />

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, ...bouncy }}
        className="text-2xl font-black mb-1"
        style={{ fontFamily: 'var(--font-display)', color: '#F5F3FF' }}
      >
        Create your account
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, ...bouncy }}
        className="text-sm mb-8"
        style={{ color: 'rgba(148, 163, 184, 0.7)', fontFamily: 'var(--font-body)' }}
      >
        Start planning smarter today
      </motion.p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {[
          { id: 'fullName', label: 'Full Name', type: 'text', value: fullName, set: setFullName, auto: 'name', ph: 'Jane Smith', delay: 0.3 },
          { id: 'email', label: 'Email', type: 'email', value: email, set: setEmail, auto: 'email', ph: 'you@company.com', delay: 0.33 },
        ].map((f) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: f.delay, ...bouncy }}
            className="flex flex-col gap-2"
          >
            <label htmlFor={f.id} className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(196, 181, 253, 0.7)', fontFamily: 'var(--font-body)' }}>
              {f.label}
            </label>
            <input
              id={f.id}
              type={f.type}
              autoComplete={f.auto}
              required
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              onFocus={() => setFocusedField(f.id)}
              onBlur={() => setFocusedField(null)}
              disabled={loading}
              placeholder={f.ph}
              style={inputStyle(f.id)}
            />
          </motion.div>
        ))}

        {/* Password */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36, ...bouncy }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(196, 181, 253, 0.7)', fontFamily: 'var(--font-body)' }}>
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              disabled={loading}
              placeholder="Min. 6 characters"
              style={{ ...inputStyle('password'), paddingRight: '48px' }}
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

        {/* Confirm password */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.39, ...bouncy }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="confirmPassword" className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(196, 181, 253, 0.7)', fontFamily: 'var(--font-body)' }}>
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onFocus={() => setFocusedField('confirm')}
            onBlur={() => setFocusedField(null)}
            disabled={loading}
            placeholder="Repeat your password"
            style={inputStyle('confirm')}
          />
        </motion.div>

        {/* Submit */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, ...bouncy }}
          className="mt-1"
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
                Create account
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              {error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
        Already have an account?{' '}
        <Link
          href="/login"
          className="transition-colors duration-200"
          style={{ color: '#A5B4FC', fontWeight: 600, textDecoration: 'none' }}
        >
          Sign in
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
