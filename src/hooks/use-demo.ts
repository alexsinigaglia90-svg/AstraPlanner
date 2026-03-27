import { create } from 'zustand'

interface DemoState {
  isDemo: boolean
  setDemo: (val: boolean) => void
}

export const useDemoStore = create<DemoState>((set) => ({
  isDemo: false,
  setDemo: (val) => set({ isDemo: val }),
}))
