'use client'

/**
 * Avatar — initials circle with deterministic color from name hash.
 */

const AVATAR_COLORS = [
  { bg: 'rgba(99,102,241,0.15)',  text: '#4F46E5' },  // indigo
  { bg: 'rgba(16,185,129,0.15)', text: '#059669' },  // emerald
  { bg: 'rgba(245,158,11,0.15)', text: '#D97706' },  // amber
  { bg: 'rgba(239,68,68,0.15)',  text: '#DC2626' },  // red
  { bg: 'rgba(139,92,246,0.15)', text: '#7C3AED' },  // violet
  { bg: 'rgba(59,130,246,0.15)', text: '#2563EB' },  // blue
  { bg: 'rgba(249,115,22,0.15)', text: '#EA580C' },  // orange
  { bg: 'rgba(236,72,153,0.15)', text: '#DB2777' },  // pink
]

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0
  }
  return h
}

interface AvatarProps {
  firstName: string
  lastName: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_MAP = {
  sm: { px: 32, fontSize: '11px' },
  md: { px: 40, fontSize: '13px' },
  lg: { px: 64, fontSize: '20px' },
}

export function Avatar({ firstName, lastName, size = 'md' }: AvatarProps) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  const colorIdx = hashName(`${firstName}${lastName}`) % AVATAR_COLORS.length
  const color = AVATAR_COLORS[colorIdx] ?? AVATAR_COLORS[0]!
  const { px, fontSize } = SIZE_MAP[size]

  return (
    <div
      aria-label={`${firstName} ${lastName}`}
      style={{
        width: px,
        height: px,
        borderRadius: '50%',
        backgroundColor: color.bg,
        color: color.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {initials}
    </div>
  )
}
