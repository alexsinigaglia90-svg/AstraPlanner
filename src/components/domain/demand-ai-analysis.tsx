'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { bouncy, snappy, fadeInUp, containerStagger } from '@/lib/motion'
import { Sparkles, AlertTriangle, Check, RefreshCw } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DemandAnalysis {
  headerRow: number
  dataStartRow: number
  dataEndRow: number
  skipRows: number[]
  orientation: 'rows_dates' | 'cols_dates'
  dateColumn: number | null
  processColumns: Array<{
    index: number
    rawName: string
    suggestedMatch: string | null
    confidence: number
    reason: string
  }>
  unitType: 'units' | 'cases' | 'pallets' | 'hours' | 'fte' | 'unknown'
  unitTypeConfidence: number
  anomalies: string[]
  questions: Array<{
    id: string
    text: string
    type: 'choice' | 'confirm'
    options?: string[]
    default?: string
  }>
}

export interface DemandAiAnalysisProps {
  analysis: DemandAnalysis | null
  loading: boolean
  error: string | null
  onAnswer: (questionId: string, answer: string) => void
  answers: Record<string, string>
  onRetry: () => void
}

// ── Shimmer keyframes ─────────────────────────────────────────────────────────

const SHIMMER_STYLE_ID = 'demand-ai-shimmer'

function ensureShimmerKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById(SHIMMER_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = SHIMMER_STYLE_ID
  style.textContent = `
@keyframes demandAiShimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
`
  document.head.appendChild(style)
}

// ── Chip helpers ──────────────────────────────────────────────────────────────

type ChipVariant = 'green' | 'amber' | 'indigo'

const chipStyles: Record<ChipVariant, React.CSSProperties> = {
  green: {
    background: 'rgba(16,185,129,0.1)',
    color: '#059669',
    border: '1px solid rgba(16,185,129,0.2)',
  },
  amber: {
    background: 'rgba(245,158,11,0.1)',
    color: '#D97706',
    border: '1px solid rgba(245,158,11,0.2)',
  },
  indigo: {
    background: 'rgba(99,102,241,0.1)',
    color: '#6366F1',
    border: '1px solid rgba(99,102,241,0.2)',
  },
}

function Chip({
  label,
  variant,
  delay = 0,
}: {
  label: string
  variant: ChipVariant
  delay?: number
}) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...bouncy, delay }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 12px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.4,
        fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
        ...chipStyles[variant],
      }}
    >
      {label}
    </motion.span>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: '0 0 8px',
        fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        color: 'var(--muted-foreground)',
      }}
    >
      {children}
    </p>
  )
}

// ── Loading state ─────────────────────────────────────────────────────────────

function LoadingState() {
  ensureShimmerKeyframes()

  const shimmerBase: React.CSSProperties = {
    height: 14,
    borderRadius: 7,
    background:
      'linear-gradient(90deg, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0.18) 40%, rgba(99,102,241,0.08) 80%)',
    backgroundSize: '800px 100%',
    animation: 'demandAiShimmer 1.6s infinite linear',
  }

  return (
    <div style={{ padding: '20px 20px 18px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <motion.div
          animate={{ rotate: [0, 15, -10, 15, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sparkles size={16} color="#6366F1" />
        </motion.div>
        <span
          style={{
            fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
            fontSize: 13,
            fontWeight: 600,
            color: '#6366F1',
          }}
        >
          Claude analyseert je bestand...
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ ...shimmerBase, width: '78%' }} />
        <div style={{ ...shimmerBase, width: '52%' }} />
      </div>
    </div>
  )
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorState({
  error,
  onRetry,
}: {
  error: string
  onRetry: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={bouncy}
      style={{ padding: '20px 20px 18px' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <AlertTriangle size={16} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
        <span
          style={{
            fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
            fontSize: 13,
            color: '#EF4444',
            lineHeight: 1.5,
          }}
        >
          {error}
        </span>
      </div>

      <motion.button
        variants={{ press: { scale: 0.95, transition: snappy } }}
        whileTap="press"
        onClick={onRetry}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 14px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
          background: 'rgba(239,68,68,0.08)',
          color: '#EF4444',
          border: '1px solid rgba(239,68,68,0.2)',
          cursor: 'pointer',
        }}
      >
        <RefreshCw size={12} />
        Opnieuw proberen
      </motion.button>
    </motion.div>
  )
}

// ── Question card ─────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  answer,
  onAnswer,
}: {
  question: DemandAnalysis['questions'][number]
  answer: string | undefined
  onAnswer: (answer: string) => void
}) {
  const isAnswered = answer !== undefined

  const options =
    question.type === 'confirm'
      ? ['Ja', 'Nee']
      : (question.options ?? [])

  return (
    <motion.div
      variants={fadeInUp}
      style={{
        background: isAnswered
          ? 'rgba(99,102,241,0.04)'
          : 'rgba(255,255,255,0.7)',
        border: isAnswered
          ? '1px solid rgba(99,102,241,0.2)'
          : '1px solid rgba(0,0,0,0.07)',
        borderRadius: 10,
        padding: '12px 14px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--foreground)',
            lineHeight: 1.5,
          }}
        >
          {question.text}
        </p>

        <AnimatePresence>
          {isAnswered && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={bouncy}
              style={{ flexShrink: 0 }}
            >
              <Check size={14} color="#059669" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((opt) => {
          const selected = answer === opt
          return (
            <motion.button
              key={opt}
              variants={{ press: { scale: 0.94, transition: snappy } }}
              whileTap="press"
              onClick={() => onAnswer(opt)}
              style={{
                padding: '5px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                ...(selected
                  ? {
                      background: 'rgba(99,102,241,0.12)',
                      color: '#6366F1',
                      border: '1px solid rgba(99,102,241,0.35)',
                    }
                  : {
                      background: 'transparent',
                      color: 'var(--muted-foreground)',
                      border: '1px solid rgba(0,0,0,0.12)',
                    }),
              }}
            >
              {opt}
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DemandAiAnalysis({
  analysis,
  loading,
  error,
  onAnswer,
  answers,
  onRetry,
}: DemandAiAnalysisProps) {
  // Derive confidence variant for unitType chip
  const unitConfidenceVariant: ChipVariant =
    analysis && analysis.unitTypeConfidence >= 0.8
      ? 'green'
      : 'amber'

  const containerStyle: React.CSSProperties = {
    backgroundColor: 'rgba(99,102,241,0.03)',
    border: `1px solid ${error ? 'rgba(239,68,68,0.18)' : 'rgba(99,102,241,0.1)'}`,
    borderRadius: 12,
    overflow: 'hidden',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={bouncy}
      style={containerStyle}
    >
      <AnimatePresence mode="wait">
        {/* ── Loading ─────────────────────────────────────────── */}
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <LoadingState />
          </motion.div>
        )}

        {/* ── Error ───────────────────────────────────────────── */}
        {!loading && error && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ErrorState error={error} onRetry={onRetry} />
          </motion.div>
        )}

        {/* ── Success ─────────────────────────────────────────── */}
        {!loading && !error && analysis && (
          <motion.div
            key="analysis"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ padding: '18px 20px 20px' }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                marginBottom: 16,
              }}
            >
              <Sparkles size={14} color="#6366F1" />
              <span
                style={{
                  fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#6366F1',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                AI Analyse
              </span>
            </div>

            {/* ── Section 1: Bevindingen ───────────────────────── */}
            <div style={{ marginBottom: 18 }}>
              <SectionHeading>Bevindingen</SectionHeading>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <Chip
                  label={`Headers op rij ${analysis.headerRow + 1}`}
                  variant="green"
                  delay={0.05}
                />
                <Chip
                  label={`Data: rij ${analysis.dataStartRow + 1}–${analysis.dataEndRow + 1}`}
                  variant="green"
                  delay={0.1}
                />
                <Chip
                  label={`Eenheid: ${analysis.unitType}`}
                  variant={unitConfidenceVariant}
                  delay={0.15}
                />
                <Chip
                  label={`${analysis.processColumns.length} processen herkend`}
                  variant="green"
                  delay={0.2}
                />
                <Chip
                  label={`${analysis.processColumns.filter((p) => p.suggestedMatch !== null).length} automatisch gekoppeld`}
                  variant="indigo"
                  delay={0.25}
                />
              </div>
            </div>

            {/* ── Section 2: Waarschuwingen ────────────────────── */}
            <AnimatePresence>
              {analysis.anomalies.length > 0 && (
                <motion.div
                  key="anomalies"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ ...bouncy }}
                  style={{ marginBottom: 18, overflow: 'hidden' }}
                >
                  <SectionHeading>Waarschuwingen</SectionHeading>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {analysis.anomalies.map((anomaly, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ ...bouncy, delay: i * 0.06 }}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 8,
                          padding: '9px 12px',
                          borderRadius: 8,
                          background: 'rgba(245,158,11,0.07)',
                          border: '1px solid rgba(245,158,11,0.18)',
                        }}
                      >
                        <AlertTriangle
                          size={13}
                          color="#D97706"
                          style={{ flexShrink: 0, marginTop: 1 }}
                        />
                        <span
                          style={{
                            fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                            fontSize: 12,
                            color: '#92400E',
                            lineHeight: 1.5,
                          }}
                        >
                          {anomaly}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Section 3: Vragen ────────────────────────────── */}
            <AnimatePresence>
              {analysis.questions.length > 0 && (
                <motion.div
                  key="questions"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <SectionHeading>Vragen</SectionHeading>

                  <motion.div
                    variants={containerStagger}
                    initial="hidden"
                    animate="show"
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    {analysis.questions.map((q) => (
                      <QuestionCard
                        key={q.id}
                        question={q}
                        answer={answers[q.id]}
                        onAnswer={(ans) => onAnswer(q.id, ans)}
                      />
                    ))}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
