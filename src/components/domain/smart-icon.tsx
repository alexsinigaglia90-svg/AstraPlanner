'use client'

import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { wobbly } from '@/lib/motion'
import { matchIcon, getFallbackIcon } from '@/lib/warehouse-icons'
import * as LucideIcons from 'lucide-react'

interface SmartIconProps {
  name: string
  type: 'department' | 'process'
  color: string
  size?: number
}

/**
 * Renders an animated Lucide icon based on keyword matching.
 * When the name changes and a new icon matches, it does a bouncy entrance.
 */
export function SmartIcon({ name, type, color, size = 16 }: SmartIconProps) {
  const iconName = useMemo(() => {
    return matchIcon(name, type) ?? getFallbackIcon(type)
  }, [name, type])

  // Dynamic icon lookup from lucide-react
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (LucideIcons as any)[iconName] as React.ComponentType<{ size?: number; style?: React.CSSProperties }> | undefined

  if (!IconComponent) return null

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={iconName}
        initial={{ scale: 0, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        exit={{ scale: 0, rotate: 20, opacity: 0 }}
        transition={wobbly}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <IconComponent size={size} style={{ color }} />
      </motion.div>
    </AnimatePresence>
  )
}
