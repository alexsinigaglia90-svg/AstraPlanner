'use client'

import { motion } from 'framer-motion'
import { snappy } from '@/lib/motion'

interface AiButtonProps {
  onClick: () => void
}

export function AiButton({ onClick }: AiButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      transition={snappy}
      aria-label="Open AI-assistent"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 45,
        width: 48,
        height: 48,
        borderRadius: '50%',
        border: 'none',
        background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
        color: '#fff',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow:
          '0 0 0 0 rgba(99,102,241,0.4), 0 4px 14px rgba(99,102,241,0.35)',
        animation: 'aiGlow 2.5s ease-in-out infinite',
        fontSize: 22,
      }}
    >
      {/* Sparkle icon (SVG) */}
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v1m0 16v1m-8-9H3m18 0h-1m-2.636-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707" />
        <circle cx="12" cy="12" r="4" />
      </svg>

      <style>{`
        @keyframes aiGlow {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(99,102,241,0.4), 0 4px 14px rgba(99,102,241,0.35);
          }
          50% {
            box-shadow: 0 0 0 10px rgba(99,102,241,0), 0 4px 20px rgba(99,102,241,0.5);
          }
        }
      `}</style>
    </motion.button>
  )
}
