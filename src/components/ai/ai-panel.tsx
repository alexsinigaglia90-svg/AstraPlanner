'use client'

import { useRef, useEffect, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { motion, AnimatePresence } from 'framer-motion'
import { bouncy } from '@/lib/motion'

/* ── Types ───────────────────────────────────────────────── */
interface AiPanelProps {
  open: boolean
  onClose: () => void
}

/* ── Panel ───────────────────────────────────────────────── */
export function AiPanel({ open, onClose }: AiPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState('')

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/ai/chat' }),
  })

  const busy = status === 'submitted' || status === 'streaming'

  /* auto-scroll on new message */
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  /* focus input when panel opens */
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300)
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || busy) return
    sendMessage({ text: input })
    setInput('')
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={bouncy}
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 380,
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderLeft: '1px solid rgba(99,102,241,0.1)',
            boxShadow: '-8px 0 30px rgba(0,0,0,0.08)',
          }}
        >
          {/* ── Header ──────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid rgba(99,102,241,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#6366F1',
                  animation: 'astraPulse 2s ease-in-out infinite',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 16,
                  color: '#1e1b4b',
                }}
              >
                AstraAI
              </span>
            </div>
            <button
              onClick={onClose}
              aria-label="Sluit AI-paneel"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 8,
                color: '#6b7280',
                fontSize: 20,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {/* ── Messages ────────────────────────────────── */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 16px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {messages.map((m) => {
              const isUser = m.role === 'user'
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  {m.parts?.map((part, i) => {
                    if (part.type === 'text' && part.text) {
                      return (
                        <div
                          key={`${m.id}-${i}`}
                          style={{
                            maxWidth: '85%',
                            padding: '10px 14px',
                            borderRadius: isUser
                              ? '16px 16px 4px 16px'
                              : '16px 16px 16px 4px',
                            background: isUser ? '#6366F1' : '#f1f0fb',
                            color: isUser ? '#fff' : '#1e1b4b',
                            fontFamily: 'var(--font-body)',
                            fontSize: 14,
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {part.text}
                        </div>
                      )
                    }

                    /* Tool result card */
                    if (
                      part.type?.startsWith('tool-') &&
                      'state' in part &&
                      (part as Record<string, unknown>).state === 'output-available'
                    ) {
                      return (
                        <div
                          key={`${m.id}-tool-${i}`}
                          style={{
                            maxWidth: '85%',
                            padding: '8px 12px',
                            borderRadius: 12,
                            background: '#ecfdf5',
                            border: '1px solid #a7f3d0',
                            fontFamily: 'var(--font-body)',
                            fontSize: 12,
                            color: '#065f46',
                            marginTop: 4,
                          }}
                        >
                          Actie uitgevoerd
                        </div>
                      )
                    }

                    return null
                  })}
                </div>
              )
            })}

            {/* typing indicator */}
            {busy && (
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  padding: '8px 12px',
                  alignSelf: 'flex-start',
                }}
              >
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: '#6366F1',
                      opacity: 0.5,
                      animation: `astraTyping 1.2s ease-in-out ${dot * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Input ───────────────────────────────────── */}
          <form
            onSubmit={handleSubmit}
            style={{
              display: 'flex',
              gap: 8,
              padding: '12px 16px 16px',
              borderTop: '1px solid rgba(99,102,241,0.08)',
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Stel een vraag..."
              disabled={busy}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                background: '#fafafa',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                border: 'none',
                background:
                  input.trim() && !busy ? '#6366F1' : '#e0e0e0',
                color: '#fff',
                cursor:
                  input.trim() && !busy ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                transition: 'background 0.15s',
              }}
            >
              &uarr;
            </button>
          </form>

          {/* ── Keyframe animations ─────────────────────── */}
          <style>{`
            @keyframes astraPulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.5; transform: scale(0.85); }
            }
            @keyframes astraTyping {
              0%, 100% { opacity: 0.3; transform: translateY(0); }
              50% { opacity: 1; transform: translateY(-3px); }
            }
          `}</style>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
