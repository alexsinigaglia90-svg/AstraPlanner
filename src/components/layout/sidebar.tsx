'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Calendar,
  Users,
  TrendingUp,
  Settings,
  ChevronLeft,
  ChevronRight,
  GitBranch,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { gentle, scalePress } from '@/lib/motion'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Planning', href: '/planning', icon: Calendar },
  { label: 'Employees', href: '/dashboard/employees', icon: Users },
  { label: 'Processes', href: '/dashboard/processes', icon: GitBranch },
  { label: 'Demand', href: '/demand', icon: TrendingUp },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={gentle}
      className="hidden md:flex flex-col h-full bg-[var(--card)] border-r border-[var(--border)] overflow-hidden flex-shrink-0"
      style={{ boxShadow: 'var(--elevation-1)' }}
    >
      {/* Logo area */}
      <div className="h-14 flex items-center px-4 border-b border-[var(--border)] flex-shrink-0">
        <AnimatePresence mode="wait">
          {!collapsed ? (
            <motion.span
              key="logo-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="font-display font-bold text-lg text-[var(--foreground)] whitespace-nowrap"
            >
              AstraPlanner
            </motion.span>
          ) : (
            <motion.span
              key="logo-icon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="font-display font-bold text-lg text-[var(--primary)]"
            >
              A
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-4 flex flex-col gap-1 px-2">
        {navItems.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <motion.div key={href} variants={scalePress} whileTap="press">
              <Link
                href={href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] relative transition-colors duration-150 group"
                style={
                  isActive
                    ? {
                        backgroundColor: 'rgba(99,102,241,0.08)',
                        color: 'var(--primary)',
                      }
                    : { color: 'var(--muted-foreground)' }
                }
              >
                {/* Active indicator bar */}
                {isActive && (
                  <motion.div
                    layoutId="active-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-[var(--radius-full)]"
                    style={{ backgroundColor: 'var(--primary)' }}
                    transition={gentle}
                  />
                )}

                <Icon
                  size={20}
                  className="flex-shrink-0"
                  style={{ color: isActive ? 'var(--primary)' : 'var(--muted-foreground)' }}
                />

                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15 }}
                      className="font-body text-sm font-medium whitespace-nowrap overflow-hidden"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            </motion.div>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 pb-4">
        <motion.button
          variants={scalePress}
          whileTap="press"
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-[var(--radius-sm)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-150"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="font-body text-sm whitespace-nowrap overflow-hidden"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </motion.aside>
  )
}
