'use client'

import { useEffect, useRef } from 'react'

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  opacity: number
  pulsePhase: number
  pulseSpeed: number
}

const NODE_COUNT = 60
const CONNECTION_DISTANCE = 180
const PARTICLE_COUNT = 25

export function NeuralBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const nodesRef = useRef<Node[]>([])
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }[]>([])
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const timeRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function resize() {
      if (!canvas) return
      canvas.width = window.innerWidth * window.devicePixelRatio
      canvas.height = window.innerHeight * window.devicePixelRatio
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx!.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    resize()
    window.addEventListener('resize', resize)

    const w = () => window.innerWidth
    const h = () => window.innerHeight

    // Seed fixed positions to avoid hydration issues
    if (nodesRef.current.length === 0) {
      const seed = [
        0.12, 0.85, 0.43, 0.67, 0.31, 0.92, 0.18, 0.56, 0.74, 0.39,
        0.61, 0.23, 0.87, 0.45, 0.09, 0.78, 0.52, 0.34, 0.96, 0.15,
        0.68, 0.41, 0.83, 0.27, 0.59, 0.72, 0.06, 0.48, 0.91, 0.33,
        0.77, 0.14, 0.62, 0.88, 0.21, 0.54, 0.36, 0.79, 0.03, 0.66,
        0.47, 0.82, 0.28, 0.95, 0.11, 0.58, 0.73, 0.38, 0.64, 0.19,
        0.86, 0.42, 0.07, 0.71, 0.53, 0.29, 0.94, 0.16, 0.81, 0.37,
      ]
      for (let i = 0; i < NODE_COUNT; i++) {
        const si = (i * 4) % seed.length
        const s0 = seed[si]!
        const s1 = seed[(si + 1) % seed.length]!
        const s2 = seed[(si + 2) % seed.length]!
        const s3 = seed[(si + 3) % seed.length]!
        nodesRef.current.push({
          x: s0 * w(),
          y: s1 * h(),
          vx: (s2 - 0.5) * 0.3,
          vy: (s3 - 0.5) * 0.3,
          radius: 1.5 + s0 * 2,
          opacity: 0.15 + s1 * 0.25,
          pulsePhase: s2 * Math.PI * 2,
          pulseSpeed: 0.005 + s3 * 0.01,
        })
      }
    }

    // Seed particles
    function spawnParticle() {
      if (particlesRef.current.length >= PARTICLE_COUNT) return
      const pSeeds = [0.3, 0.7, 0.1, 0.9, 0.5, 0.2, 0.8, 0.4, 0.6, 0.15, 0.85, 0.35, 0.65, 0.25, 0.75, 0.45, 0.55, 0.05, 0.95, 0.50]
      const idx = particlesRef.current.length % 20
      particlesRef.current.push({
        x: pSeeds[idx]! * w(),
        y: pSeeds[(idx + 7) % 20]! * h(),
        vx: (pSeeds[(idx + 3) % 20]! - 0.5) * 0.5,
        vy: (pSeeds[(idx + 5) % 20]! - 0.5) * 0.5,
        life: 0,
        maxLife: 200 + pSeeds[(idx + 9) % 20]! * 300,
        size: 1 + pSeeds[(idx + 11) % 20]! * 2,
      })
    }

    function handleMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('mousemove', handleMouseMove)

    function animate() {
      if (!ctx) return
      const width = w()
      const height = h()
      ctx.clearRect(0, 0, width, height)
      timeRef.current++

      const nodes = nodesRef.current
      const particles = particlesRef.current
      const mouse = mouseRef.current

      // Update nodes
      for (const node of nodes) {
        node.x += node.vx
        node.y += node.vy
        node.pulsePhase += node.pulseSpeed

        // Bounce off edges softly
        if (node.x < 0 || node.x > width) node.vx *= -1
        if (node.y < 0 || node.y > height) node.vy *= -1
        node.x = Math.max(0, Math.min(width, node.x))
        node.y = Math.max(0, Math.min(height, node.y))

        // Mouse repulsion
        const dx = node.x - mouse.x
        const dy = node.y - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 200 && dist > 0) {
          const force = (200 - dist) / 200 * 0.02
          node.vx += (dx / dist) * force
          node.vy += (dy / dist) * force
        }

        // Damping
        node.vx *= 0.999
        node.vy *= 0.999
      }

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        const nodeA = nodes[i]!
        for (let j = i + 1; j < nodes.length; j++) {
          const nodeB = nodes[j]!
          const dx = nodeA.x - nodeB.x
          const dy = nodeA.y - nodeB.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CONNECTION_DISTANCE) {
            const alpha = (1 - dist / CONNECTION_DISTANCE) * 0.08
            const pulse = Math.sin(timeRef.current * 0.02 + i * 0.5) * 0.03
            ctx.beginPath()
            ctx.moveTo(nodeA.x, nodeA.y)
            ctx.lineTo(nodeB.x, nodeB.y)
            ctx.strokeStyle = `rgba(99, 102, 241, ${alpha + pulse})`
            ctx.lineWidth = 0.8
            ctx.stroke()

            // Occasionally send a "signal" along the connection
            if (timeRef.current % 120 === (i + j) % 120) {
              const t = (timeRef.current % 60) / 60
              const sx = nodeA.x + (nodeB.x - nodeA.x) * t
              const sy = nodeA.y + (nodeB.y - nodeA.y) * t
              ctx.beginPath()
              ctx.arc(sx, sy, 2, 0, Math.PI * 2)
              ctx.fillStyle = `rgba(99, 102, 241, ${0.4 * (1 - t)})`
              ctx.fill()
            }
          }
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const pulse = Math.sin(node.pulsePhase) * 0.1
        const r = node.radius + pulse

        // Outer glow
        ctx.beginPath()
        ctx.arc(node.x, node.y, r * 4, 0, Math.PI * 2)
        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 4)
        glow.addColorStop(0, `rgba(99, 102, 241, ${(node.opacity + pulse) * 0.15})`)
        glow.addColorStop(1, 'rgba(99, 102, 241, 0)')
        ctx.fillStyle = glow
        ctx.fill()

        // Core dot
        ctx.beginPath()
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(99, 102, 241, ${node.opacity + pulse})`
        ctx.fill()
      }

      // Spawn & update particles
      if (timeRef.current % 8 === 0) spawnParticle()

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!
        p.x += p.vx
        p.y += p.vy
        p.life++
        if (p.life > p.maxLife) {
          particles.splice(i, 1)
          continue
        }
        const lifeRatio = p.life / p.maxLife
        const alpha = lifeRatio < 0.1
          ? lifeRatio / 0.1
          : lifeRatio > 0.8
            ? (1 - lifeRatio) / 0.2
            : 1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(99, 102, 241, ${alpha * 0.2})`
        ctx.fill()
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{ zIndex: 0 }}
    />
  )
}
