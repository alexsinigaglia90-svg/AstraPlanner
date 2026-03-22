'use client'

import { motion } from 'framer-motion'
import { Calendar } from 'lucide-react'
import { fadeInUp, containerStagger } from '@/lib/motion'

export default function PlanningPage() {
  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '860px' }}
    >
      <motion.div variants={fadeInUp}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '26px',
            fontWeight: 800,
            color: 'var(--foreground)',
            margin: 0,
          }}
        >
          Planning
        </h1>
      </motion.div>

      <motion.div
        variants={fadeInUp}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 24px',
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--elevation-1)',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.05))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Calendar size={24} style={{ color: 'var(--primary)' }} />
        </div>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--foreground)',
            margin: 0,
          }}
        >
          Coming in Phase 4
        </p>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            color: 'var(--muted-foreground)',
            margin: 0,
            textAlign: 'center',
            maxWidth: 400,
          }}
        >
          The solver engine will generate optimized shift schedules based on
          demand, employee skills, and constraints.
        </p>
      </motion.div>
    </motion.div>
  )
}
