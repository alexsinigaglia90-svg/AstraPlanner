'use client'

import { motion } from 'framer-motion'
import { fadeInUp, bouncy } from '@/lib/motion'
import { AnimatedCounter } from '@/components/domain/animated-counter'

interface KpiHeroCardProps {
  label: string
  value: number
  detail: string
  icon: React.ReactNode
  gradientColors: [string, string]
  delay?: number
  prefix?: string
  suffix?: string
}

export function KpiHeroCard({
  label,
  value,
  detail,
  icon,
  gradientColors,
  delay = 0,
  prefix,
  suffix,
}: KpiHeroCardProps) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="show"
      transition={{ ...bouncy, delay }}
      whileHover={{
        y: -4,
        boxShadow: 'var(--elevation-2)',
        transition: bouncy,
      }}
      style={{
        position: 'relative',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '24px 24px 20px',
        overflow: 'hidden',
        cursor: 'default',
        boxShadow: 'var(--elevation-1)',
      }}
    >
      {/* Gradient top border */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          borderRadius: '20px 20px 0 0',
          background: `linear-gradient(90deg, ${gradientColors[0]}, ${gradientColors[1]})`,
        }}
      />

      {/* Icon badge — top right */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${gradientColors[0]}, ${gradientColors[1]})`,
          color: '#fff',
        }}
      >
        {icon}
      </div>

      {/* Label */}
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--muted-foreground)',
          marginBottom: 8,
        }}
      >
        {label}
      </div>

      {/* Value */}
      <AnimatedCounter
        value={value}
        prefix={prefix}
        suffix={suffix}
        style={{
          fontSize: 36,
          fontWeight: 700,
          lineHeight: 1.1,
          color: 'var(--foreground)',
          display: 'block',
          marginBottom: 6,
        }}
      />

      {/* Detail */}
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          color: 'var(--muted-foreground)',
          lineHeight: 1.4,
        }}
      >
        {detail}
      </div>
    </motion.div>
  )
}
