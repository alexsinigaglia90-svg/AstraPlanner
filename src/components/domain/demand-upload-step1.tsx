'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download, Upload, Calendar, Clock, Check, AlertCircle,
  Sparkles, FileSpreadsheet, Plus, Minus, ChevronDown,
} from 'lucide-react'
import { bouncy, snappy, scalePress, fadeInUp, containerStagger } from '@/lib/motion'
import { AnimatedCounter } from '@/components/domain/animated-counter'
import type { PlanMode, WorkDayPreset, ParsedDemand } from './demand-upload-wizard'

// ── Keyframes (injected once) ────────────────────────────────────────────────

const STYLE_ID = 'demand-step1-keyframes'

function ensureKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
@keyframes demandSparkle {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.15); }
}
@keyframes demandFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
@keyframes demandDash {
  0% { stroke-dashoffset: 8; }
  100% { stroke-dashoffset: 0; }
}
@keyframes demandDownArrow {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(3px); }
}
`
  document.head.appendChild(style)
}

// ── Shared styles ────────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--muted-foreground)',
  marginBottom: 4,
}

const glassCard = (extraBorder?: string): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.9)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: extraBorder ?? '1px solid rgba(99,102,241,0.1)',
  borderRadius: 12,
  boxShadow: '0 4px 20px rgba(99,102,241,0.06)',
})

// ── Day abbreviation data ────────────────────────────────────────────────────

const DAY_CHIPS: Record<WorkDayPreset, string[]> = {
  'ma-vr': ['Ma', 'Di', 'Wo', 'Do', 'Vr'],
  'ma-za': ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'],
  'ma-zo': ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'],
}
const ALL_DAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

// ── Props (unchanged) ────────────────────────────────────────────────────────

export interface Step1Props {
  demandTypes: Array<{ id: string; name: string }>
  isDragging: boolean
  uploadedFile: File | null
  entries: ParsedDemand[]
  parseErrors: string[]
  unknownProcessNames: string[]
  fileInputRef: React.RefObject<HTMLInputElement | null>
  planMode: PlanMode
  dayWeekCount: number
  workDayPreset: WorkDayPreset
  onPlanModeChange: (mode: PlanMode) => void
  onDayWeekCountChange: (count: number) => void
  onWorkDayPresetChange: (preset: WorkDayPreset) => void
  onDownloadTemplate: () => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDropZoneClick: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function Step1({
  demandTypes,
  isDragging,
  uploadedFile,
  entries,
  parseErrors,
  unknownProcessNames,
  fileInputRef,
  planMode,
  dayWeekCount,
  workDayPreset,
  onPlanModeChange,
  onDayWeekCountChange,
  onWorkDayPresetChange,
  onDownloadTemplate,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileChange,
  onDropZoneClick,
}: Step1Props) {
  ensureKeyframes()

  const [downloadClicked, setDownloadClicked] = useState(false)
  const [errorsExpanded, setErrorsExpanded] = useState(false)

  const hasFile = uploadedFile !== null
  const hasEntries = entries.length > 0
  const hasErrors = parseErrors.length > 0
  const processCount = demandTypes.length
  const weekCount = planMode === 'week' ? 8 : dayWeekCount

  // Compute pre-filled value count (non-zero entries that already existed)
  const preFilledCount = processCount * weekCount
  const hasPreFilled = processCount > 0

  const handleDownload = () => {
    setDownloadClicked(true)
    onDownloadTemplate()
    setTimeout(() => setDownloadClicked(false), 1500)
  }

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      {/* ─── 1. Pre-filled feedback banner ──────────────────────────────── */}
      <motion.div variants={fadeInUp}>
        <div style={{
          ...glassCard('1px solid rgba(99,102,241,0.2)'),
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          background: hasPreFilled
            ? 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.04))'
            : 'rgba(255,255,255,0.9)',
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: hasPreFilled
              ? 'linear-gradient(135deg, #6366f1, #8B5CF6)'
              : 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Sparkles
              size={16}
              color={hasPreFilled ? '#fff' : 'var(--muted-foreground)'}
              style={hasPreFilled ? { animation: 'demandSparkle 2.5s ease-in-out infinite' } : undefined}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--foreground)',
              marginBottom: 3,
            }}>
              {hasPreFilled
                ? 'Template bevat je huidige forecast'
                : 'Blanco template — vul je forecast in'}
            </div>
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: 'var(--muted-foreground)',
              lineHeight: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexWrap: 'wrap',
            }}>
              {hasPreFilled ? (
                <>
                  <AnimatedCounter
                    value={processCount}
                    style={{ fontWeight: 700, fontSize: 12, color: '#6366f1' }}
                  />
                  <span>processen</span>
                  <span style={{ color: 'var(--border)' }}>&middot;</span>
                  <AnimatedCounter
                    value={weekCount}
                    style={{ fontWeight: 700, fontSize: 12, color: '#6366f1' }}
                  />
                  <span>{weekCount === 1 ? 'week' : 'weken'}</span>
                  <span style={{ color: 'var(--border)' }}>&middot;</span>
                  <AnimatedCounter
                    value={preFilledCount}
                    style={{ fontWeight: 700, fontSize: 12, color: '#6366f1' }}
                  />
                  <span>waarden vooraf ingevuld</span>
                </>
              ) : (
                <span>Download het template en vul je verwachte volumes in</span>
              )}
            </div>
            {hasPreFilled && (
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                color: '#6366f1',
                fontWeight: 600,
                marginTop: 4,
                opacity: 0.8,
              }}>
                Pas alleen aan wat verandert
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ─── 2. Mode selector ───────────────────────────────────────────── */}
      <motion.div variants={fadeInUp}>
        <div style={sectionLabel}>Planmodus</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {([
            { mode: 'week' as const, icon: Calendar, label: 'Per week' },
            { mode: 'day' as const, icon: Clock, label: 'Per dag' },
          ]).map(({ mode, icon: Icon, label }) => {
            const active = planMode === mode
            return (
              <motion.button
                key={mode}
                variants={scalePress}
                whileTap="press"
                onClick={() => onPlanModeChange(mode)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 16px',
                  borderRadius: 12,
                  border: active
                    ? '2px solid rgba(99,102,241,0.4)'
                    : '1px solid var(--border)',
                  background: active
                    ? 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))'
                    : 'rgba(255,255,255,0.6)',
                  color: active ? '#6366f1' : 'var(--muted-foreground)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <motion.div
                  animate={{ scale: active ? 1.1 : 1 }}
                  transition={snappy}
                >
                  <Icon size={16} />
                </motion.div>
                {label}
              </motion.button>
            )
          })}
        </div>
      </motion.div>

      {/* ─── 5. Day-mode options (animated reveal) ──────────────────────── */}
      <AnimatePresence>
        {planMode === 'day' && (
          <motion.div
            key="day-opts"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={snappy}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              ...glassCard(),
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}>
              {/* Week count stepper */}
              <div>
                <div style={sectionLabel}>Aantal weken</div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0,
                }}>
                  <motion.button
                    variants={scalePress}
                    whileTap="press"
                    onClick={() => onDayWeekCountChange(Math.max(1, dayWeekCount - 1))}
                    disabled={dayWeekCount <= 1}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '10px 0 0 10px',
                      border: '1px solid var(--border)',
                      borderRight: 'none',
                      background: 'rgba(255,255,255,0.8)',
                      color: dayWeekCount <= 1 ? 'var(--border)' : 'var(--foreground)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: dayWeekCount <= 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Minus size={14} />
                  </motion.button>
                  <div style={{
                    width: 56,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--border)',
                    background: 'rgba(99,102,241,0.04)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#6366f1',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {dayWeekCount}
                  </div>
                  <motion.button
                    variants={scalePress}
                    whileTap="press"
                    onClick={() => onDayWeekCountChange(Math.min(4, dayWeekCount + 1))}
                    disabled={dayWeekCount >= 4}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '0 10px 10px 0',
                      border: '1px solid var(--border)',
                      borderLeft: 'none',
                      background: 'rgba(255,255,255,0.8)',
                      color: dayWeekCount >= 4 ? 'var(--border)' : 'var(--foreground)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: dayWeekCount >= 4 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Plus size={14} />
                  </motion.button>
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    color: 'var(--muted-foreground)',
                    marginLeft: 10,
                  }}>
                    {dayWeekCount === 1 ? 'week' : 'weken'}
                  </span>
                </div>
              </div>

              {/* Work day preset chips */}
              <div>
                <div style={sectionLabel}>Werkdagen</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['ma-vr', 'ma-za', 'ma-zo'] as const).map((preset) => {
                    const active = workDayPreset === preset
                    const activeDays = DAY_CHIPS[preset]
                    return (
                      <motion.button
                        key={preset}
                        variants={scalePress}
                        whileTap="press"
                        onClick={() => onWorkDayPresetChange(preset)}
                        style={{
                          display: 'flex',
                          gap: 3,
                          padding: '7px 10px',
                          borderRadius: 10,
                          border: active
                            ? '2px solid rgba(99,102,241,0.4)'
                            : '1px solid var(--border)',
                          background: active
                            ? 'rgba(99,102,241,0.08)'
                            : 'transparent',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {ALL_DAYS.map((day) => {
                          const isActive = activeDays.includes(day)
                          return (
                            <span
                              key={day}
                              style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: 10,
                                fontWeight: isActive && active ? 700 : 500,
                                color: isActive && active
                                  ? '#6366f1'
                                  : isActive
                                    ? 'var(--foreground)'
                                    : 'var(--border)',
                                transition: 'color 0.2s ease',
                                width: 18,
                                textAlign: 'center',
                              }}
                            >
                              {day}
                            </span>
                          )
                        })}
                      </motion.button>
                    )
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 3. Template download — hero card ───────────────────────────── */}
      <motion.div variants={fadeInUp}>
        <div style={sectionLabel}>Template downloaden</div>
        <motion.button
          variants={scalePress}
          whileTap="press"
          onClick={handleDownload}
          disabled={processCount === 0}
          whileHover={processCount > 0 ? { y: -2, boxShadow: '0 12px 40px rgba(99,102,241,0.16)' } : undefined}
          style={{
            width: '100%',
            ...glassCard('1px solid rgba(99,102,241,0.15)'),
            padding: '20px 22px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            cursor: processCount > 0 ? 'pointer' : 'not-allowed',
            opacity: processCount === 0 ? 0.5 : 1,
            transition: 'box-shadow 0.3s ease, transform 0.3s ease',
            textAlign: 'left',
          }}
        >
          {/* Icon area */}
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: downloadClicked
              ? 'linear-gradient(135deg, #10b981, #059669)'
              : 'linear-gradient(135deg, #6366f1, #8B5CF6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: downloadClicked
              ? '0 4px 14px rgba(16,185,129,0.3)'
              : '0 4px 14px rgba(99,102,241,0.3)',
            transition: 'background 0.3s ease, box-shadow 0.3s ease',
          }}>
            <AnimatePresence mode="wait">
              {downloadClicked ? (
                <motion.div
                  key="check"
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  transition={bouncy}
                >
                  <Check size={22} color="#fff" />
                </motion.div>
              ) : (
                <motion.div
                  key="download"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={bouncy}
                >
                  <Download
                    size={22}
                    color="#fff"
                    style={{ animation: 'demandDownArrow 2s ease-in-out infinite' }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Text area */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--foreground)',
              marginBottom: 4,
            }}>
              Download Excel template
            </div>

            {processCount > 0 ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#6366f1',
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {processCount}
                </span>
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                }}>
                  processen
                </span>
                <span style={{ color: 'var(--border)', fontSize: 12 }}>&middot;</span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#6366f1',
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {weekCount}
                </span>
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                }}>
                  {weekCount === 1 ? 'week' : 'weken'}
                </span>
              </div>
            ) : (
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--muted-foreground)',
              }}>
                Geen processen gevonden — voeg eerst processen toe
              </div>
            )}

            {hasPreFilled && processCount > 0 && (
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                color: '#8B5CF6',
                fontWeight: 600,
                marginTop: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <FileSpreadsheet size={11} />
                {preFilledCount} waarden vooraf ingevuld
              </div>
            )}
          </div>

          {/* Arrow indicator */}
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(99,102,241,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Download size={14} color="#6366f1" />
          </div>
        </motion.button>
      </motion.div>

      {/* ─── 4. Upload zone ─────────────────────────────────────────────── */}
      <motion.div variants={fadeInUp}>
        <div style={sectionLabel}>Template uploaden</div>
        <motion.div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={onDropZoneClick}
          animate={{
            borderColor: isDragging
              ? '#6366f1'
              : hasFile && hasEntries
                ? '#10b981'
                : 'rgba(0,0,0,0.1)',
            background: isDragging
              ? 'rgba(99,102,241,0.06)'
              : hasFile && hasEntries
                ? 'rgba(16,185,129,0.04)'
                : 'rgba(255,255,255,0.6)',
          }}
          transition={{ duration: 0.2 }}
          style={{
            border: '2px dashed rgba(0,0,0,0.1)',
            borderRadius: 16,
            padding: '32px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />

          {/* Glow ring on drag */}
          <AnimatePresence>
            {isDragging && (
              <motion.div
                key="glow"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  position: 'absolute',
                  inset: -2,
                  borderRadius: 18,
                  border: '2px solid rgba(99,102,241,0.4)',
                  boxShadow: '0 0 24px rgba(99,102,241,0.15)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </AnimatePresence>

          {hasFile && hasEntries ? (
            /* ── Uploaded state ── */
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={bouncy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 18px',
                borderRadius: 12,
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.2)',
                width: '100%',
              }}
            >
              <div style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #10b981, #059669)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(16,185,129,0.25)',
              }}>
                <Check size={18} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#10b981',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {uploadedFile!.name}
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  <AnimatedCounter
                    value={entries.length}
                    style={{ fontWeight: 700, fontSize: 12, color: '#10b981' }}
                  />
                  <span>geldige entries</span>
                </div>
              </div>
            </motion.div>
          ) : (
            /* ── Empty state ── */
            <>
              <motion.div
                animate={isDragging ? { scale: 1.15 } : { scale: 1 }}
                transition={bouncy}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: isDragging
                    ? 'linear-gradient(135deg, #6366f1, #8B5CF6)'
                    : 'rgba(99,102,241,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: isDragging ? undefined : 'demandFloat 3s ease-in-out infinite',
                  transition: 'background 0.2s ease',
                }}
              >
                <Upload
                  size={20}
                  color={isDragging ? '#fff' : '#6366f1'}
                />
              </motion.div>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: 600,
                color: isDragging ? '#6366f1' : 'var(--foreground)',
                textAlign: 'center',
                transition: 'color 0.2s ease',
              }}>
                Sleep je Excel hier of klik om te bladeren
              </div>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                color: 'var(--muted-foreground)',
                background: 'rgba(99,102,241,0.05)',
                padding: '3px 10px',
                borderRadius: 6,
              }}>
                .xlsx of .xls
              </div>
            </>
          )}
        </motion.div>
      </motion.div>

      {/* ─── Validation results ─────────────────────────────────────────── */}
      <AnimatePresence>
        {hasFile && (
          <motion.div
            key="validation"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={snappy}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Success count */}
              {hasEntries && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={bouncy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                    borderRadius: 12,
                    background: 'rgba(16,185,129,0.06)',
                    border: '1px solid rgba(16,185,129,0.2)',
                  }}
                >
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Check size={14} color="#fff" />
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    color: '#10b981',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    <AnimatedCounter
                      value={entries.length}
                      style={{ fontWeight: 700, fontSize: 13, color: '#10b981' }}
                    />
                    geldige entries gevonden
                  </span>
                </motion.div>
              )}

              {/* Errors (expandable) */}
              {hasErrors && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...bouncy, delay: 0.05 }}
                  style={{
                    borderRadius: 12,
                    background: 'rgba(239,68,68,0.05)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => setErrorsExpanded(!errorsExpanded)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 16px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <AlertCircle size={14} color="#fff" />
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      color: '#ef4444',
                      fontWeight: 600,
                      flex: 1,
                      textAlign: 'left',
                    }}>
                      {parseErrors.length} waarschuwing{parseErrors.length > 1 ? 'en' : ''}
                    </span>
                    <motion.div
                      animate={{ rotate: errorsExpanded ? 180 : 0 }}
                      transition={snappy}
                    >
                      <ChevronDown size={14} color="#ef4444" />
                    </motion.div>
                  </button>
                  <AnimatePresence>
                    {errorsExpanded && (
                      <motion.div
                        key="error-list"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={snappy}
                        style={{ overflow: 'hidden' }}
                      >
                        <div style={{
                          padding: '0 16px 12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                        }}>
                          {parseErrors.slice(0, 10).map((err, i) => (
                            <div key={i} style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: 12,
                              color: 'var(--muted-foreground)',
                              paddingLeft: 38,
                            }}>
                              {err}
                            </div>
                          ))}
                          {parseErrors.length > 10 && (
                            <div style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: 12,
                              color: 'var(--muted-foreground)',
                              paddingLeft: 38,
                              fontWeight: 600,
                            }}>
                              + {parseErrors.length - 10} meer...
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* ─── 6. Unknown processes banner ────────────────────────── */}
              {unknownProcessNames.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...bouncy, delay: 0.1 }}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.04))',
                    border: '1px solid rgba(99,102,241,0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}>
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, #6366f1, #8B5CF6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Plus size={14} color="#fff" />
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      color: '#6366f1',
                      fontWeight: 600,
                    }}>
                      {unknownProcessNames.length} nieuw{unknownProcessNames.length > 1 ? 'e' : ''} proces{unknownProcessNames.length > 1 ? 'sen' : ''} — worden automatisch aangemaakt
                    </span>
                  </div>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    paddingLeft: 38,
                  }}>
                    {unknownProcessNames.slice(0, 8).map((name, i) => (
                      <motion.span
                        key={name}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ ...bouncy, delay: 0.15 + i * 0.03 }}
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#6366f1',
                          background: 'rgba(99,102,241,0.1)',
                          border: '1px solid rgba(99,102,241,0.2)',
                          padding: '3px 10px',
                          borderRadius: 8,
                        }}
                      >
                        {name}
                      </motion.span>
                    ))}
                    {unknownProcessNames.length > 8 && (
                      <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--muted-foreground)',
                        padding: '3px 10px',
                      }}>
                        + {unknownProcessNames.length - 8} meer
                      </span>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Empty file warning */}
              {!hasEntries && !hasErrors && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={bouncy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                    borderRadius: 12,
                    background: 'rgba(245,158,11,0.06)',
                    border: '1px solid rgba(245,158,11,0.2)',
                  }}
                >
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <AlertCircle size={14} color="#fff" />
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    color: '#f59e0b',
                    fontWeight: 600,
                  }}>
                    Geen geldige data gevonden in het bestand
                  </span>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
