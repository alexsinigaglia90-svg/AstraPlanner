'use client'

import { motion } from 'framer-motion'
import { Upload, Download, Check, AlertCircle } from 'lucide-react'
import { scalePress } from '@/lib/motion'
import type { PlanMode, WorkDayPreset, ParsedDemand } from './demand-upload-wizard'

// ── Styles ────────────────────────────────────────────────────────────────────

const pillStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  borderRadius: 20,
  border: active ? '2px solid #6366f1' : '1px solid var(--border)',
  background: active ? 'rgba(99,102,241,0.1)' : 'transparent',
  color: active ? '#6366f1' : 'var(--muted-foreground)',
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  fontWeight: active ? 700 : 500,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
})

// ── Props ─────────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

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
  const hasFile = uploadedFile !== null
  const hasEntries = entries.length > 0
  const hasErrors = parseErrors.length > 0

  const templateDesc = planMode === 'week'
    ? `${demandTypes.length} processen — 8 weken vooraf ingevuld`
    : `${demandTypes.length} processen — ${dayWeekCount} ${dayWeekCount === 1 ? 'week' : 'weken'} per dag`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Mode selector */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onPlanModeChange('week')} style={pillStyle(planMode === 'week')}>
          Per week
        </button>
        <button onClick={() => onPlanModeChange('day')} style={pillStyle(planMode === 'day')}>
          Per dag
        </button>
      </div>

      {/* Day mode options */}
      {planMode === 'day' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 14,
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'rgba(99,102,241,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--foreground)',
              whiteSpace: 'nowrap',
            }}>
              Hoeveel weken?
            </label>
            <select
              value={dayWeekCount}
              onChange={(e) => onDayWeekCountChange(Number(e.target.value))}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--foreground)',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
              }}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? 'week' : 'weken'}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--foreground)',
              whiteSpace: 'nowrap',
            }}>
              Werkdagen
            </label>
            {(['ma-vr', 'ma-za', 'ma-zo'] as const).map((preset) => (
              <button
                key={preset}
                onClick={() => onWorkDayPresetChange(preset)}
                style={pillStyle(workDayPreset === preset)}
              >
                {preset === 'ma-vr' ? 'Ma-Vr' : preset === 'ma-za' ? 'Ma-Za' : 'Ma-Zo'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Download section */}
      <div style={{
        padding: 16,
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--foreground)',
            marginBottom: 4,
          }}>
            Stap 1: Download de template
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--muted-foreground)',
          }}>
            {demandTypes.length > 0
              ? templateDesc
              : 'Geen demand types gevonden — voeg eerst processen toe'}
          </div>
        </div>
        <motion.button
          variants={scalePress}
          whileTap="press"
          onClick={onDownloadTemplate}
          disabled={demandTypes.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 8,
            border: '2px solid #6366f1',
            background: 'transparent',
            color: '#6366f1',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 700,
            cursor: demandTypes.length > 0 ? 'pointer' : 'not-allowed',
            whiteSpace: 'nowrap',
            opacity: demandTypes.length === 0 ? 0.4 : 1,
          }}
        >
          <Download size={14} />
          Template
        </motion.button>
      </div>

      {/* Upload zone */}
      <div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--foreground)',
          marginBottom: 8,
        }}>
          Stap 2: Upload het ingevulde template
        </div>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={onDropZoneClick}
          style={{
            border: `2px dashed ${isDragging ? '#6366f1' : hasFile && hasEntries ? '#10b981' : 'var(--border)'}`,
            borderRadius: 10,
            padding: '28px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: 'pointer',
            transition: 'border-color 0.2s, background 0.2s',
            background: isDragging
              ? 'rgba(99,102,241,0.06)'
              : hasFile && hasEntries
              ? 'rgba(16,185,129,0.05)'
              : 'transparent',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
          {hasFile && hasEntries ? (
            <Check size={24} color="#10b981" />
          ) : (
            <Upload size={24} color={isDragging ? '#6366f1' : 'var(--muted-foreground)'} />
          )}
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 600,
            color: hasFile && hasEntries
              ? '#10b981'
              : isDragging
              ? '#6366f1'
              : 'var(--foreground)',
          }}>
            {hasFile
              ? uploadedFile.name
              : 'Sleep je Excel hier of klik om te bladeren'}
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--muted-foreground)',
          }}>
            .xlsx of .xls
          </div>
        </div>
      </div>

      {/* Validation summary */}
      {hasFile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hasEntries && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.3)',
            }}>
              <Check size={14} color="#10b981" />
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: '#10b981',
                fontWeight: 600,
              }}>
                {entries.length} geldige entries gevonden
              </span>
            </div>
          )}
          {hasErrors && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 2,
              }}>
                <AlertCircle size={14} color="#ef4444" />
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  color: '#ef4444',
                  fontWeight: 600,
                }}>
                  {parseErrors.length} waarschuwing{parseErrors.length > 1 ? 'en' : ''}
                </span>
              </div>
              {parseErrors.slice(0, 5).map((err, i) => (
                <div key={i} style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                  paddingLeft: 20,
                }}>
                  {err}
                </div>
              ))}
              {parseErrors.length > 5 && (
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                  paddingLeft: 20,
                }}>
                  + {parseErrors.length - 5} meer...
                </div>
              )}
            </div>
          )}
          {unknownProcessNames.length > 0 && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 2,
              }}>
                <AlertCircle size={14} color="#6366f1" />
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  color: '#6366f1',
                  fontWeight: 600,
                }}>
                  {unknownProcessNames.length} nieuw{unknownProcessNames.length > 1 ? 'e' : ''} proces{unknownProcessNames.length > 1 ? 'sen' : ''} — worden automatisch aangemaakt
                </span>
              </div>
              {unknownProcessNames.slice(0, 5).map((name, i) => (
                <div key={i} style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                  paddingLeft: 20,
                }}>
                  {name}
                </div>
              ))}
              {unknownProcessNames.length > 5 && (
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                  paddingLeft: 20,
                }}>
                  + {unknownProcessNames.length - 5} meer...
                </div>
              )}
            </div>
          )}
          {!hasEntries && !hasErrors && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.3)',
            }}>
              <AlertCircle size={14} color="#f59e0b" />
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: '#f59e0b',
                fontWeight: 600,
              }}>
                Geen geldige data gevonden in het bestand
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
