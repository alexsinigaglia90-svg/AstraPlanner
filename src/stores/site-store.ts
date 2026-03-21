import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SiteState {
  /** Currently active site ID */
  activeSiteId: string | null
  /** Set the active site */
  setActiveSite: (siteId: string) => void
  /** Clear active site (e.g., on logout) */
  clearActiveSite: () => void
}

export const useSiteStore = create<SiteState>()(
  persist(
    (set) => ({
      activeSiteId: null,
      setActiveSite: (siteId) => set({ activeSiteId: siteId }),
      clearActiveSite: () => set({ activeSiteId: null }),
    }),
    {
      name: 'astraplanner-active-site',
    }
  )
)
