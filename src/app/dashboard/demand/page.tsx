'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { containerStagger, fadeInUp, bouncy } from '@/lib/motion'
import { DemandGrid } from '@/components/domain/demand-grid'
import { FteDashboard } from '@/components/domain/fte-dashboard'
import { getDefaultWeekRange } from '@/components/domain/week-range-picker'
import { useSiteStore } from '@/stores/site-store'

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = 'invoer' | 'dashboard'

const TABS: { key: Tab; label: string }[] = [
  { key: 'invoer', label: '\u{1F4DD} Invoer' },
  { key: 'dashboard', label: '\u{1F4CA} Dashboard' },
]

// ── Tab content animation variants ───────────────────────────────────────────

const tabContentVariants = {
  enter: {
    opacity: 0,
    y: 8,
  },
  center: {
    opacity: 1,
    y: 0,
    transition: {
      ...bouncy,
      delay: 0.1,
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: {
      duration: 0.15,
    },
  },
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DemandPage() {
  const { activeSiteId } = useSiteStore()
  const siteId = activeSiteId ?? ''

  const [weekRange, setWeekRange] = useState<{ start: string; end: string }>(
    getDefaultWeekRange
  )
  const [activeTab, setActiveTab] = useState<Tab>('invoer')

  // Wait for site to be selected
  if (!siteId) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '64px 24px', gap: 16,
      }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 14,
          color: 'var(--muted-foreground)',
        }}>
          Selecteer een site om demand te beheren.
        </p>
      </div>
    )
  }

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        width: '100%',
        padding: '0 24px',
      }}
    >
      {/* ── Page header ─────────────────────────────────────────────── */}
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
          Demand &amp; Workload
        </h1>
      </motion.div>

      {/* ── Tab toggle ──────────────────────────────────────────────── */}
      <motion.div variants={fadeInUp}>
        <div
          style={{
            display: 'inline-flex',
            position: 'relative',
            backgroundColor: 'var(--muted)',
            borderRadius: '12px',
            padding: '4px',
            gap: '0px',
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                position: 'relative',
                zIndex: 1,
                padding: '8px 20px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                fontSize: '14px',
                fontWeight: 600,
                transition: 'color 0.2s ease',
                backgroundColor: 'transparent',
                color:
                  activeTab === tab.key
                    ? '#ffffff'
                    : 'var(--muted-foreground)',
              }}
            >
              {/* Active indicator (slides with spring animation) */}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="tab-indicator"
                  transition={bouncy}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: 'var(--primary)',
                    borderRadius: '8px',
                    zIndex: -1,
                  }}
                />
              )}
              {tab.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* ── Tab content ─────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'invoer' ? (
          <motion.div
            key="invoer"
            variants={tabContentVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <DemandGrid
              siteId={siteId}
              weekRange={weekRange}
              onWeekRangeChange={setWeekRange}
            />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            variants={tabContentVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <FteDashboard siteId={siteId} weekRange={weekRange} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
