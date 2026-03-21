'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { FileText, ChevronDown, ChevronRight } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { fadeInUp, containerStagger } from '@/lib/motion'

export default function AuditLogPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { data, isLoading, error } = trpc.admin.getAuditLog.useQuery({
    limit: 50,
  })

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '900px' }}
    >
      <motion.div variants={fadeInUp} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 'var(--radius-sm)',
          backgroundColor: 'rgba(99,102,241,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <FileText size={20} style={{ color: 'var(--primary)' }} />
        </div>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
            Audit Log
          </h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>
            All state-changing operations
          </p>
        </div>
      </motion.div>

      {error && (
        <div style={{
          padding: '16px', borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--card)', border: '1px solid var(--destructive)',
          color: 'var(--destructive)', fontFamily: 'var(--font-body)', fontSize: '13px',
        }}>
          {error.message}
        </div>
      )}

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse" style={{
              height: 56, borderRadius: 'var(--radius-md)', backgroundColor: 'var(--muted)',
            }} />
          ))}
        </div>
      )}

      {data && (
        <motion.div variants={fadeInUp} style={{
          backgroundColor: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        }}>
          {data.items.length === 0 ? (
            <div style={{
              padding: '48px 24px', textAlign: 'center',
              fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--muted-foreground)',
            }}>
              No audit entries yet. Changes to employees, skills, and availability will appear here.
            </div>
          ) : (
            data.items.map((entry, i) => {
              const isExpanded = expandedId === (entry as Record<string, unknown>).id as string
              const e = entry as Record<string, unknown>
              return (
                <div key={e.id as string} style={{
                  borderBottom: i < data.items.length - 1 ? '1px solid var(--border)' : undefined,
                }}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : e.id as string)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
                      transition: 'background-color 0.1s',
                    }}
                    onMouseEnter={(el) => { el.currentTarget.style.backgroundColor = 'var(--muted)' }}
                    onMouseLeave={(el) => { el.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    {isExpanded ? <ChevronDown size={14} style={{ color: 'var(--muted-foreground)' }} /> : <ChevronRight size={14} style={{ color: 'var(--muted-foreground)' }} />}
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '11px',
                      color: 'var(--muted-foreground)', width: 140, textAlign: 'left', flexShrink: 0,
                    }}>
                      {new Date(e.created_at as string).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 600,
                      color: 'var(--foreground)', flex: 1, textAlign: 'left',
                    }}>
                      {e.action as string}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '11px',
                      backgroundColor: 'var(--muted)', padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)', color: 'var(--muted-foreground)',
                    }}>
                      {e.entity_type as string}
                    </span>
                  </button>

                  {isExpanded && (
                    <div style={{
                      padding: '0 16px 16px 42px',
                      fontFamily: 'var(--font-mono)', fontSize: '11px',
                      color: 'var(--muted-foreground)', lineHeight: 1.6,
                    }}>
                      <pre style={{
                        backgroundColor: 'var(--muted)', padding: '12px',
                        borderRadius: 'var(--radius-sm)', overflow: 'auto',
                        maxHeight: 200, margin: 0,
                      }}>
                        {JSON.stringify(e, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </motion.div>
      )}
    </motion.div>
  )
}
