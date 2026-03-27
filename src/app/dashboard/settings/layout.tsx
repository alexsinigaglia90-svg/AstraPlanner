'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { gentle } from '@/lib/motion'

const tabs = [
  { label: 'Organization', href: '/dashboard/settings' },
  { label: 'Sites', href: '/dashboard/settings/sites' },
  { label: 'Shifts', href: '/dashboard/settings/shifts' },
  { label: 'Roles', href: '/dashboard/settings/roles' },
  { label: 'Equipment', href: '/dashboard/settings/equipment' },
  { label: 'Audit Log', href: '/dashboard/settings/audit' },
  { label: 'Team', href: '/dashboard/settings/team' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-8 pt-8 pb-0 border-b"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
      >
        <h1
          className="text-2xl font-bold mb-6"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--foreground)' }}
        >
          Settings
        </h1>

        {/* Tab bar */}
        <div className="flex gap-1 relative">
          {tabs.map((tab) => {
            const isActive =
              tab.href === '/dashboard/settings'
                ? pathname === '/dashboard/settings'
                : pathname.startsWith(tab.href)

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="relative px-4 py-2 text-sm font-medium transition-colors duration-150"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: isActive ? 'var(--primary)' : 'var(--muted-foreground)',
                }}
              >
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="settings-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                    style={{ backgroundColor: 'var(--primary)' }}
                    transition={gentle}
                  />
                )}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-auto p-8"
        style={{ backgroundColor: 'var(--background)' }}
      >
        {children}
      </div>
    </div>
  )
}
