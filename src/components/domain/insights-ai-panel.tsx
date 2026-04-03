'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { bouncy, fadeInUp, containerStagger } from '@/lib/motion'
import type { InsightCard } from '@/lib/insights/types'

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface InsightsAiPanelProps {
  insights: InsightCard[]
  siteId: string
  isDemo?: boolean
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TYPE_BORDER: Record<InsightCard['type'], string> = {
  alert: '#EF4444',
  warning: '#F59E0B',
  advice: '#10B981',
}

const TYPE_BG: Record<InsightCard['type'], string> = {
  alert: 'rgba(239,68,68,0.06)',
  warning: 'rgba(245,158,11,0.06)',
  advice: 'rgba(16,185,129,0.06)',
}

const TYPE_TITLE_COLOR: Record<InsightCard['type'], string> = {
  alert: '#DC2626',
  warning: '#D97706',
  advice: '#059669',
}

const DEMO_RESPONSE =
  'Op basis van de huidige data zie ik een stijgende trend in kortdurend verzuim bij de afdeling Productie (+1.2% t.o.v. vorige maand). ' +
  'Dit correleert met de griepgolf die het RIVM meldt in jullie regio. Mijn advies: plan extra flexkrachten in voor de komende 2 weken ' +
  'en overweeg preventieve maatregelen zoals thuiswerkmogelijkheden. De verwachte impact op jullie bezetting is circa 8-12% extra uitval ' +
  'in week 15-16. Landelijk ligt het sectorgemiddelde op 5.4% — jullie zitten momenteel op 6.1%.'

/* ------------------------------------------------------------------ */
/*  Glass card style                                                    */
/* ------------------------------------------------------------------ */

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.6)',
  borderRadius: 20,
  padding: 20,
  boxShadow: 'var(--elevation-2)',
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function InsightsAiPanel({ insights, siteId, isDemo }: InsightsAiPanelProps) {
  const [response, setResponse] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const askAstra = useCallback(async () => {
    setResponse('')
    setLoading(true)

    if (isDemo) {
      // Simulate streaming for demo mode
      let i = 0
      const words = DEMO_RESPONSE.split(' ')
      const interval = setInterval(() => {
        if (i < words.length) {
          setResponse(prev => (prev ?? '') + (i === 0 ? '' : ' ') + words[i])
          i++
        } else {
          clearInterval(interval)
          setLoading(false)
        }
      }, 40)
      return
    }

    try {
      const res = await fetch('/api/ai/insights-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: siteId }),
      })

      if (!res.ok || !res.body) {
        setResponse('Er ging iets mis bij het ophalen van het advies.')
        setLoading(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('0:')) {
            try {
              const text = JSON.parse(line.slice(2)) as string
              accumulated += text
              setResponse(accumulated)
            } catch {
              // skip malformed chunk
            }
          }
        }
      }
    } catch {
      setResponse('Verbinding mislukt. Probeer het opnieuw.')
    } finally {
      setLoading(false)
    }
  }, [isDemo, siteId])

  return (
    <motion.div
      style={glassCard}
      variants={fadeInUp}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              color: '#1E1B4B',
            }}
          >
            Astra Advies
          </h3>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 13,
              color: '#64748B',
              fontFamily: 'var(--font-body)',
            }}
          >
            AI-gestuurde inzichten en aanbevelingen
          </p>
        </div>

        <motion.button
          onClick={askAstra}
          disabled={loading}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          transition={bouncy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            border: 'none',
            borderRadius: 12,
            background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            color: '#fff',
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: 13,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          <Sparkles size={15} />
          Vraag Astra
        </motion.button>
      </div>

      {/* Insight cards */}
      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="show"
        style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}
      >
        {insights.map(card => (
          <motion.div
            key={card.id}
            variants={fadeInUp}
            style={{
              borderLeft: `3px solid ${TYPE_BORDER[card.type]}`,
              background: TYPE_BG[card.type],
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: TYPE_TITLE_COLOR[card.type],
                fontFamily: 'var(--font-body)',
                marginBottom: 2,
              }}
            >
              {card.title}
            </div>
            <div
              style={{
                fontSize: 12,
                color: '#475569',
                fontFamily: 'var(--font-body)',
                lineHeight: 1.5,
              }}
            >
              {card.description}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* AI response area */}
      <AnimatePresence mode="wait">
        {response === null ? (
          <motion.div
            key="placeholder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              border: '1.5px dashed #CBD5E1',
              borderRadius: 12,
              padding: '20px 16px',
              textAlign: 'center',
              color: '#94A3B8',
              fontSize: 13,
              fontFamily: 'var(--font-body)',
            }}
          >
            Klik <strong>Vraag Astra</strong> voor een AI-analyse van jouw verzuimdata
          </motion.div>
        ) : (
          <motion.div
            key="response"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={bouncy}
            style={{
              background: 'rgba(99,102,241,0.05)',
              borderRadius: 12,
              padding: '14px 16px',
              fontSize: 13,
              color: '#1E293B',
              fontFamily: 'var(--font-body)',
              lineHeight: 1.6,
              minHeight: 60,
            }}
          >
            {response}
            {loading && (
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                style={{ marginLeft: 2 }}
              >
                |
              </motion.span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
