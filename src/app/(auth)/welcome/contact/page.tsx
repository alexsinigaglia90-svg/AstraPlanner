'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { bouncy, snappy } from '@/lib/motion'

export default function ContactPage() {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [message, setMessage] = useState('')
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim().length > 0 && company.trim().length > 0 && message.trim().length > 0 && !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), company: company.trim(), message: message.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Er is iets misgegaan.')
      }

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er is iets misgegaan.')
    } finally {
      setLoading(false)
    }
  }

  const getInputStyle = (field: string): React.CSSProperties => ({
    width: '100%',
    borderRadius: '16px',
    border: `2px solid ${focusedField === field ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.12)'}`,
    padding: '14px 18px',
    fontSize: '15px',
    fontFamily: 'var(--font-body)',
    color: '#1E1B4B',
    background: focusedField === field ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)',
    outline: 'none',
    transition: 'all 0.25s ease',
    boxShadow: focusedField === field
      ? '0 0 0 4px rgba(245,158,11,0.08), 0 4px 20px rgba(245,158,11,0.08)'
      : '0 1px 3px rgba(0,0,0,0.02)',
    boxSizing: 'border-box',
    resize: 'none' as const,
  })

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
        style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.15), transparent 70%)' }}
      />

      <AnimatePresence mode="wait">
        {success ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={bouncy}
            className="flex flex-col items-center text-center py-8"
          >
            {/* Green checkmark */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ ...bouncy, delay: 0.1 }}
              className="flex items-center justify-center mb-6"
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10B981, #059669)',
                boxShadow: '0 8px 24px rgba(16,185,129,0.3)',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </motion.div>

            <motion.h3
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, ...bouncy }}
              className="text-[22px] font-black mb-2"
              style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
            >
              Bericht verzonden
            </motion.h3>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, ...bouncy }}
              className="text-[14px]"
              style={{ color: 'rgba(100,116,139,0.7)', fontFamily: 'var(--font-body)', maxWidth: 300 }}
            >
              Het AstraDesk team neemt binnen 24 uur contact met je op.
            </motion.p>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, ...bouncy }}
              className="text-[26px] font-black mb-1"
              style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
            >
              Contact AstraDesk
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, ...bouncy }}
              className="text-[14px] mb-8"
              style={{ color: 'rgba(100,116,139,0.7)', fontFamily: 'var(--font-body)' }}
            >
              Stuur ons een bericht en we nemen contact op
            </motion.p>

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
              {/* Name */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, ...bouncy }}
                className="flex flex-col gap-2"
              >
                <label htmlFor="contact-name" className="text-[12px] font-bold uppercase tracking-[0.1em]"
                  style={{ color: 'rgba(180,120,0,0.7)', fontFamily: 'var(--font-body)' }}
                >
                  Naam
                </label>
                <input
                  id="contact-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                  disabled={loading}
                  placeholder="Jan de Vries"
                  style={{ ...getInputStyle('name'), height: '52px', padding: '0 18px' }}
                />
              </motion.div>

              {/* Company */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, ...bouncy }}
                className="flex flex-col gap-2"
              >
                <label htmlFor="contact-company" className="text-[12px] font-bold uppercase tracking-[0.1em]"
                  style={{ color: 'rgba(180,120,0,0.7)', fontFamily: 'var(--font-body)' }}
                >
                  Bedrijfsnaam
                </label>
                <input
                  id="contact-company"
                  type="text"
                  autoComplete="organization"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  onFocus={() => setFocusedField('company')}
                  onBlur={() => setFocusedField(null)}
                  disabled={loading}
                  placeholder="Bijv. Logistiek BV"
                  style={{ ...getInputStyle('company'), height: '52px', padding: '0 18px' }}
                />
              </motion.div>

              {/* Message */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, ...bouncy }}
                className="flex flex-col gap-2"
              >
                <label htmlFor="contact-message" className="text-[12px] font-bold uppercase tracking-[0.1em]"
                  style={{ color: 'rgba(180,120,0,0.7)', fontFamily: 'var(--font-body)' }}
                >
                  Bericht
                </label>
                <textarea
                  id="contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onFocus={() => setFocusedField('message')}
                  onBlur={() => setFocusedField(null)}
                  disabled={loading}
                  placeholder="Vertel ons hoe we je kunnen helpen..."
                  rows={4}
                  style={getInputStyle('message')}
                />
              </motion.div>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: -8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -8, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-2.5 text-[13px] px-4 py-3 rounded-2xl"
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
                      {error}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

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
                      ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
                      : 'rgba(245,158,11,0.3)',
                    boxShadow: canSubmit
                      ? '0 4px 14px rgba(245,158,11,0.35), 0 1px 3px rgba(245,158,11,0.2), inset 0 1px 0 rgba(255,255,255,0.15)'
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
                  {loading ? (
                    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <>
                      Verstuur bericht
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200 group-hover:translate-x-0.5">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </>
                  )}
                </motion.button>
              </motion.div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Back link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-6 text-center"
      >
        <Link href="/welcome/onboarding-choice"
          className="text-[13px] font-semibold transition-colors duration-200"
          style={{ color: 'rgba(245,158,11,0.7)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#D97706' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(245,158,11,0.7)' }}
        >
          ← Terug
        </Link>
      </motion.div>

      <style>{`
        @keyframes btnShimmer {
          0% { background-position: 250% 0; }
          100% { background-position: -250% 0; }
        }
        input::placeholder, textarea::placeholder {
          color: rgba(100, 116, 139, 0.35) !important;
        }
      `}</style>
    </div>
  )
}
