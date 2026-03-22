'use client'

import { useState, use } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Pencil, Check, X, MapPin, Clock, Users, Building } from 'lucide-react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { fadeInUp, containerStagger, scalePress } from '@/lib/motion'

function SkeletonLine({ width = '60%' }: { width?: string }) {
  return (
    <div
      className="animate-pulse h-4 rounded"
      style={{ backgroundColor: 'var(--muted)', width }}
    />
  )
}

interface PageProps {
  params: Promise<{ siteId: string }>
}

export default function SiteDetailPage({ params }: PageProps) {
  const { siteId } = use(params)

  const { data: site, isLoading, error } = trpc.org.getSite.useQuery({ id: siteId })
  const { data: departments, isLoading: deptLoading } = trpc.org.listDepartments.useQuery({ site_id: siteId })
  const utils = trpc.useUtils()

  const mutation = trpc.org.updateSiteSettings.useMutation({
    onSuccess: () => {
      utils.org.getSite.invalidate({ id: siteId })
      setEditing(false)
    },
  })

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: '',
    timezone: '',
    address: '',
    allowance_factor: '',
    absenteeism_rate: '',
    max_headcount: '',
  })

  function handleEdit() {
    setForm({
      name: site?.name ?? '',
      timezone: site?.timezone ?? '',
      address: site?.address ?? '',
      allowance_factor: String(site?.settings_json?.allowance_factor ?? ''),
      absenteeism_rate: String(site?.settings_json?.absenteeism_rate ?? ''),
      max_headcount: String(site?.settings_json?.max_headcount ?? ''),
    })
    setEditing(true)
  }

  function handleSave() {
    mutation.mutate({
      site_id: siteId,
      name: form.name || undefined,
      timezone: form.timezone || undefined,
      address: form.address || null,
      settings_json: {
        allowance_factor: form.allowance_factor ? parseFloat(form.allowance_factor) : undefined,
        absenteeism_rate: form.absenteeism_rate ? parseFloat(form.absenteeism_rate) : undefined,
        max_headcount: form.max_headcount ? parseInt(form.max_headcount) : null,
      },
    })
  }

  if (error) {
    return (
      <div
        className="rounded-[var(--radius-md)] p-6 text-sm"
        style={{ backgroundColor: 'var(--card)', border: '1px solid var(--destructive)', color: 'var(--destructive)' }}
      >
        Failed to load site: {error.message}
      </div>
    )
  }

  const inputClass = "w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm outline-none transition-shadow"
  const inputStyle = {
    fontFamily: 'var(--font-body)',
    color: 'var(--foreground)',
    backgroundColor: 'var(--background)',
    border: '1.5px solid var(--primary)',
    boxShadow: '0 0 0 3px rgba(99,102,241,0.12)',
  }

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      className="max-w-2xl flex flex-col gap-6"
    >
      {/* Back nav */}
      <motion.div variants={fadeInUp}>
        <Link
          href="/dashboard/settings/sites"
          className="inline-flex items-center gap-1.5 text-sm transition-colors duration-150"
          style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}
        >
          <ArrowLeft size={15} />
          Back to Sites
        </Link>
      </motion.div>

      {/* Site Info Card */}
      <motion.div
        variants={fadeInUp}
        className="rounded-[var(--radius-lg)] p-6"
        style={{
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elevation-1)',
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center"
              style={{ backgroundColor: 'rgba(99,102,241,0.10)' }}
            >
              <Building size={20} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              {isLoading ? (
                <SkeletonLine width="140px" />
              ) : (
                <h2
                  className="text-lg font-bold"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--foreground)' }}
                >
                  {site?.name}
                </h2>
              )}
              {site?.is_active !== undefined && (
                <span
                  className="text-xs px-2 py-0.5 rounded-[var(--radius-full)] font-medium"
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
              )}
            </div>
          </div>

          {!editing ? (
            <motion.button
              variants={scalePress}
              whileTap="press"
              onClick={handleEdit}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] text-sm font-medium"
              style={{
                fontFamily: 'var(--font-body)',
                backgroundColor: 'rgba(99,102,241,0.08)',
                color: 'var(--primary)',
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              <Pencil size={14} />
              Edit
            </motion.button>
          ) : (
            <div className="flex gap-2">
              <motion.button
                variants={scalePress}
                whileTap="press"
                onClick={handleSave}
                disabled={mutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--primary)', fontFamily: 'var(--font-body)', opacity: mutation.isPending ? 0.6 : 1 }}
              >
                <Check size={14} />
                {mutation.isPending ? 'Saving…' : 'Save'}
              </motion.button>
              <motion.button
                variants={scalePress}
                whileTap="press"
                onClick={() => setEditing(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-sm font-medium"
                style={{ backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}
              >
                <X size={14} />
                Cancel
              </motion.button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>Name</label>
            {isLoading ? <SkeletonLine /> : editing ? (
              <input className={inputClass} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            ) : (
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-body)' }}>{site?.name}</p>
            )}
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>
              <MapPin size={12} className="inline mr-1" />Address
            </label>
            {isLoading ? <SkeletonLine /> : editing ? (
              <input className={inputClass} style={inputStyle} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address" />
            ) : (
              <p className="text-sm" style={{ color: site?.address ? 'var(--foreground)' : 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>
                {site?.address ?? '—'}
              </p>
            )}
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>
              <Clock size={12} className="inline mr-1" />Timezone
            </label>
            {isLoading ? <SkeletonLine /> : editing ? (
              <input className={inputClass} style={inputStyle} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="e.g. Europe/Amsterdam" />
            ) : (
              <p className="text-sm font-mono" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>{site?.timezone}</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Settings Card */}
      <motion.div
        variants={fadeInUp}
        className="rounded-[var(--radius-lg)] p-6"
        style={{
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elevation-1)',
        }}
      >
        <h3
          className="text-base font-bold mb-5"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--foreground)' }}
        >
          Operational Settings
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Allowance factor */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>Allowance Factor</label>
            {isLoading ? <SkeletonLine /> : editing ? (
              <input type="number" step="0.01" className={inputClass} style={inputStyle} value={form.allowance_factor} onChange={(e) => setForm({ ...form, allowance_factor: e.target.value })} />
            ) : (
              <p className="text-sm tabular-nums" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-body)' }}>
                {site?.settings_json?.allowance_factor ?? '—'}
              </p>
            )}
          </div>

          {/* Absenteeism rate */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>Absenteeism Rate</label>
            {isLoading ? <SkeletonLine /> : editing ? (
              <input type="number" step="0.001" className={inputClass} style={inputStyle} value={form.absenteeism_rate} onChange={(e) => setForm({ ...form, absenteeism_rate: e.target.value })} />
            ) : (
              <p className="text-sm tabular-nums" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-body)' }}>
                {site?.settings_json?.absenteeism_rate ?? '—'}
              </p>
            )}
          </div>

          {/* Max headcount */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>Max Headcount</label>
            {isLoading ? <SkeletonLine /> : editing ? (
              <input type="number" step="1" className={inputClass} style={inputStyle} value={form.max_headcount} onChange={(e) => setForm({ ...form, max_headcount: e.target.value })} placeholder="Unlimited" />
            ) : (
              <p className="text-sm tabular-nums" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-body)' }}>
                {site?.settings_json?.max_headcount ?? <span style={{ color: 'var(--muted-foreground)' }}>Unlimited</span>}
              </p>
            )}
          </div>
        </div>

        {/* Operating hours read-only summary */}
        {!editing && site?.settings_json?.operating_hours && (
          <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
            <label className="block text-xs font-medium mb-3" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>Operating Hours</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(site.settings_json.operating_hours).map(([day, hours]) => (
                <div
                  key={day}
                  className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs"
                  style={{ backgroundColor: 'var(--muted)', color: 'var(--foreground)', fontFamily: 'var(--font-body)' }}
                >
                  <span className="font-medium capitalize">{day}</span>
                  <span className="ml-1.5" style={{ color: 'var(--muted-foreground)' }}>{hours.open}–{hours.close}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Departments Card */}
      <motion.div
        variants={fadeInUp}
        className="rounded-[var(--radius-lg)] p-6"
        style={{
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elevation-1)',
        }}
      >
        <div className="flex items-center gap-3 mb-5">
          <Users size={18} style={{ color: 'var(--primary)' }} />
          <h3
            className="text-base font-bold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--foreground)' }}
          >
            Departments
          </h3>
          {!deptLoading && departments && (
            <span
              className="text-xs px-2 py-0.5 rounded-[var(--radius-full)]"
              style={{ backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}
            >
              {departments.length}
            </span>
          )}
        </div>

        {deptLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse h-9 rounded-[var(--radius-sm)]" style={{ backgroundColor: 'var(--muted)' }} />
            ))}
          </div>
        ) : departments && departments.length > 0 ? (
          <motion.ul
            variants={containerStagger}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-1.5"
          >
            {departments.map((dept) => (
              <motion.li
                key={dept.id}
                variants={fadeInUp}
                className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)]"
                style={{ backgroundColor: 'var(--background)' }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: 'var(--primary)' }}
                />
                <span className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-body)' }}>
                  {dept.name}
                </span>
                {dept.process_count > 0 && (
                  <span className="text-xs ml-auto" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>
                    {dept.process_count} process{dept.process_count !== 1 ? 'es' : ''}
                  </span>
                )}
              </motion.li>
            ))}
          </motion.ul>
        ) : (
          <p className="text-sm" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>
            No departments configured for this site.
          </p>
        )}
      </motion.div>

      {/* Mutation error */}
      {mutation.error && (
        <motion.p variants={fadeInUp} className="text-sm" style={{ color: 'var(--destructive)', fontFamily: 'var(--font-body)' }}>
          {mutation.error.message}
        </motion.p>
      )}
    </motion.div>
  )
}
