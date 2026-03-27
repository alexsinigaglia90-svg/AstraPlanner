'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { fadeInUp, containerStagger, scalePress, bouncy } from '@/lib/motion'
import { useDemoStore } from '@/hooks/use-demo'
import { demoDepartments, demoProcesses } from '@/components/onboarding/demo-seed'
import { ContextualTooltip } from '@/components/onboarding/contextual-tooltip'
import { DepartmentColumn } from '@/components/domain/department-column'
import { DepartmentCreateForm } from '@/components/domain/department-create-form'
import { ProcessWizard, type ProcessFormData } from '@/components/domain/process-wizard'
import { getDeptColor } from '@/components/domain/process-card'
import { sortByFlow } from '@/lib/warehouse-icons'
import { useToast } from '@/components/domain/toast'

// ── Types ────────────────────────────────────────────────────────────────────

interface Process {
  id: string
  name: string
  code: string
  unit_of_measure: string
  norm_uph: number
  department_id: string
}

// ── Adaptive Grid Layout ─────────────────────────────────────────────────────
// Calculates optimal columns per row based on total items.
// 1-4: single row. 5+: splits into balanced rows with the last row centered.

function getGridColumns(count: number): number {
  if (count <= 4) return count
  if (count <= 6) return 3
  if (count <= 8) return 4
  return Math.ceil(count / Math.ceil(count / 4)) // aim for ~4 cols
}

interface AdaptiveGridProps {
  departments: Array<{ id: string; name: string; color: string; code: string; site_id: string; process_count: number }>
  showAddDept: boolean
  processesByDept: Record<string, Process[]>
  onAddProcess: (deptId: string, data: { name: string; unit_of_measure: string; norm_uph: number }) => void
  onEditProcess: (id: string, data: { name: string; unit_of_measure: string; norm_uph: number }, deptId: string) => void
  onDeleteProcess: (id: string) => void
  onRenameDepartment: (id: string, name: string, color: string) => void
  onChangeColor: (id: string, name: string, color: string) => void
  onDeleteDepartment: (id: string) => void
  onAddDepartment: (data: { name: string; color: string }) => void
  onCancelAddDept: () => void
  onOpenWizard: (deptId: string, processId?: string) => void
}

function AdaptiveGrid({
  departments,
  showAddDept,
  processesByDept,
  onAddProcess,
  onEditProcess,
  onDeleteProcess,
  onRenameDepartment,
  onChangeColor,
  onDeleteDepartment,
  onAddDepartment,
  onCancelAddDept,
  onOpenWizard,
}: AdaptiveGridProps) {
  const totalItems = departments.length + (showAddDept ? 1 : 0)
  const cols = getGridColumns(totalItems)
  const usedColors = departments.map((d) => d.color)

  // Sort departments by warehouse flow order (inbound → storage → VAS → outbound → returns → support)
  const sortedDepts = sortByFlow(departments)

  // Split items into rows for centering logic
  const rows: Array<typeof departments> = []
  const allDepts = [...sortedDepts]
  for (let i = 0; i < allDepts.length; i += cols) {
    rows.push(allDepts.slice(i, i + cols))
  }

  // Check if the create form goes on the last row or starts a new one
  const lastRow = rows[rows.length - 1]
  const createFormOnLastRow = showAddDept && lastRow && lastRow.length < cols
  const createFormOnNewRow = showAddDept && (!lastRow || lastRow.length >= cols)

  return (
    <motion.div variants={fadeInUp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {rows.map((row, rowIdx) => {
        const isLastRow = rowIdx === rows.length - 1
        const itemsInRow = isLastRow && createFormOnLastRow ? row.length + 1 : row.length
        const needsCentering = itemsInRow < cols

        return (
          <div
            key={rowIdx}
            style={{
              display: 'flex',
              gap: '16px',
              justifyContent: needsCentering ? 'center' : 'flex-start',
            }}
          >
            {row.map((dept) => (
              <div key={dept.id} style={{ flex: needsCentering ? undefined : 1, width: needsCentering ? `calc(${100 / cols}% - ${16 * (cols - 1) / cols}px)` : undefined, minWidth: 0 }}>
                <DepartmentColumn
                  department={dept}
                  processes={processesByDept[dept.id] ?? []}
                  onAddProcess={(data) => onAddProcess(dept.id, data)}
                  onEditProcess={(id, data) => onEditProcess(id, data, dept.id)}
                  onDeleteProcess={onDeleteProcess}
                  onRenameDepartment={onRenameDepartment}
                  onChangeColor={onChangeColor}
                  onDeleteDepartment={onDeleteDepartment}
                  onOpenWizard={(processId) => onOpenWizard(dept.id, processId)}
                  usedColors={usedColors}
                />
              </div>
            ))}
            {isLastRow && createFormOnLastRow && (
              <div style={{ width: `calc(${100 / cols}% - ${16 * (cols - 1) / cols}px)`, minWidth: 0 }}>
                <AnimatePresence>
                  <DepartmentCreateForm onSave={onAddDepartment} onCancel={onCancelAddDept} usedColors={usedColors} />
                </AnimatePresence>
              </div>
            )}
          </div>
        )
      })}

      {/* Create form on its own new row */}
      {createFormOnNewRow && (
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
          <div style={{ width: `calc(${100 / cols}% - ${16 * (cols - 1) / cols}px)`, minWidth: 0 }}>
            <AnimatePresence>
              <DepartmentCreateForm onSave={onAddDepartment} onCancel={onCancelAddDept} usedColors={usedColors} />
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* When there are no departments and no add form */}
      {rows.length === 0 && !showAddDept && null}
    </motion.div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ProcessesPage() {
  const { activeSiteId } = useSiteStore()
  const isDemo = useDemoStore((s) => s.isDemo)
  const DEMO_MSG = 'Dit is een demo — start je eigen omgeving om wijzigingen te maken'
  const [showAddDept, setShowAddDept] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardDeptId, setWizardDeptId] = useState<string | null>(null)
  const [wizardEditData, setWizardEditData] = useState<ProcessFormData | null>(null)

  const utils = trpc.useUtils()

  // Queries
  const {
    data: liveDepts,
    isLoading: depsLiveLoading,
    error: deptsError,
  } = trpc.org.listDepartments.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo },
  )

  const {
    data: liveProcs,
    isLoading: procsLiveLoading,
    error: procsError,
  } = trpc.org.listProcesses.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo },
  )

  const departments = isDemo
    ? (demoDepartments.filter((d) => d.site_id === activeSiteId) as typeof liveDepts)
    : liveDepts
  const processes = isDemo
    ? (demoProcesses as unknown as typeof liveProcs)
    : liveProcs
  const deptsLoading = isDemo ? false : depsLiveLoading
  const procsLoading = isDemo ? false : procsLiveLoading

  // Mutations
  const upsertProcess = trpc.org.upsertProcess.useMutation()
  const deleteProcess = trpc.org.deleteProcess.useMutation()
  const setProcessEquipment = trpc.org.setProcessEquipment.useMutation()
  const upsertDepartment = trpc.org.upsertDepartment.useMutation()
  const deleteDepartment = trpc.org.deleteDepartment.useMutation()

  const toast = useToast()

  const invalidateAll = () => {
    utils.org.listDepartments.invalidate()
    utils.org.listProcesses.invalidate()
  }

  // Group processes by department
  const processesByDept = useMemo(() => {
    const map: Record<string, Process[]> = {}
    for (const p of (processes ?? []) as Process[]) {
      if (!map[p.department_id]) map[p.department_id] = []
      map[p.department_id]!.push(p)
    }
    return map
  }, [processes])

  // Handlers
  const handleAddProcess = async (deptId: string, data: { name: string; unit_of_measure: string; norm_uph: number }) => {
    if (isDemo) { toast.showError(DEMO_MSG); return }
    await upsertProcess.mutateAsync({ ...data, department_id: deptId })
    invalidateAll()
  }

  const handleEditProcess = async (id: string, data: { name: string; unit_of_measure: string; norm_uph: number }, deptId: string) => {
    if (isDemo) { toast.showError(DEMO_MSG); return }
    await upsertProcess.mutateAsync({ id, ...data, department_id: deptId })
    invalidateAll()
  }

  const handleDeleteProcess = async (id: string) => {
    if (isDemo) { toast.showError(DEMO_MSG); return }
    try {
      await deleteProcess.mutateAsync({ id })
      invalidateAll()
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : 'Failed to delete process')
    }
  }

  const handleAddDepartment = async (data: { name: string; color: string }) => {
    if (isDemo) { toast.showError(DEMO_MSG); return }
    await upsertDepartment.mutateAsync({ ...data, site_id: activeSiteId! })
    setShowAddDept(false)
    invalidateAll()
  }

  const handleRenameDepartment = async (id: string, name: string, color: string) => {
    if (isDemo) { toast.showError(DEMO_MSG); return }
    await upsertDepartment.mutateAsync({ id, name, site_id: activeSiteId!, color })
    invalidateAll()
  }

  const handleChangeColor = async (id: string, name: string, color: string) => {
    if (isDemo) { toast.showError(DEMO_MSG); return }
    await upsertDepartment.mutateAsync({ id, name, site_id: activeSiteId!, color })
    invalidateAll()
  }

  const handleDeleteDepartment = async (id: string) => {
    if (isDemo) { toast.showError(DEMO_MSG); return }
    try {
      await deleteDepartment.mutateAsync({ id })
      invalidateAll()
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : 'Failed to delete department')
    }
  }

  const handleOpenWizard = useCallback((deptId: string, editProcessId?: string) => {
    setWizardDeptId(deptId)
    if (editProcessId) {
      const proc = (processes ?? []).find((p: Process) => p.id === editProcessId)
      if (proc) {
        setWizardEditData({
          id: proc.id,
          name: proc.name,
          process_type: ((proc as Record<string, unknown>).process_type as 'productive' | 'supportive') ?? 'productive',
          unit_of_measure: proc.unit_of_measure,
          norm_uph: proc.norm_uph,
          priority: ((proc as Record<string, unknown>).priority as 'critical' | 'important' | 'flexible') ?? 'important',
          min_skill_level: ((proc as Record<string, unknown>).min_skill_level as number) ?? 1,
          certifications_required: ((proc as Record<string, unknown>).certifications_required as string[]) ?? [],
          support_type: ((proc as Record<string, unknown>).support_type as 'linked' | 'standalone' | null) ?? null,
          parent_process_id: ((proc as Record<string, unknown>).parent_process_id as string | null) ?? null,
          support_ratio_self: ((proc as Record<string, unknown>).support_ratio_self as number) ?? 1,
          support_ratio_parent: ((proc as Record<string, unknown>).support_ratio_parent as number) ?? 1,
          fixed_headcount: ((proc as Record<string, unknown>).fixed_headcount as number | null) ?? null,
          conversion_input_uom: ((proc as Record<string, unknown>).conversion_input_uom as string | null) ?? null,
          conversion_output_qty: ((proc as Record<string, unknown>).conversion_output_qty as number | null) ?? null,
          restrict_to_trained: ((proc as Record<string, unknown>).restrict_to_trained as boolean) ?? false,
          min_staffing: ((proc as Record<string, unknown>).min_staffing as number | null) ?? null,
          max_staffing: ((proc as Record<string, unknown>).max_staffing as number | null) ?? null,
          frequency_type: ((proc as Record<string, unknown>).frequency_type as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly') ?? 'daily',
          frequency_days: ((proc as Record<string, unknown>).frequency_days as number[] | null) ?? null,
          frequency_count: ((proc as Record<string, unknown>).frequency_count as number | null) ?? null,
          duration_type: ((proc as Record<string, unknown>).duration_type as 'full_shift' | 'hours' | 'time_range') ?? 'full_shift',
          duration_hours: ((proc as Record<string, unknown>).duration_hours as number | null) ?? null,
          duration_start_time: ((proc as Record<string, unknown>).duration_start_time as string | null) ?? null,
          duration_end_time: ((proc as Record<string, unknown>).duration_end_time as string | null) ?? null,
        })
      } else {
        setWizardEditData(null)
      }
    } else {
      setWizardEditData(null)
    }
    setWizardOpen(true)
  }, [processes])

  const handleWizardSave = useCallback(async (data: ProcessFormData) => {
    if (!wizardDeptId) return
    const result = await upsertProcess.mutateAsync({
      ...(data.id ? { id: data.id } : {}),
      name: data.name,
      department_id: wizardDeptId,
      process_type: data.process_type,
      unit_of_measure: data.unit_of_measure,
      norm_uph: data.norm_uph,
      conversion_input_uom: data.conversion_input_uom,
      conversion_output_qty: data.conversion_output_qty,
      support_type: data.support_type,
      parent_process_id: data.parent_process_id,
      support_ratio_self: data.support_ratio_self,
      support_ratio_parent: data.support_ratio_parent,
      fixed_headcount: data.fixed_headcount,
      priority: data.priority,
      min_skill_level: data.min_skill_level,
      certifications_required: data.certifications_required,
      restrict_to_trained: data.restrict_to_trained,
      min_staffing: data.min_staffing || null,
      max_staffing: data.max_staffing || null,
      frequency_type: data.frequency_type,
      frequency_days: data.frequency_days,
      frequency_count: data.frequency_count,
      duration_type: data.duration_type === 'time_range' ? 'time_range' : data.duration_type,
      duration_hours: data.duration_hours,
      duration_start_time: data.duration_start_time ?? null,
      duration_end_time: data.duration_end_time ?? null,
    })
    // Save equipment assignments if provided
    if (data.equipment) {
      await setProcessEquipment.mutateAsync({
        process_id: result.id,
        equipment: data.equipment,
      })
    }
    setWizardOpen(false)
    setWizardDeptId(null)
    setWizardEditData(null)
    invalidateAll()
  }, [wizardDeptId, upsertProcess, setProcessEquipment, invalidateAll])

  const isLoading = deptsLoading || procsLoading
  const error = deptsError || procsError

  // ── No site ──────────────────────────────────────────────────────────────

  if (!activeSiteId) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '300px',
          gap: '12px',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '15px',
            color: 'var(--muted-foreground)',
          }}
        >
          Select a site to view processes.
        </p>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
    >
      {/* Header */}
      <motion.div
        variants={fadeInUp}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '26px',
              fontWeight: 800,
              color: 'var(--foreground)',
              margin: 0,
            }}
          >
            Processes
          </h1>
          {isLoading ? (
            <div
              className="animate-pulse"
              style={{
                height: '16px',
                width: '140px',
                borderRadius: '4px',
                backgroundColor: 'var(--muted)',
                marginTop: '6px',
              }}
            />
          ) : (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'var(--muted-foreground)',
                margin: '4px 0 0',
              }}
            >
              {departments?.length ?? 0} departments, {processes?.length ?? 0} processes
            </p>
          )}
        </div>

        <ContextualTooltip id="processes-add" text="Definieer je operationele processen" anchor="top">
        <motion.button
          variants={scalePress}
          whileTap="press"
          onClick={() => setShowAddDept(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '9px 16px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
            color: '#FFFFFF',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Plus size={15} />
          Department
        </motion.button>
        </ContextualTooltip>
      </motion.div>

      {/* Error state */}
      {error && (
        <motion.div
          variants={fadeInUp}
          style={{
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--card)',
            border: '1px solid var(--destructive)',
            color: 'var(--destructive)',
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
          }}
        >
          Failed to load: {error.message}
        </motion.div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div style={{ display: 'flex', gap: '16px', overflowX: 'auto' }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{
                minWidth: '260px',
                flex: 1,
                maxWidth: '340px',
                height: '300px',
                borderRadius: '14px',
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
              }}
            />
          ))}
        </div>
      )}

      {/* Kanban board */}
      {!isLoading && departments && (
        departments.length === 0 && !showAddDept ? (
          /* Empty state */
          <motion.div
            variants={fadeInUp}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 24px',
              gap: '16px',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '15px',
                color: 'var(--muted-foreground)',
              }}
            >
              No departments yet. Create one to start adding processes.
            </p>
            <motion.button
              variants={scalePress}
              whileTap="press"
              onClick={() => setShowAddDept(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '11px 20px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                color: '#FFFFFF',
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={16} />
              Department
            </motion.button>
          </motion.div>
        ) : (
          <AdaptiveGrid
            departments={departments}
            showAddDept={showAddDept}
            processesByDept={processesByDept}
            onAddProcess={handleAddProcess}
            onEditProcess={handleEditProcess}
            onDeleteProcess={handleDeleteProcess}
            onRenameDepartment={handleRenameDepartment}
            onChangeColor={handleChangeColor}
            onDeleteDepartment={handleDeleteDepartment}
            onAddDepartment={handleAddDepartment}
            onCancelAddDept={() => setShowAddDept(false)}
            onOpenWizard={handleOpenWizard}
          />
        )
      )}

      {/* Process Wizard Modal */}
      {wizardDeptId && (() => {
        const dept = departments?.find((d) => d.id === wizardDeptId)
        if (!dept) return null
        const deptProcesses = (processesByDept[wizardDeptId] ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          unit_of_measure: p.unit_of_measure,
          norm_uph: p.norm_uph,
        }))
        return (
          <ProcessWizard
            open={wizardOpen}
            onClose={() => { setWizardOpen(false); setWizardDeptId(null); setWizardEditData(null) }}
            departmentId={dept.id}
            departmentName={dept.name}
            departmentColor={dept.color}
            siteId={activeSiteId!}
            existingProcesses={deptProcesses}
            initialValues={wizardEditData ?? undefined}
            onSave={handleWizardSave}
          />
        )
      })()}
    </motion.div>
  )
}
