'use client'

import { motion } from 'framer-motion'

/**
 * ProficiencyDots — 5 dots representing skill level 1-5.
 * Dots fill sequentially on mount with a 100ms stagger.
 */

interface ProficiencyDotsProps {
  level: number
  size?: 'sm' | 'md'
}

const DOT_SIZE = { sm: 6, md: 8 }

export function ProficiencyDots({ level, size = 'md' }: ProficiencyDotsProps) {
  const px = DOT_SIZE[size]

  return (
    <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= level
        return (
          <motion.span
            key={i}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 20,
              delay: (i - 1) * 0.1,
            }}
            style={{
              width: px,
              height: px,
              borderRadius: '50%',
              backgroundColor: filled ? 'var(--primary)' : 'var(--muted)',
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
        )
      })}
    </span>
  )
}
