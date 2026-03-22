'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Edit2 } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { fadeInUp, containerStagger, bouncy, scalePress } from '@/lib/motion'
import { Avatar } from '@/components/domain/avatar'
import { ProficiencyDots } from '@/components/domain/proficiency-dots'
import { SlideOver } from '@/components/domain/slide-over'
import { AddSkillForm } from '@/components/domain/add-skill-form'
import { AbsenceForm } from '@/components/domain/absence-form'
import { AvailabilityCalendar } from '@/components/domain/availability-calendar'
import { EditEmployeeForm } from '@/components/domain/edit-employee-form'

// ── Types ─────────────────────────────────────────────────────────────────────

type ContractType = 'full_time' | 'part_time' | 'temporary' | 'seasonal' | 'contractor'
type EmployeeStatus = 'active' | 'on_leave' | 'suspended' | 'terminated'
type OverrideType = 'leave' | 'absence' | 'training' | 'unavailable' | 'extra_availability'
type OverrideStatus = 'planned' | 'confirmed' | 'cancelled'

// ── Badge configs ─────────────────────────────────────────────────────────────

const CONTRACT_COLOR: Record<ContractType, { bg: string; text: string }> = {
  full_time:   { bg: 'rgba(99,102,241,0.12)',  text: '#4F46E5' },
  part_time:   { bg: 'rgba(59,130,246,0.12)',  text: '#2563EB' },
  temporary:   { bg: 'rgba(245,158,11,0.12)',  text: '#D97706' },
  seasonal:    { bg: 'rgba(16,185,129,0.12)',  text: '#059669' },
  contractor:  { bg: 'rgba(249,115,22,0.12)',  text: '#EA580C' },
}

const CONTRACT_LABEL: Record<ContractType, string> = {
  full_time:  'Full Time',
  part_time:  'Part Time',
  temporary:  'Temporary',
  seasonal:   'Seasonal',
  contractor: 'Contractor',
}

const STATUS_COLOR: Record<EmployeeStatus, { dot: string; bg: string }> = {
  active:     { dot: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  on_leave:   { dot: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  suspended:  { dot: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
  terminated: { dot: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
}

const OVERRIDE_COLOR: Record<OverrideType, { bg: string; text: string }> = {
  leave:               { bg: 'rgba(59,130,246,0.12)',  text: '#2563EB' },
  absence:             { bg: 'rgba(239,68,68,0.12)',   text: '#DC2626' },
  training:            { bg: 'rgba(16,185,129,0.12)',  text: '#059669' },
  unavailable:         { bg: 'rgba(148,163,184,0.12)', text: '#64748B' },
  extra_availability:  { bg: 'rgba(99,102,241,0.12)',  text: '#4F46E5' },
}

const OVERRIDE_STATUS_COLOR: Record<OverrideStatus, string> = {
  planned:   '#F59E0B',
  confirmed: '#10B981',
  cancelled: '#94A3B8',
}

// ── Helper: days until ───────────────────────────────────────────────────────

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.div
      variants={fadeInUp}
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--elevation-1)',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '15px',
          color: 'var(--foreground)',
          margin: 0,
        }}
      >
        {title}
      </h2>
      {children}
    </motion.div>
  )
}

// ── Info row ──────────────────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '10px',
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.06em',
          color: 'var(--muted-foreground)',
        }}
      >
        {label}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--foreground)', fontWeight: 500 }}>
        {children}
      </span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EmployeeDetailPage() {
  const router = useRouter()
  const params = useParams()
  const employeeId = params.employeeId as string
  const [editOpen, setEditOpen]         = useState(false)
  const [addSkillOpen, setAddSkillOpen] = useState(false)
  const [absenceOpen, setAbsenceOpen]   = useState(false)

  const { data: emp, isLoading, error } = trpc.workforce.getEmployee.useQuery(
    { id: employeeId },
    { enabled: !!employeeId },
  )

  if (!employeeId) return null

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '860px' }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{
              height: '160px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
            }}
          />
        ))}
      </div>
    )
  }

  if (error || !emp) {
    return (
      <div
        style={{
          padding: '20px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--card)',
          border: '1px solid var(--destructive)',
          color: 'var(--destructive)',
          fontFamily: 'var(--font-body)',
          fontSize: '14px',
          maxWidth: '860px',
        }}
      >
        {error?.message ?? 'Employee not found.'}
      </div>
    )
  }

  const contractType = emp.contract_type as ContractType
  const status = emp.status as EmployeeStatus
  const contractColor = CONTRACT_COLOR[contractType] ?? { bg: 'var(--muted)', text: 'var(--muted-foreground)' }
  const statusColor = STATUS_COLOR[status] ?? STATUS_COLOR.active

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '860px' }}
    >
      {/* Back button */}
      <motion.div variants={fadeInUp}>
        <motion.button
          variants={scalePress}
          whileTap="press"
          onClick={() => router.push('/dashboard/employees')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px 6px 8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--card)',
            color: 'var(--muted-foreground)',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={15} />
          Employees
        </motion.button>
      </motion.div>

      {/* Header */}
      <motion.div
        variants={fadeInUp}
        style={{
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--elevation-1)',
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        <Avatar firstName={emp.first_name} lastName={emp.last_name} size="lg" />

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '24px',
              color: 'var(--foreground)',
              margin: 0,
            }}
          >
            {emp.first_name} {emp.last_name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--muted-foreground)',
                backgroundColor: 'var(--muted)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {emp.employee_number}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: statusColor.bg,
                color: statusColor.dot,
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: statusColor.dot, display: 'inline-block' }} />
              {status === 'on_leave' ? 'On Leave' : status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                fontWeight: 600,
                color: contractColor.text,
                backgroundColor: contractColor.bg,
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
              }}
            >
              {CONTRACT_LABEL[contractType] ?? contractType}
            </span>
          </div>
        </div>

        <motion.button
          variants={scalePress}
          whileTap="press"
          onClick={() => setEditOpen(true)}
          style={{
            display: 'inline-flex',
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
            flexShrink: 0,
          }}
        >
          <Edit2 size={14} />
          Edit
        </motion.button>
      </motion.div>

      {/* Bento grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Card 1: Personal Info */}
        <SectionCard title="Personal Info">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <InfoRow label="Email">
              {emp.email ? (
                <a href={`mailto:${emp.email}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                  {emp.email}
                </a>
              ) : '—'}
            </InfoRow>
            <InfoRow label="Status">
              <span style={{ color: statusColor.dot }}>
                {status === 'on_leave' ? 'On Leave' : status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </InfoRow>
            <InfoRow label="Department">
              {emp.department_id ?? '—'}
            </InfoRow>
            <InfoRow label="Hourly Rate">
              <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                {emp.hourly_rate != null ? `€${emp.hourly_rate.toFixed(2)}` : '—'}
              </span>
            </InfoRow>
          </div>
        </SectionCard>

        {/* Card 2: Contract Details */}
        <SectionCard title="Contract Details">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <InfoRow label="Contract Type">
              <span
                style={{
                  display: 'inline-block',
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: contractColor.text,
                  backgroundColor: contractColor.bg,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                }}
              >
                {CONTRACT_LABEL[contractType] ?? contractType}
              </span>
            </InfoRow>
            <InfoRow label="Weekly Hours">
              <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                {emp.weekly_hours_contracted}h
              </span>
            </InfoRow>
            <InfoRow label="Multi-Site Eligible">
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: emp.is_multi_site_eligible ? 'rgba(16,185,129,0.12)' : 'var(--muted)',
                  color: emp.is_multi_site_eligible ? '#059669' : 'var(--muted-foreground)',
                }}
              >
                {emp.is_multi_site_eligible ? 'Yes' : 'No'}
              </span>
            </InfoRow>
            <InfoRow label="Home Site">
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                {emp.home_site_id.slice(0, 8)}…
              </span>
            </InfoRow>
          </div>
        </SectionCard>
      </div>

      {/* Card 3: Skills */}
      <SectionCard title={`Skills (${emp.skills.length})`}>
        {emp.skills.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--muted-foreground)', margin: 0 }}>
            No skills recorded.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {emp.skills.map((skill) => {
              const days = daysUntil(skill.expiry_date)
              const expiringSoon = days !== null && days <= 90 && days >= 0
              const expired = days !== null && days < 0

              return (
                <motion.div
                  key={skill.id}
                  variants={fadeInUp}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--muted)',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: '140px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--foreground)',
                      }}
                    >
                      {skill.process_name}
                    </span>
                  </div>

                  <ProficiencyDots level={skill.proficiency_level} size="md" />

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {skill.expiry_date && (
                      <span
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: expired
                            ? 'rgba(239,68,68,0.12)'
                            : expiringSoon
                              ? 'rgba(245,158,11,0.12)'
                              : 'rgba(16,185,129,0.12)',
                          color: expired ? '#DC2626' : expiringSoon ? '#D97706' : '#059669',
                        }}
                      >
                        {expired
                          ? `Expired ${skill.expiry_date}`
                          : expiringSoon
                            ? `Expires in ${days}d`
                            : `Cert ${skill.expiry_date}`}
                      </span>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        <motion.button
          variants={scalePress}
          whileTap="press"
          onClick={() => setAddSkillOpen(true)}
          style={{
            alignSelf: 'flex-start',
            padding: '7px 14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--card)',
            color: 'var(--foreground)',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          + Add Skill
        </motion.button>
      </SectionCard>

      {/* Card 4: Availability Overrides */}
      <SectionCard title={`Availability Overrides (${emp.availability_overrides.length})`}>
        {/* Weekly calendar */}
        <AvailabilityCalendar overrides={emp.availability_overrides} />

        {/* Detail list */}
        {emp.availability_overrides.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--muted-foreground)', margin: 0 }}>
            No overrides recorded.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {emp.availability_overrides.map((ov) => {
              const ovType = ov.override_type as OverrideType
              const ovStatus = ov.status as OverrideStatus
              const ovColor = OVERRIDE_COLOR[ovType] ?? { bg: 'var(--muted)', text: 'var(--muted-foreground)' }
              const statusDot = OVERRIDE_STATUS_COLOR[ovStatus] ?? '#94A3B8'

              return (
                <motion.div
                  key={ov.id}
                  variants={fadeInUp}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--muted)',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        color: 'var(--foreground)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {ov.start_date} → {ov.end_date}
                    </div>
                    {ov.reason && (
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
                        {ov.reason}
                      </div>
                    )}
                  </div>

                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: ovColor.text,
                      backgroundColor: ovColor.bg,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      textTransform: 'capitalize' as const,
                    }}
                  >
                    {ovType.replace(/_/g, ' ')}
                  </span>

                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontFamily: 'var(--font-body)',
                      fontSize: '11px',
                      color: statusDot,
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: statusDot, display: 'inline-block' }} />
                    {ovStatus.charAt(0).toUpperCase() + ovStatus.slice(1)}
                  </span>
                </motion.div>
              )
            })}
          </div>
        )}

        <motion.button
          variants={scalePress}
          whileTap="press"
          onClick={() => setAbsenceOpen(true)}
          style={{
            alignSelf: 'flex-start',
            padding: '7px 14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--card)',
            color: 'var(--foreground)',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Report Absence
        </motion.button>
      </SectionCard>

      {/* Edit Employee slide-over */}
      <SlideOver
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Employee"
      >
        <EditEmployeeForm
          employee={emp}
          onClose={() => setEditOpen(false)}
          onDeleted={() => router.push('/dashboard/employees')}
        />
      </SlideOver>

      {/* Add Skill slide-over */}
      <SlideOver
        open={addSkillOpen}
        onClose={() => setAddSkillOpen(false)}
        title="Add Skill"
      >
        <AddSkillForm
          employeeId={employeeId}
          onClose={() => setAddSkillOpen(false)}
        />
      </SlideOver>

      {/* Report Absence slide-over */}
      <SlideOver
        open={absenceOpen}
        onClose={() => setAbsenceOpen(false)}
        title="Report Absence"
      >
        <AbsenceForm
          employeeId={employeeId}
          onClose={() => setAbsenceOpen(false)}
        />
      </SlideOver>
    </motion.div>
  )
}
