'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Pencil, Trash2, Package, Wrench, Monitor, HelpCircle } from 'lucide-react'
import { GlassDropdown } from '@/components/domain/glass-dropdown'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { useToast } from '@/components/domain/toast'
import { bouncy, snappy, fadeInUp, containerStagger, scalePress } from '@/lib/motion'

// ── Types ────────────────────────────────────────────────────────────────────

interface EquipmentData {
  id: string
  name: string
  code: string
  category: string
  quantity: number
  description: string | null
}

interface EquipmentFormState {
  id?: string
  name: string
  category: string
  quantity: number
  description: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'mhe', label: 'MHE', color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', icon: Package },
  { value: 'tool', label: 'Tool', color: '#10b981', bg: 'rgba(16,185,129,0.10)', icon: Wrench },
  { value: 'station', label: 'Station', color: '#6366f1', bg: 'rgba(99,102,241,0.10)', icon: Monitor },
  { value: 'other', label: 'Other', color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', icon: HelpCircle },
] as const

function getCategoryConfig(cat: string) {
  return CATEGORIES.find((c) => c.value === cat) ?? CATEGORIES[3]
}

function defaultForm(): EquipmentFormState {
  return { name: '', category: 'mhe', quantity: 1, description: '' }
}

// ── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--card)',
  color: 'var(--foreground)',
  fontFamily: 'var(--font-body)',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
}

// ── Equipment Card ──────────────────────────────────────────────────────────

function EquipmentCard({
  eq,
  onEdit,
  onDelete,
}: {
  eq: EquipmentData
  onEdit: () => void
  onDelete: () => void
}) {
  const cat = getCategoryConfig(eq.category)
  const CatIcon = cat.icon

  return (
    <motion.div
      variants={fadeInUp}
      transition={bouncy}
      style={{
        padding: '14px 16px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--card)',
        boxShadow: 'var(--elevation-1)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 'var(--radius-sm)',
          backgroundColor: cat.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <CatIcon size={18} style={{ color: cat.color }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--foreground)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {eq.name}
          </span>
          <span
            style={{
              padding: '1px 7px',
              borderRadius: 999,
              fontSize: 9,
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              color: cat.color,
              backgroundColor: cat.bg,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {cat.label}
          </span>
        </div>
        {eq.description && (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              color: 'var(--muted-foreground)',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {eq.description}
          </div>
        )}
      </div>

      {/* Quantity */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 22,
          fontWeight: 800,
          color: 'var(--foreground)',
          minWidth: 40,
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {eq.quantity}
      </div>

      {/* Actions menu */}
      <GlassDropdown
        options={[
          { label: 'Edit', icon: <Pencil size={13} />, onClick: onEdit },
          {
            label: 'Delete',
            icon: <Trash2 size={13} />,
            onClick: onDelete,
            variant: 'destructive',
            holdToConfirm: true,
          },
        ]}
      />
    </motion.div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function EquipmentSettingsPage() {
  const { activeSiteId: siteId } = useSiteStore()
  const toast = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [formState, setFormState] = useState<EquipmentFormState>(defaultForm())

  const equipmentQuery = trpc.org.listEquipment.useQuery(
    { site_id: siteId! },
    { enabled: !!siteId },
  )

  const upsertMut = trpc.org.upsertEquipment.useMutation()
  const deleteMut = trpc.org.deleteEquipment.useMutation()
  const utils = trpc.useUtils()

  const invalidate = useCallback(() => {
    if (siteId) utils.org.listEquipment.invalidate({ site_id: siteId })
  }, [siteId, utils])

  const handleSave = useCallback(async () => {
    if (!siteId || !formState.name.trim()) return
    try {
      await upsertMut.mutateAsync({
        ...(formState.id ? { id: formState.id } : {}),
        name: formState.name.trim(),
        site_id: siteId,
        category: formState.category,
        quantity: formState.quantity,
        description: formState.description.trim() || undefined,
      })
      setModalOpen(false)
      setFormState(defaultForm())
      invalidate()
      toast.showSuccess(formState.id ? 'Equipment updated' : 'Equipment added')
    } catch (err: unknown) {
      toast.showError((err as Error).message ?? 'Failed to save equipment')
    }
  }, [siteId, formState, upsertMut, invalidate, toast])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteMut.mutateAsync({ id })
      invalidate()
      toast.showSuccess('Equipment deleted')
    } catch (err: unknown) {
      toast.showError((err as Error).message ?? 'Failed to delete equipment')
    }
  }, [deleteMut, invalidate, toast])

  const openEdit = (eq: EquipmentData) => {
    setFormState({
      id: eq.id,
      name: eq.name,
      category: eq.category,
      quantity: eq.quantity,
      description: eq.description ?? '',
    })
    setModalOpen(true)
  }

  const openAdd = () => {
    setFormState(defaultForm())
    setModalOpen(true)
  }

  // ── No site ──────────────────────────────────────────────────────────────

  if (!siteId) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '300px',
          fontFamily: 'var(--font-body)',
          fontSize: '14px',
          color: 'var(--muted-foreground)',
        }}
      >
        Select a site to manage equipment.
      </div>
    )
  }

  const equipment = equipmentQuery.data ?? []

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <motion.div
        initial="hidden"
        animate="show"
        variants={containerStagger}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 800,
                color: 'var(--foreground)',
                margin: 0,
              }}
            >
              Equipment
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--muted-foreground)',
                margin: '4px 0 0',
              }}
            >
              Material Handling Equipment, tools, and workstations for this site.
            </p>
          </div>
          <motion.button
            variants={scalePress}
            whileTap="press"
            onClick={openAdd}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
              color: '#FFFFFF',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            Add Equipment
          </motion.button>
        </div>

        {/* Equipment list */}
        {equipmentQuery.isLoading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 200,
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--muted-foreground)',
            }}
          >
            Loading equipment...
          </div>
        ) : equipment.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: 200,
              gap: 8,
            }}
          >
            <Package size={32} style={{ color: 'var(--muted-foreground)', opacity: 0.4 }} />
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--muted-foreground)',
              }}
            >
              No equipment added yet.
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {equipment.map((eq) => (
              <EquipmentCard
                key={eq.id}
                eq={eq}
                onEdit={() => openEdit(eq)}
                onDelete={() => handleDelete(eq.id)}
              />
            ))}
          </div>
        )}
      </motion.div>

      {/* ── Add/Edit Modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setModalOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000,
              padding: 24,
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={bouncy}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 440,
                backgroundColor: 'var(--card)',
                borderRadius: 16,
                boxShadow: 'var(--elevation-4, 0 8px 30px rgba(0,0,0,0.12))',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Modal header */}
              <div
                style={{
                  padding: '20px 24px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 16,
                    fontWeight: 800,
                    color: 'var(--foreground)',
                    margin: 0,
                  }}
                >
                  {formState.id ? 'Edit Equipment' : 'Add Equipment'}
                </h3>
                <button
                  onClick={() => setModalOpen(false)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: 'var(--muted-foreground)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal body */}
              <div style={{ padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Name */}
                <div>
                  <label
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Combi Truck, RF Scanner..."
                    value={formState.name}
                    onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                    autoFocus
                    style={inputStyle}
                  />
                </div>

                {/* Category chips */}
                <div>
                  <label
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 8,
                      display: 'block',
                    }}
                  >
                    Category
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {CATEGORIES.map((cat) => {
                      const selected = formState.category === cat.value
                      return (
                        <motion.button
                          key={cat.value}
                          variants={scalePress}
                          whileTap="press"
                          onClick={() => setFormState((s) => ({ ...s, category: cat.value }))}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 'var(--radius-full)',
                            border: `1.5px solid ${selected ? cat.color : 'var(--border)'}`,
                            backgroundColor: selected ? cat.bg : 'var(--card)',
                            color: selected ? cat.color : 'var(--foreground)',
                            fontFamily: 'var(--font-body)',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <cat.icon size={12} />
                          {cat.label}
                        </motion.button>
                      )
                    })}
                  </div>
                </div>

                {/* Quantity */}
                <div>
                  <label
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formState.quantity}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, quantity: Math.max(0, parseInt(e.target.value) || 0) }))
                    }
                    style={{
                      ...inputStyle,
                      width: 100,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 16,
                      fontWeight: 700,
                      textAlign: 'center',
                    }}
                  />
                </div>

                {/* Description */}
                <div>
                  <label
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Description <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Brief description..."
                    value={formState.description}
                    onChange={(e) => setFormState((s) => ({ ...s, description: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Modal footer */}
              <div
                style={{
                  padding: '14px 24px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                }}
              >
                <motion.button
                  variants={scalePress}
                  whileTap="press"
                  onClick={() => setModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--card)',
                    color: 'var(--foreground)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  variants={scalePress}
                  whileTap="press"
                  disabled={!formState.name.trim() || upsertMut.isPending}
                  onClick={handleSave}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: !formState.name.trim() || upsertMut.isPending ? 'not-allowed' : 'pointer',
                    opacity: !formState.name.trim() || upsertMut.isPending ? 0.5 : 1,
                  }}
                >
                  {upsertMut.isPending ? 'Saving...' : formState.id ? 'Update' : 'Add'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
