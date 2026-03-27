'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { bouncy } from '@/lib/motion'
import { NeuralBackground } from '@/components/domain/neural-background'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden"
      style={{ background: '#F8F9FC' }}
    >
      {/* Animated neural network background */}
      <NeuralBackground />

      {/* Subtle radial gradient overlay for depth */}
      <div className="absolute inset-0"
        style={{
          zIndex: 0,
          background: 'radial-gradient(ellipse at 50% 30%, transparent 0%, rgba(248,249,252,0.4) 70%, rgba(248,249,252,0.8) 100%)',
        }}
      />

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8 text-center"
        style={{ zIndex: 1 }}
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          {/* Logo mark */}
          <motion.div
            initial={{ scale: 0, rotate: -15 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ ...bouncy, delay: 0.15 }}
            className="relative flex items-center justify-center"
            style={{ width: 44, height: 44 }}
          >
            <div className="absolute inset-0 rounded-xl"
              style={{
                background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                boxShadow: '0 4px 20px rgba(99,102,241,0.25)',
              }}
            />
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" className="relative"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </motion.div>

          <div>
            <h1 className="text-[28px] font-black tracking-tight"
              style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
            >
              AstraPlanner
            </h1>
          </div>
        </div>
        <p className="text-[13px] font-medium"
          style={{ color: 'rgba(100,116,139,0.6)', fontFamily: 'var(--font-body)' }}
        >
          Workforce scheduling platform
        </p>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="w-full"
        style={{ maxWidth: 480, zIndex: 1 }}
      >
        {children}
      </motion.div>

      {/* Footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.4 }}
        className="mt-8 text-xs"
        style={{ color: 'rgba(100,116,139,0.35)', fontFamily: 'var(--font-body)', zIndex: 1 }}
      >
        Secure access &middot; AstraPlanner
      </motion.p>
    </div>
  )
}
