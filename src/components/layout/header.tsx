'use client'

import { Bell } from 'lucide-react'
import { motion } from 'framer-motion'
import { scalePress } from '@/lib/motion'

export function Header() {
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
          {/* Badge dot */}
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
            style={{ backgroundColor: 'var(--primary)' }}
          />
        </motion.button>

        {/* User avatar */}
        <motion.button
          variants={scalePress}
          whileTap="press"
          className="w-9 h-9 rounded-full flex items-center justify-center font-display font-bold text-sm text-[var(--primary-foreground)] transition-opacity duration-150 hover:opacity-90"
          style={{ backgroundColor: 'var(--primary)' }}
          aria-label="User menu"
        >
          AP
        </motion.button>
      </div>
    </header>
  )
}
