'use client'

import { motion } from 'framer-motion'
import { bouncy, fadeInUp } from '@/lib/motion'
import type { ImpactFlowData } from '@/lib/insights/types'

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface InsightsImpactFlowProps {
  data: ImpactFlowData
}

/* ------------------------------------------------------------------ */
/*  Glass card style                                                    */
/* ------------------------------------------------------------------ */

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.6)',
  borderRadius: 20,
  padding: 16,
  boxShadow: 'var(--elevation-2)',
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SOURCE_COLORS: Record<string, string> = {
  Griep: '#EF4444',
  Pollen: '#F59E0B',
  Weer: '#10B981',
  Vakantie: '#3B82F6',
  Seizoen: '#8B5CF6',
}

const TARGET_COLORS = ['#6366F1', '#8B5CF6', '#A78BFA', '#818CF8']

const NODE_W = 14
const NODE_GAP = 10
const LABEL_OFFSET = 6
const SVG_W = 260

function getSourceColor(name: string): string {
  return SOURCE_COLORS[name] ?? '#94A3B8'
}

function getTargetColor(idx: number): string {
  return TARGET_COLORS[idx % TARGET_COLORS.length] ?? '#6366F1'
}

/* ------------------------------------------------------------------ */
/*  Layout helpers                                                      */
/* ------------------------------------------------------------------ */

interface LayoutNode {
  name: string
  category: 'source' | 'target'
  x: number
  y: number
  h: number
  color: string
}

function layoutNodes(data: ImpactFlowData): { nodes: LayoutNode[]; svgH: number } {
  const sources = data.nodes.filter(n => n.category === 'source')
  const targets = data.nodes.filter(n => n.category === 'target')

  // Compute total outgoing/incoming value per node
  const nodeValues = new Map<number, number>()
  for (let i = 0; i < data.nodes.length; i++) {
    const sumOut = data.links.filter(l => l.source === i).reduce((s, l) => s + l.value, 0)
    const sumIn = data.links.filter(l => l.target === i).reduce((s, l) => s + l.value, 0)
    nodeValues.set(i, Math.max(sumOut, sumIn, 1))
  }

  const maxVal = Math.max(...nodeValues.values(), 1)
  const minH = 16
  const maxH = 50

  const layoutSide = (
    items: typeof sources,
    startIdx: number,
    x: number,
    colorFn: (name: string, idx: number) => string,
  ): LayoutNode[] => {
    const result: LayoutNode[] = []
    let yOffset = 20

    items.forEach((node, sideIdx) => {
      const globalIdx = data.nodes.indexOf(node)
      const val = nodeValues.get(globalIdx) ?? 1
      const h = minH + ((val / maxVal) * (maxH - minH))
      result.push({
        name: node.name,
        category: node.category,
        x,
        y: yOffset,
        h,
        color: colorFn(node.name, sideIdx),
      })
      yOffset += h + NODE_GAP
    })

    return result
  }

  const leftNodes = layoutSide(sources, 0, 0, (name) => getSourceColor(name))
  const rightNodes = layoutSide(targets, sources.length, SVG_W - NODE_W, (_name, idx) => getTargetColor(idx))

  const allNodes = [...leftNodes, ...rightNodes]
  const svgH = Math.max(
    ...allNodes.map(n => n.y + n.h),
    80,
  ) + 20

  return { nodes: allNodes, svgH }
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function InsightsImpactFlow({ data }: InsightsImpactFlowProps) {
  const { nodes: layoutResult, svgH } = layoutNodes(data)
  const sources = data.nodes.filter(n => n.category === 'source')

  // Build lookup: global index -> layout node
  const layoutByGlobal = new Map<number, LayoutNode>()
  const sourceLayout = layoutResult.filter(n => n.category === 'source')
  const targetLayout = layoutResult.filter(n => n.category === 'target')

  data.nodes.forEach((node, gi) => {
    if (node.category === 'source') {
      const si = data.nodes.filter((n, j) => j < gi && n.category === 'source').length
      if (sourceLayout[si]) layoutByGlobal.set(gi, sourceLayout[si])
    } else {
      const ti = data.nodes.filter((n, j) => j < gi && n.category === 'target').length
      if (targetLayout[ti]) layoutByGlobal.set(gi, targetLayout[ti])
    }
  })

  // Max link value for width scaling
  const maxLinkVal = Math.max(...data.links.map(l => l.value), 1)

  return (
    <motion.div
      style={glassCard}
      variants={fadeInUp}
      initial="hidden"
      animate="show"
    >
      <h3
        style={{
          margin: '0 0 8px',
          fontSize: 15,
          fontWeight: 700,
          fontFamily: 'var(--font-display)',
          color: '#1E1B4B',
        }}
      >
        Impact Flow
      </h3>

      <svg
        viewBox={`0 0 ${SVG_W} ${svgH}`}
        style={{ width: '100%', height: 'auto' }}
      >
        {/* Links */}
        {data.links.map((link, i) => {
          const src = layoutByGlobal.get(link.source)
          const tgt = layoutByGlobal.get(link.target)
          if (!src || !tgt) return null

          const x1 = src.x + NODE_W
          const y1 = src.y + src.h / 2
          const x2 = tgt.x
          const y2 = tgt.y + tgt.h / 2
          const cx1 = x1 + (x2 - x1) * 0.4
          const cx2 = x2 - (x2 - x1) * 0.4
          const strokeW = 2 + (link.value / maxLinkVal) * 8

          return (
            <motion.path
              key={`link-${i}`}
              d={`M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`}
              fill="none"
              stroke={src.color}
              strokeWidth={strokeW}
              opacity={0.18}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 + i * 0.08 }}
            />
          )
        })}

        {/* Source nodes */}
        {sourceLayout.map((node, i) => (
          <g key={`src-${i}`}>
            <motion.rect
              x={node.x}
              y={node.y}
              width={NODE_W}
              rx={4}
              fill={node.color}
              initial={{ height: 0 }}
              animate={{ height: node.h }}
              transition={{ ...bouncy, delay: 0.1 + i * 0.06 }}
            />
            <text
              x={node.x + NODE_W + LABEL_OFFSET}
              y={node.y + node.h / 2 + 3}
              fontSize={9}
              fontFamily="var(--font-body)"
              fontWeight={600}
              fill="#475569"
            >
              {node.name}
            </text>
          </g>
        ))}

        {/* Target nodes */}
        {targetLayout.map((node, i) => (
          <g key={`tgt-${i}`}>
            <motion.rect
              x={node.x}
              y={node.y}
              width={NODE_W}
              rx={4}
              fill={node.color}
              initial={{ height: 0 }}
              animate={{ height: node.h }}
              transition={{ ...bouncy, delay: 0.2 + i * 0.06 }}
            />
            <text
              x={node.x - LABEL_OFFSET}
              y={node.y + node.h / 2 + 3}
              fontSize={9}
              fontFamily="var(--font-body)"
              fontWeight={600}
              fill="#475569"
              textAnchor="end"
            >
              {node.name}
            </text>
          </g>
        ))}
      </svg>
    </motion.div>
  )
}
