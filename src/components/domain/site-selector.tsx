'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, ChevronDown, Check, Search } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { bouncy } from '@/lib/motion'

export function SiteSelector() {
  const { data: sites, isLoading } = trpc.org.listSites.useQuery()
  const { activeSiteId, setActiveSite } = useSiteStore()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

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
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Focus search on open
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50)
  }, [open])

  const activeSite = sites?.find((s) => s.id === activeSiteId)
  const filtered = sites?.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    const code = (s as Record<string, unknown>).code as string | undefined
    return s.name.toLowerCase().includes(q) || code?.toLowerCase().includes(q)
  })

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-md"
        style={{ width: 120, height: 28, backgroundColor: 'var(--muted)' }}
      />
    )
  }

  if (!sites || sites.length === 0) return null

  // Single site — compact static label
  if (sites.length === 1) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md"
        style={{ backgroundColor: 'rgba(99,102,241,0.05)' }}
      >
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--success)' }} />
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 600,
          color: 'var(--foreground)',
        }}>
          {sites[0]!.name}
        </span>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      {/* Compact trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all duration-150"
        style={{
          backgroundColor: open ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.04)',
          border: `1px solid ${open ? 'rgba(99,102,241,0.15)' : 'transparent'}`,
          cursor: 'pointer',
          outline: 'none',
          height: 30,
        }}
      >
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--success)' }} />
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 600,
          color: 'var(--foreground)',
          maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {activeSite?.name ?? 'Select site'}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown size={12} style={{ color: 'var(--muted-foreground)' }} />
        </motion.div>
      </button>

      {/* Dropdown with search */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: bouncy }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } }}
            className="absolute left-0 mt-1.5 w-[280px]"
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--elevation-3)',
              zIndex: 'var(--z-dropdown)',
              overflow: 'hidden',
            }}
          >
            {/* Search input */}
            <div className="px-2 pt-2 pb-1">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--muted-foreground)' }}
                />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search sites..."
                  className="w-full outline-none"
                  style={{
                    height: 32, borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    padding: '0 10px 0 30px',
                    fontSize: '12px', fontFamily: 'var(--font-body)',
                    color: 'var(--foreground)',
                    backgroundColor: 'var(--background)',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = 'rgba(99,102,241,0.4)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                />
              </div>
            </div>

            {/* Site list */}
            <div style={{ maxHeight: 240, overflowY: 'auto', padding: '4px 0' }}>
              {filtered && filtered.length > 0 ? filtered.map((site) => {
                const isActive = site.id === activeSiteId
                const code = (site as Record<string, unknown>).code as string | undefined
                return (
                  <button
                    key={site.id}
                    onClick={() => {
                      setActiveSite(site.id)
                      setOpen(false)
                      setSearch('')
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 transition-colors duration-75"
                    style={{
                      backgroundColor: isActive ? 'rgba(99,102,241,0.06)' : 'transparent',
                      border: 'none', cursor: 'pointer', outline: 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.backgroundColor = 'var(--muted)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isActive ? 'rgba(99,102,241,0.06)' : 'transparent'
                    }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: site.is_active ? 'var(--success)' : 'var(--muted-foreground)' }}
                    />
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <span style={{
                          fontFamily: 'var(--font-body)', fontSize: '12px',
                          fontWeight: isActive ? 600 : 500, color: 'var(--foreground)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {site.name}
                        </span>
                        {code && (
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: '10px',
                            color: 'var(--muted-foreground)',
                            backgroundColor: 'var(--muted)',
                            padding: '1px 5px', borderRadius: 'var(--radius-sm)',
                          }}>
                            {code}
                          </span>
                        )}
                      </div>
                    </div>
                    {isActive && <Check size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
                  </button>
                )
              }) : (
                <div className="px-3 py-4 text-center"
                  style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)' }}
                >
                  No sites match &ldquo;{search}&rdquo;
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
