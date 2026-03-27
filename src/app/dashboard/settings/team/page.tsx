'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Users } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { fadeInUp, containerStagger } from '@/lib/motion'

const ROLE_OPTIONS = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'employee', label: 'Employee' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'planner', label: 'Planner' },
  { value: 'site_manager', label: 'Site Manager' },
]

function getInitials(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => (n[0] ?? '').toUpperCase())
    .join('')
}

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'Zojuist'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} minuut${diffMin !== 1 ? 'en' : ''} geleden`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} uur geleden`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay} dag${diffDay !== 1 ? 'en' : ''} geleden`
}

function roleBadgeColor(role: string): { bg: string; color: string } {
  const map: Record<string, { bg: string; color: string }> = {
    viewer: { bg: 'rgba(100,116,139,0.1)', color: 'rgba(100,116,139,0.8)' },
    employee: { bg: 'rgba(99,102,241,0.1)', color: '#6366F1' },
    supervisor: { bg: 'rgba(245,158,11,0.12)', color: '#D97706' },
    planner: { bg: 'rgba(16,185,129,0.1)', color: '#059669' },
    site_manager: { bg: 'rgba(139,92,246,0.12)', color: '#7C3AED' },
  }
  return map[role] ?? { bg: 'rgba(100,116,139,0.1)', color: 'rgba(100,116,139,0.8)' }
}

export default function TeamSettingsPage() {
  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.admin.listJoinRequests.useQuery()

  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({})

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)

  const inviteUser = trpc.admin.inviteUser.useMutation({
    onSuccess: (result) => {
      setInviteSuccess(`Uitnodiging verstuurd naar ${result.email}`)
      setInviteEmail('')
      setInviteName('')
      setInviteRole('viewer')
      setTimeout(() => setInviteSuccess(null), 5000)
    },
  })

  const resolveRequest = trpc.admin.resolveJoinRequest.useMutation({
    onSuccess: () => {
      utils.admin.listJoinRequests.invalidate()
    },
  })

  const pendingRequests = data?.requests.filter((r) => r.status === 'pending') ?? []
  const approvedMembers = data?.requests.filter((r) => r.status === 'approved') ?? []

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '800px' }}
    >
      {/* Page header */}
      <motion.div variants={fadeInUp} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(99,102,241,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Users size={20} style={{ color: 'var(--primary)' }} />
        </div>
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--foreground)',
              margin: 0,
            }}
          >
            Team
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              color: 'var(--muted-foreground)',
              margin: 0,
            }}
          >
            Beheer lid-verzoeken en je teamleden
          </p>
        </div>
      </motion.div>

      {/* Section: Invite new member */}
      <motion.div
        variants={fadeInUp}
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--foreground)',
            margin: '0 0 12px 0',
          }}
        >
          Teamlid uitnodigen
        </h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!inviteEmail.trim() || !inviteName.trim()) return
            inviteUser.mutate({
              email: inviteEmail.trim(),
              full_name: inviteName.trim(),
              role: inviteRole as 'site_manager' | 'planner' | 'supervisor' | 'employee' | 'viewer',
              site_ids: [],
            })
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
        >
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Volledige naam"
              style={{
                flex: 1, height: '38px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', padding: '0 12px',
                fontSize: '13px', fontFamily: 'var(--font-body)',
                color: 'var(--foreground)', background: 'var(--background)',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@bedrijf.nl"
              type="email"
              style={{
                flex: 1, height: '38px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', padding: '0 12px',
                fontSize: '13px', fontFamily: 'var(--font-body)',
                color: 'var(--foreground)', background: 'var(--background)',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              style={{
                height: '38px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', padding: '0 10px',
                fontSize: '13px', fontFamily: 'var(--font-body)',
                color: 'var(--foreground)', background: 'var(--background)',
                outline: 'none', cursor: 'pointer', minWidth: '140px',
              }}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!inviteEmail.trim() || !inviteName.trim() || inviteUser.isPending}
              style={{
                height: '38px', padding: '0 18px', borderRadius: 'var(--radius-sm)',
                border: 'none', background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                color: '#FFFFFF', fontFamily: 'var(--font-body)', fontSize: '13px',
                fontWeight: 600, cursor: inviteUser.isPending ? 'not-allowed' : 'pointer',
                opacity: (!inviteEmail.trim() || !inviteName.trim()) ? 0.5 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {inviteUser.isPending ? 'Versturen...' : 'Uitnodiging versturen'}
            </button>
          </div>

          {inviteUser.isError && (
            <div style={{ fontSize: '12px', color: 'var(--destructive)', fontFamily: 'var(--font-body)' }}>
              {inviteUser.error?.message ?? 'Er is iets misgegaan'}
            </div>
          )}
          {inviteSuccess && (
            <div style={{ fontSize: '12px', color: '#059669', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
              {inviteSuccess}
            </div>
          )}
        </form>
      </motion.div>

      {/* Section 1: Pending requests */}
      <motion.div variants={fadeInUp} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--foreground)',
            margin: 0,
          }}
        >
          Openstaande verzoeken
        </h3>

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{ height: 72, borderRadius: 'var(--radius-md)', backgroundColor: 'var(--muted)' }}
              />
            ))}
          </div>
        ) : pendingRequests.length === 0 ? (
          <div
            style={{
              padding: '36px 24px',
              textAlign: 'center',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: 'rgba(99,102,241,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px',
              }}
            >
              <Users size={18} style={{ color: 'rgba(99,102,241,0.4)' }} />
            </div>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                color: 'var(--muted-foreground)',
                margin: 0,
              }}
            >
              Geen openstaande verzoeken
            </p>
          </div>
        ) : (
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}
          >
            {pendingRequests.map((req, i) => {
              const selectedRole = selectedRoles[req.id] ?? 'employee'
              const isResolving = resolveRequest.isPending

              return (
                <div
                  key={req.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '14px 18px',
                    borderBottom:
                      i < pendingRequests.length - 1 ? '1px solid var(--border)' : undefined,
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                      boxShadow: '0 2px 8px rgba(99,102,241,0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '13px',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {getInitials(req.full_name ?? req.email ?? '?')}
                  </div>

                  {/* Name + email */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '14px',
                        fontWeight: 700,
                        color: 'var(--foreground)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {req.full_name ?? req.email}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '12px',
                        color: 'var(--muted-foreground)',
                        display: 'flex',
                        gap: '8px',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {req.email}
                      </span>
                      <span style={{ opacity: 0.5, flexShrink: 0 }}>
                        &middot; {relativeTime(req.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Role select */}
                  <select
                    value={selectedRole}
                    onChange={(e) =>
                      setSelectedRoles((prev) => ({ ...prev, [req.id]: e.target.value }))
                    }
                    disabled={isResolving}
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--background)',
                      color: 'var(--foreground)',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  {/* Approve button */}
                  <button
                    onClick={() =>
                      resolveRequest.mutate({
                        request_id: req.id,
                        action: 'approve',
                        role: selectedRole,
                      })
                    }
                    disabled={isResolving}
                    style={{
                      background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      padding: '7px 14px',
                      color: 'white',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: isResolving ? 'not-allowed' : 'pointer',
                      opacity: isResolving ? 0.6 : 1,
                      flexShrink: 0,
                      boxShadow: '0 2px 8px rgba(16,185,129,0.25)',
                      transition: 'opacity 0.15s',
                    }}
                  >
                    Goedkeuren
                  </button>

                  {/* Reject button */}
                  <button
                    onClick={() =>
                      resolveRequest.mutate({ request_id: req.id, action: 'reject' })
                    }
                    disabled={isResolving}
                    style={{
                      background: 'none',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      padding: '7px 10px',
                      color: '#EF4444',
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: isResolving ? 'not-allowed' : 'pointer',
                      opacity: isResolving ? 0.5 : 0.8,
                      flexShrink: 0,
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = isResolving ? '0.5' : '0.8' }}
                  >
                    Weigeren
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </motion.div>

      {/* Section 2: Approved team members */}
      <motion.div variants={fadeInUp} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--foreground)',
            margin: 0,
          }}
        >
          Teamleden
        </h3>

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{ height: 56, borderRadius: 'var(--radius-md)', backgroundColor: 'var(--muted)' }}
              />
            ))}
          </div>
        ) : approvedMembers.length === 0 ? (
          <div
            style={{
              padding: '36px 24px',
              textAlign: 'center',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                color: 'var(--muted-foreground)',
                margin: 0,
              }}
            >
              Nog geen teamleden via Smart Join
            </p>
          </div>
        ) : (
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}
          >
            {/* Table header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr auto auto',
                gap: '12px',
                padding: '10px 18px',
                borderBottom: '1px solid var(--border)',
                backgroundColor: 'var(--muted)',
              }}
            >
              {['Naam', 'E-mail', 'Rol', 'Lid sinds'].map((col) => (
                <span
                  key={col}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--muted-foreground)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {col}
                </span>
              ))}
            </div>

            {approvedMembers.map((member, i) => {
              const badge = roleBadgeColor(member.status)
              return (
                <div
                  key={member.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr auto auto',
                    gap: '12px',
                    alignItems: 'center',
                    padding: '12px 18px',
                    borderBottom:
                      i < approvedMembers.length - 1 ? '1px solid var(--border)' : undefined,
                  }}
                >
                  {/* Name with avatar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '11px',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {getInitials(member.full_name ?? member.email ?? '?')}
                    </div>
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: 'var(--foreground)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {member.full_name ?? '—'}
                    </span>
                  </div>

                  {/* Email */}
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '12px',
                      color: 'var(--muted-foreground)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {member.email}
                  </span>

                  {/* Role badge — using the role from approved data (stored separately) */}
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: '999px',
                      backgroundColor: badge.bg,
                      color: badge.color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ROLE_OPTIONS.find((o) => o.value === (member as Record<string, unknown>).role as string)?.label ?? 'Employee'}
                  </span>

                  {/* Join date */}
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '12px',
                      color: 'var(--muted-foreground)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {new Date(member.created_at).toLocaleDateString('nl-NL', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
