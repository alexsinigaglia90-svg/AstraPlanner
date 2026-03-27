'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { bouncy, snappy } from '@/lib/motion'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setLoading(false)
      setError(updateError.message)
      return
    }

    setSuccess(true)
    setTimeout(() => {
      router.push('/dashboard')
      router.refresh()
    }, 2000)
  }

  const inputClasses = (field: string) => ({
    style: {
      height: '52px',
      width: '100%',
      borderRadius: '16px',
      border: `2px solid ${focusedField === field ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.08)'}`,
      padding: '0 48px 0 18px',
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

  if (success) {
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
          style={{ width: 56, height: 56, borderRadius: '16px', background: 'rgba(34,197,94,0.1)' }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </motion.div>
        <h2 className="text-[22px] font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}>
          Password updated
        </h2>
        <p className="text-[14px]" style={{ color: 'rgba(100,116,139,0.7)', fontFamily: 'var(--font-body)' }}>
          Redirecting to dashboard...
        </p>
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
        Set new password
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, ...bouncy }}
        className="text-[14px] mb-8"
        style={{ color: 'rgba(100, 116, 139, 0.7)', fontFamily: 'var(--font-body)' }}
      >
        Choose a strong password for your account
      </motion.p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, ...bouncy }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="password" className="text-[12px] font-bold uppercase tracking-[0.1em]"
            style={{ color: 'rgba(79, 70, 229, 0.6)', fontFamily: 'var(--font-body)' }}
          >
            New password
          </label>
          <div className="relative">
            <input
              id="password" type={showPassword ? 'text' : 'password'}
              autoComplete="new-password" required minLength={8}
              value={password} onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)}
              disabled={loading} placeholder="At least 8 characters"
              {...inputClasses('password')}
            />
            <button
              type="button" onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-all duration-150"
              style={{ color: 'rgba(100, 116, 139, 0.5)', border: 'none', background: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(79, 70, 229, 0.7)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(100, 116, 139, 0.5)' }}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, ...bouncy }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="confirm-password" className="text-[12px] font-bold uppercase tracking-[0.1em]"
            style={{ color: 'rgba(79, 70, 229, 0.6)', fontFamily: 'var(--font-body)' }}
          >
            Confirm password
          </label>
          <div className="relative">
            <input
              id="confirm-password" type={showPassword ? 'text' : 'password'}
              autoComplete="new-password" required
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              onFocus={() => setFocusedField('confirm')} onBlur={() => setFocusedField(null)}
              disabled={loading} placeholder="Repeat your password"
              {...inputClasses('confirm')}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, ...bouncy }}
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
                Update password
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
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
