'use client'

import { motion } from 'framer-motion'
import { bouncy, fadeInUp, containerStagger } from '@/lib/motion'
import type { DeptBenchmark } from '@/lib/insights/types'

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface InsightsBenchmarkProps {
  departments: DeptBenchmark[]
  sectorAvg: number
}

/* ------------------------------------------------------------------ */
/*  Glass card style                                                    */
/* ------------------------------------------------------------------ */

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.6)',
  borderRadius: 20,
  padding: 16,
  boxShadow: 'var(--elevation-2)',
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_COLOR: Record<DeptBenchmark['status'], string> = {
  below: '#10B981',
  within: '#6366F1',
  above: '#EF4444',
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function InsightsBenchmark({ departments, sectorAvg }: InsightsBenchmarkProps) {
  const maxPct = Math.max(
    ...departments.map(d => d.absence_pct),
    sectorAvg,
    1,
  ) * 1.15 // 15% headroom

  return (
    <motion.div
      style={glassCard}
      variants={fadeInUp}
      initial="hidden"
      animate="show"
    >
      <h3
        style={{
          margin: '0 0 12px',
          fontSize: 15,
          fontWeight: 700,
          fontFamily: 'var(--font-display)',
          color: '#1E1B4B',
        }}
      >
        Benchmark per afdeling
      </h3>

      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="show"
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {departments.map(dept => {
          const barPct = (dept.absence_pct / maxPct) * 100
          const sectorPct = (sectorAvg / maxPct) * 100
          const color = STATUS_COLOR[dept.status]

          return (
            <motion.div key={dept.department_id} variants={fadeInUp}>
              {/* Department name + value */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#1E293B',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {dept.department_name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {dept.absence_pct.toFixed(1)}%
                </span>
              </div>

              {/* Department bar */}
              <div
                style={{
                  height: 10,
                  borderRadius: 5,
                  background: 'rgba(0,0,0,0.04)',
                  overflow: 'hidden',
                  marginBottom: 3,
                }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${barPct}%` }}
                  transition={{ ...bouncy, delay: 0.2 }}
                  style={{
                    height: '100%',
                    borderRadius: 5,
                    background: color,
                  }}
                />
              </div>

              {/* Sector average bar */}
              <div
                style={{
                  height: 5,
                  borderRadius: 3,
                  background: 'rgba(0,0,0,0.04)',
                  overflow: 'hidden',
                }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${sectorPct}%` }}
                  transition={{ ...bouncy, delay: 0.35 }}
                  style={{
                    height: '100%',
                    borderRadius: 3,
                    background: '#94A3B8',
                  }}
                />
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginTop: 12,
          justifyContent: 'center',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#475569', fontFamily: 'var(--font-body)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: '#6366F1', display: 'inline-block' }} />
          Jullie
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#475569', fontFamily: 'var(--font-body)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: '#94A3B8', display: 'inline-block' }} />
          Sector ({sectorAvg.toFixed(1)}%)
        </span>
      </div>
    </motion.div>
  )
}
