'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, ChevronDown, Check } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { bouncy } from '@/lib/motion'

export function SiteSelector() {
  const { data: sites, isLoading } = trpc.org.listSites.useQuery()
  const { activeSiteId, setActiveSite } = useSiteStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Auto-select first site if none selected
  useEffect(() => {
    if (!activeSiteId && sites && sites.length > 0) {
      setActiveSite(sites[0]!.id)
    }
  }, [activeSiteId, sites, setActiveSite])

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const activeSite = sites?.find((s) => s.id === activeSiteId)

  if (isLoading) {
    return (
      <div
        className="animate-pulse h-8 rounded-lg"
        style={{ width: 160, backgroundColor: 'var(--muted)' }}
      />
    )
  }

  if (!sites || sites.length === 0) return null

  // Single site — show as static label, no dropdown
  if (sites.length === 1) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
        style={{
          backgroundColor: 'rgba(99,102,241,0.06)',
          border: '1px solid rgba(99,102,241,0.1)',
        }}
      >
        <MapPin size={14} style={{ color: 'var(--primary)' }} />
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--foreground)',
          }}
        >
          {sites[0]!.name}
        </span>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-150"
        style={{
          backgroundColor: open ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.06)',
          border: `1px solid ${open ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.1)'}`,
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <MapPin size={14} style={{ color: 'var(--primary)' }} />
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--foreground)',
            maxWidth: 180,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {activeSite?.name ?? 'Select site'}
        </span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={14} style={{ color: 'var(--muted-foreground)' }} />
        </motion.div>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: bouncy }}
            exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.12 } }}
            className="absolute left-0 mt-2 min-w-[240px] py-1"
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--elevation-3)',
              zIndex: 'var(--z-dropdown)',
            }}
          >
            <div
              className="px-3 py-2"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--muted-foreground)',
              }}
            >
              Switch site
            </div>

            {sites.map((site) => {
              const isActive = site.id === activeSiteId
              return (
                <button
                  key={site.id}
                  onClick={() => {
                    setActiveSite(site.id)
                    setOpen(false)
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors duration-100"
                  style={{
                    backgroundColor: isActive ? 'rgba(99,102,241,0.06)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'var(--muted)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isActive
                      ? 'rgba(99,102,241,0.06)'
                      : 'transparent'
                  }}
                >
                  {/* Status dot */}
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: site.is_active
                        ? 'var(--success)'
                        : 'var(--muted-foreground)',
                    }}
                  />

                  <div className="flex-1 text-left">
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        fontWeight: isActive ? 600 : 500,
                        color: 'var(--foreground)',
                      }}
                    >
                      {site.name}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      {(site as Record<string, unknown>).code as string ?? site.timezone}
                    </div>
                  </div>

                  {/* Check mark for active */}
                  {isActive && (
                    <Check size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  )}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
