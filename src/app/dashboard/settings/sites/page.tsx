'use client'

import { motion } from 'framer-motion'
import { MapPin, Clock, Plus, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { fadeInUp, containerStagger, scalePress, bouncy } from '@/lib/motion'

function SiteCardSkeleton() {
  return (
    <div
      className="rounded-[var(--radius-lg)] p-5 animate-pulse"
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', height: 120 }}
    />
  )
}

export default function SiteListPage() {
  const router = useRouter()
  const { data: sites, isLoading, error } = trpc.org.listSites.useQuery()

  if (error) {
    return (
      <div
        className="rounded-[var(--radius-md)] p-6 text-sm"
        style={{ backgroundColor: 'var(--card)', border: '1px solid var(--destructive)', color: 'var(--destructive)' }}
      >
        Failed to load sites: {error.message}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Page header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--foreground)' }}
          >
            Sites
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>
            Manage locations and their operational settings
          </p>
        </div>

        <motion.button
          variants={scalePress}
          whileTap="press"
          disabled
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-sm)] text-sm font-medium cursor-not-allowed"
          style={{
            fontFamily: 'var(--font-body)',
            backgroundColor: 'var(--muted)',
            color: 'var(--muted-foreground)',
          }}
          title="Coming soon"
        >
          <Plus size={16} />
          Add Site
        </motion.button>
      </div>

      {/* Site cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SiteCardSkeleton key={i} />)}
        </div>
      ) : sites && sites.length > 0 ? (
        <motion.div
          variants={containerStagger}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          {sites.map((site) => (
            <motion.div
              key={site.id}
              variants={fadeInUp}
              whileHover={{ y: -2, boxShadow: 'var(--elevation-3)' }}
              whileTap={{ scale: 0.98 }}
              transition={bouncy}
              onClick={() => router.push(`/dashboard/settings/sites/${site.id}`)}
              className="rounded-[var(--radius-lg)] p-5 cursor-pointer group"
              style={{
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--elevation-1)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3
                      className="text-base font-bold truncate"
                      style={{ fontFamily: 'var(--font-display)', color: 'var(--foreground)' }}
                    >
                      {site.name}
                    </h3>
                    {/* Status badge */}
                    <span
                      className="flex-shrink-0 text-xs px-2 py-0.5 rounded-[var(--radius-full)] font-medium"
                      style={{
                        backgroundColor: site.is_active
                          ? 'color-mix(in srgb, var(--success) 12%, transparent)'
                          : 'color-mix(in srgb, var(--muted-foreground) 12%, transparent)',
                        color: site.is_active ? 'var(--success)' : 'var(--muted-foreground)',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {site.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {site.address && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <MapPin size={13} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                      <span
                        className="text-xs truncate"
                        style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}
                      >
                        {site.address}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Clock size={13} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                    <span
                      className="text-xs"
                      style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}
                    >
                      {site.timezone}
                    </span>
                  </div>
                </div>

                <ChevronRight
                  size={18}
                  className="flex-shrink-0 mt-0.5 transition-transform duration-150 group-hover:translate-x-0.5"
                  style={{ color: 'var(--muted-foreground)' }}
                />
              </div>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div
          className="rounded-[var(--radius-lg)] p-12 text-center"
          style={{ backgroundColor: 'var(--card)', border: '1px dashed var(--border)' }}
        >
          <MapPin size={32} className="mx-auto mb-3" style={{ color: 'var(--muted-foreground)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>
            No sites found. Add a site to get started.
          </p>
        </div>
      )}
    </div>
  )
}
