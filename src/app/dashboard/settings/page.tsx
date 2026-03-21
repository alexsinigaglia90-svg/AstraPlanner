'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Pencil, Check, X, Building2, Globe, CreditCard } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { fadeInUp, containerStagger, scalePress } from '@/lib/motion'

function SkeletonField() {
  return (
    <div className="animate-pulse h-5 rounded" style={{ backgroundColor: 'var(--muted)', width: '60%' }} />
  )
}

const TIER_COLORS: Record<string, string> = {
  trial: 'var(--warning)',
  starter: 'var(--secondary)',
  professional: 'var(--primary)',
  enterprise: 'var(--success)',
}

export default function OrgSettingsPage() {
  const { data, isLoading, error } = trpc.org.getOrganization.useQuery()
  const utils = trpc.useUtils()
  const mutation = trpc.org.updateOrganization.useMutation({
    onSuccess: () => {
      utils.org.getOrganization.invalidate()
      setEditing(false)
    },
  })

  const [editing, setEditing] = useState(false)
  const [formName, setFormName] = useState('')

  function handleEdit() {
    setFormName(data?.name ?? '')
    setEditing(true)
  }

  function handleCancel() {
    setEditing(false)
  }

  function handleSave() {
    mutation.mutate({ name: formName })
  }

  const settings = data?.settings_json as Record<string, string> | undefined

  if (error) {
    return (
      <div
        className="rounded-[var(--radius-md)] p-6 text-sm"
        style={{ backgroundColor: 'var(--card)', border: '1px solid var(--destructive)', color: 'var(--destructive)' }}
      >
        Failed to load organization: {error.message}
      </div>
    )
  }

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      className="max-w-2xl flex flex-col gap-6"
    >
      {/* Organization Info Card */}
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
              <Building2 size={20} style={{ color: 'var(--primary)' }} />
            </div>
            <h2
              className="text-lg font-bold"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--foreground)' }}
            >
              Organization Info
            </h2>
          </div>

          {!editing ? (
            <motion.button
              variants={scalePress}
              whileTap="press"
              onClick={handleEdit}
              className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] text-sm font-medium transition-colors duration-150"
              style={{
                fontFamily: 'var(--font-body)',
                backgroundColor: 'rgba(99,102,241,0.08)',
                color: 'var(--primary)',
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-sm font-medium text-white transition-opacity"
                style={{ backgroundColor: 'var(--primary)', fontFamily: 'var(--font-body)', opacity: mutation.isPending ? 0.6 : 1 }}
              >
                <Check size={14} />
                {mutation.isPending ? 'Saving…' : 'Save'}
              </motion.button>
              <motion.button
                variants={scalePress}
                whileTap="press"
                onClick={handleCancel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-sm font-medium transition-colors"
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
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>
              Organization Name
            </label>
            {isLoading ? (
              <SkeletonField />
            ) : editing ? (
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm outline-none transition-shadow"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: 'var(--foreground)',
                  backgroundColor: 'var(--background)',
                  border: '1.5px solid var(--primary)',
                  boxShadow: '0 0 0 3px rgba(99,102,241,0.12)',
                }}
              />
            ) : (
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-body)' }}>
                {data?.name}
              </p>
            )}
          </div>

          {/* Slug */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>
              Slug
            </label>
            {isLoading ? <SkeletonField /> : (
              <p className="text-sm font-mono" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                {data?.slug}
              </p>
            )}
          </div>

          {/* Subscription tier */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>
              Subscription Tier
            </label>
            {isLoading ? <SkeletonField /> : (
              <div className="flex items-center gap-2">
                <CreditCard size={14} style={{ color: 'var(--muted-foreground)' }} />
                <span
                  className="text-sm font-medium px-2 py-0.5 rounded-[var(--radius-full)] capitalize"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${TIER_COLORS[data?.subscription_tier ?? 'trial']} 12%, transparent)`,
                    color: TIER_COLORS[data?.subscription_tier ?? 'trial'],
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {data?.subscription_tier}
                </span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Locale Settings Card */}
      <motion.div
        variants={fadeInUp}
        className="rounded-[var(--radius-lg)] p-6"
        style={{
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elevation-1)',
        }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center"
            style={{ backgroundColor: 'rgba(99,102,241,0.10)' }}
          >
            <Globe size={20} style={{ color: 'var(--primary)' }} />
          </div>
          <h2
            className="text-lg font-bold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--foreground)' }}
          >
            Locale &amp; Regional
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {([
            { key: 'default_timezone', label: 'Timezone' },
            { key: 'default_locale', label: 'Locale' },
            { key: 'default_currency', label: 'Currency' },
          ] as const).map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>
                {label}
              </label>
              {isLoading ? <SkeletonField /> : (
                <p className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-body)' }}>
                  {(data as Record<string, unknown>)?.[key] as string ?? <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                </p>
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Error from mutation */}
      {mutation.error && (
        <motion.p variants={fadeInUp} className="text-sm" style={{ color: 'var(--destructive)', fontFamily: 'var(--font-body)' }}>
          {mutation.error.message}
        </motion.p>
      )}
    </motion.div>
  )
}
