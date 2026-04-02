import { create } from 'zustand'

export type DemoScenario = 'normal' | 'peak' | 'absence'

interface DemoScenarioState {
  /** Current step in the guided presentation (0-12) */
  currentStep: number
  /** Whether guided presentation mode is active */
  isPresenting: boolean
  /** Currently selected solver scenario */
  activeScenario: DemoScenario

  nextStep: () => void
  prevStep: () => void
  goToStep: (n: number) => void
  startPresentation: () => void
  stopPresentation: () => void
  setScenario: (s: DemoScenario) => void
}

export const TOTAL_STEPS = 13

export const useDemoScenarioStore = create<DemoScenarioState>((set) => ({
  currentStep: 0,
  isPresenting: false,
  activeScenario: 'normal',

  nextStep: () =>
    set((s) => ({ currentStep: Math.min(s.currentStep + 1, TOTAL_STEPS - 1) })),
  prevStep: () =>
    set((s) => ({ currentStep: Math.max(s.currentStep - 1, 0) })),
  goToStep: (n) =>
    set({ currentStep: Math.max(0, Math.min(n, TOTAL_STEPS - 1)) }),
  startPresentation: () =>
    set({ isPresenting: true, currentStep: 0 }),
  stopPresentation: () =>
    set({ isPresenting: false }),
  setScenario: (s) =>
    set({ activeScenario: s }),
}))
