'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, CheckCircle, X } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface Toast {
  id: number
  message: string
  type: 'error' | 'success'
}

interface ToastContextValue {
  showError: (message: string) => void
  showSuccess: (message: string) => void
}

// ── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({
  showError: () => {},
  showSuccess: () => {},
})

export function useToast() {
  return useContext(ToastContext)
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((message: string, type: 'error' | 'success') => {
    const id = ++idRef.current
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => dismiss(id), 5000)
  }, [dismiss])

  const showError = useCallback((message: string) => show(message, 'error'), [show])
  const showSuccess = useCallback((message: string) => show(message, 'success'), [show])

  return (
    <ToastContext.Provider value={{ showError, showSuccess }}>
      {children}

      {/* Toast container — fixed bottom-right */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
          maxWidth: 400,
        }}
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 16px',
                borderRadius: 12,
                backgroundColor: 'var(--card)',
                border: `1px solid ${toast.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                pointerEvents: 'auto',
              }}
            >
              {toast.type === 'error' ? (
                <AlertCircle size={16} style={{ color: 'var(--destructive)', flexShrink: 0, marginTop: 1 }} />
              ) : (
                <CheckCircle size={16} style={{ color: '#10b981', flexShrink: 0, marginTop: 1 }} />
              )}
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--foreground)',
                lineHeight: 1.4,
                flex: 1,
              }}>
                {toast.message}
              </span>
              <button
                onClick={() => dismiss(toast.id)}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: 'var(--muted-foreground)', cursor: 'pointer',
                  flexShrink: 0, display: 'flex',
                }}
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
