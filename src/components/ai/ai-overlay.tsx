'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AiButton } from './ai-button'
import { AiPanel } from './ai-panel'

/** Inner component that reads search params (requires Suspense boundary). */
function AiOverlayInner() {
  const [aiOpen, setAiOpen] = useState(false)
  const searchParams = useSearchParams()

  /* Auto-open panel when ?ai=open is present */
  useEffect(() => {
    if (searchParams.get('ai') === 'open') {
      setAiOpen(true)
    }
  }, [searchParams])

  return (
    <>
      <AiButton onClick={() => setAiOpen((v) => !v)} />
      <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  )
}

/** Wrapped in Suspense so useSearchParams works at build time. */
export function AiOverlay() {
  return (
    <Suspense fallback={null}>
      <AiOverlayInner />
    </Suspense>
  )
}
