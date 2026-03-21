'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, LogOut } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { scalePress, bouncy } from '@/lib/motion'
import { createClient } from '@/lib/supabase/client'

export function Header() {
  const router = useRouter()
  const [showMenu, setShowMenu] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header
      className="h-14 flex-shrink-0 flex items-center justify-between px-6 sticky top-0 z-[var(--z-sticky)] bg-[var(--card)] border-b border-[var(--border)]"
      style={{ boxShadow: 'var(--elevation-1)' }}
    >
      {/* Logo */}
      <span className="font-display font-bold text-xl text-[var(--foreground)]">
        AstraPlanner
      </span>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <motion.button
          variants={scalePress}
          whileTap="press"
          className="relative p-2 rounded-[var(--radius-sm)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-150"
          aria-label="Notifications"
        >
          <Bell size={20} />
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
            style={{ backgroundColor: 'var(--primary)' }}
          />
        </motion.button>

        {/* User avatar + dropdown */}
        <div className="relative">
          <motion.button
            variants={scalePress}
            whileTap="press"
            onClick={() => setShowMenu((v) => !v)}
            className="w-9 h-9 rounded-full flex items-center justify-center font-display font-bold text-sm text-[var(--primary-foreground)] transition-opacity duration-150 hover:opacity-90"
            style={{ backgroundColor: 'var(--primary)' }}
            aria-label="User menu"
          >
            AP
          </motion.button>

          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: bouncy }}
                exit={{ opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.15 } }}
                className="absolute right-0 mt-2 py-1 min-w-[160px]"
                style={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--elevation-3)',
                }}
              >
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[var(--muted)] transition-colors duration-150"
                  style={{
                    color: 'var(--destructive)',
                    fontFamily: 'var(--font-body)',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <LogOut size={16} />
                  {loggingOut ? 'Logging out...' : 'Sign out'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
