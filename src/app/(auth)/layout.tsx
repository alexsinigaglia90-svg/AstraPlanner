'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

function FloatingOrb({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={className} style={style} />
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">
      {/* Animated gradient background */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: 'linear-gradient(135deg, #0F0E1A 0%, #1a1145 25%, #0F0E1A 50%, #1a0e2e 75%, #0F0E1A 100%)',
        }}
      />

      {/* Floating gradient orbs */}
      <FloatingOrb
        className="fixed -z-[5] rounded-full blur-[120px] animate-[drift1_20s_ease-in-out_infinite]"
        style={{
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(99,102,241,0.35) 0%, rgba(99,102,241,0) 70%)',
          top: '-10%',
          left: '-10%',
        }}
      />
      <FloatingOrb
        className="fixed -z-[5] rounded-full blur-[100px] animate-[drift2_25s_ease-in-out_infinite]"
        style={{
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(139,92,246,0.3) 0%, rgba(139,92,246,0) 70%)',
          bottom: '-15%',
          right: '-10%',
        }}
      />
      <FloatingOrb
        className="fixed -z-[5] rounded-full blur-[80px] animate-[drift3_18s_ease-in-out_infinite]"
        style={{
          width: '350px',
          height: '350px',
          background: 'radial-gradient(circle, rgba(249,115,22,0.2) 0%, rgba(249,115,22,0) 70%)',
          top: '40%',
          right: '20%',
        }}
      />
      <FloatingOrb
        className="fixed -z-[5] rounded-full blur-[90px] animate-[drift4_22s_ease-in-out_infinite]"
        style={{
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(59,130,246,0.2) 0%, rgba(59,130,246,0) 70%)',
          bottom: '20%',
          left: '15%',
        }}
      />

      {/* Subtle grid overlay */}
      <div
        className="fixed inset-0 -z-[3] opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Floating particles */}
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="fixed -z-[2] rounded-full"
          style={{
            width: `${2 + Math.random() * 3}px`,
            height: `${2 + Math.random() * 3}px`,
            background: `rgba(${Math.random() > 0.5 ? '147,130,255' : '255,180,100'}, ${0.3 + Math.random() * 0.4})`,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `particleFloat${(i % 4) + 1} ${8 + Math.random() * 12}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 5}s`,
          }}
        />
      ))}

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mb-10 text-center"
      >
        {/* Logo mark */}
        <div className="flex items-center justify-center gap-3 mb-2">
          <div
            className="relative flex items-center justify-center"
            style={{ width: '44px', height: '44px' }}
          >
            <div
              className="absolute inset-0 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #F97316 100%)',
                opacity: 0.9,
              }}
            />
            <div
              className="absolute inset-0 rounded-2xl animate-pulse"
              style={{
                background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #F97316 100%)',
                filter: 'blur(12px)',
                opacity: 0.4,
              }}
            />
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="relative z-10"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1
            className="text-3xl font-black tracking-tight"
            style={{
              fontFamily: 'var(--font-display)',
              background: 'linear-gradient(135deg, #E0E7FF 0%, #FFFFFF 40%, #C7D2FE 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            AstraPlanner
          </h1>
        </div>
        <p
          className="text-sm tracking-widest uppercase"
          style={{
            color: 'rgba(148, 163, 184, 0.7)',
            fontFamily: 'var(--font-body)',
            letterSpacing: '0.2em',
          }}
        >
          Workforce Intelligence
        </p>
      </motion.div>

      {/* Card container */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="w-full"
        style={{ maxWidth: '440px' }}
      >
        {children}
      </motion.div>

      {/* Bottom attribution */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="mt-8 text-xs"
        style={{ color: 'rgba(148, 163, 184, 0.4)', fontFamily: 'var(--font-body)' }}
      >
        AI-Driven Workforce Planning for Logistics
      </motion.p>

      {/* CSS Animations */}
      <style>{`
        @keyframes drift1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(80px, 40px) scale(1.1); }
          50% { transform: translate(30px, 80px) scale(0.95); }
          75% { transform: translate(-40px, 20px) scale(1.05); }
        }
        @keyframes drift2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(-60px, -30px) scale(1.05); }
          50% { transform: translate(-20px, -70px) scale(1.1); }
          75% { transform: translate(50px, -20px) scale(0.95); }
        }
        @keyframes drift3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-40px, 50px) scale(1.08); }
          66% { transform: translate(30px, -40px) scale(0.92); }
        }
        @keyframes drift4 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(50px, -30px) scale(1.05); }
          66% { transform: translate(-30px, 40px) scale(0.95); }
        }
        @keyframes particleFloat1 {
          0%, 100% { transform: translate(0, 0); opacity: 0.4; }
          50% { transform: translate(20px, -30px); opacity: 0.8; }
        }
        @keyframes particleFloat2 {
          0%, 100% { transform: translate(0, 0); opacity: 0.3; }
          50% { transform: translate(-25px, -20px); opacity: 0.7; }
        }
        @keyframes particleFloat3 {
          0%, 100% { transform: translate(0, 0); opacity: 0.5; }
          50% { transform: translate(15px, 25px); opacity: 0.9; }
        }
        @keyframes particleFloat4 {
          0%, 100% { transform: translate(0, 0); opacity: 0.3; }
          50% { transform: translate(-20px, 15px); opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}
