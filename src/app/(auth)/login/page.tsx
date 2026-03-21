'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { scalePress, bouncy } from '@/lib/motion'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shaking, setShaking] = useState(false)

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
      setTimeout(() => setShaking(false), 400)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <motion.div
      animate={shaking ? { x: [0, -6, 6, -6, 6, -6, 0] } : { x: 0 }}
      transition={shaking ? { duration: 0.4, ease: 'easeInOut' } : {}}
      style={{
        backgroundColor: 'var(--card)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--elevation-2)',
        padding: '32px',
      }}
    >
      <h2
        className="text-2xl font-black mb-6"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--foreground)' }}
      >
        Welcome back
      </h2>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {/* Email field */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email"
            className="text-sm font-medium"
            style={{ color: 'var(--foreground)', fontFamily: 'var(--font-body)' }}
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            placeholder="you@example.com"
            style={{
              height: '48px',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)',
              padding: '0 14px',
              fontSize: '15px',
              fontFamily: 'var(--font-body)',
              color: 'var(--foreground)',
              backgroundColor: 'var(--card)',
              outline: 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--ring)'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        </div>

        {/* Password field */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            className="text-sm font-medium"
            style={{ color: 'var(--foreground)', fontFamily: 'var(--font-body)' }}
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
              disabled={loading}
              placeholder="••••••••"
              style={{
                height: '48px',
                width: '100%',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)',
                padding: '0 44px 0 14px',
                fontSize: '15px',
                fontFamily: 'var(--font-body)',
                color: 'var(--foreground)',
                backgroundColor: 'var(--card)',
                outline: 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--ring)'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted-foreground)',
                padding: '4px',
                lineHeight: 1,
              }}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>
        </div>

        {/* Submit */}
        <motion.button
          type="submit"
          disabled={loading}
          variants={scalePress}
          whileTap={loading ? undefined : 'press'}
          style={{
            height: '48px',
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            fontSize: '15px',
            fontWeight: 700,
            fontFamily: 'var(--font-body)',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.8 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = 'var(--primary-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--primary)' }}
        >
          {loading ? (
            <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
          ) : (
            'Sign in'
          )}
        </motion.button>
      </form>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            key="error"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: bouncy }}
            exit={{ opacity: 0, y: -6 }}
            className="text-sm mt-4"
            style={{ color: 'var(--destructive)', fontFamily: 'var(--font-body)' }}
            role="alert"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <p
        className="text-sm text-center mt-6"
        style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}
      >
        Don&apos;t have an account?{' '}
        <Link
          href="/signup"
          style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
        >
          Sign up
        </Link>
      </p>
    </motion.div>
  )
}
