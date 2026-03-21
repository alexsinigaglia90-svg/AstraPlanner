import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div className="mb-8 text-center">
        <h1
          className="text-3xl font-black tracking-tight"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--primary)',
          }}
        >
          AstraPlanner
        </h1>
        <p
          className="text-sm mt-1"
          style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}
        >
          Plan smarter. Ship faster.
        </p>
      </div>

      <div className="w-full" style={{ maxWidth: '440px' }}>
        {children}
      </div>
    </div>
  )
}
