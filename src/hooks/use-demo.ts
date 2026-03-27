import { create } from 'zustand'

interface DemoState {
  isDemo: boolean
  /** Whether the demo state has been resolved (prevents query race condition) */
  demoResolved: boolean
  setDemo: (val: boolean) => void
}

export const useDemoStore = create<DemoState>((set) => ({
  isDemo: false,
  demoResolved: false,
  setDemo: (val) => set({ isDemo: val, demoResolved: true }),
}))
