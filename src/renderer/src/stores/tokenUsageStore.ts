import { create } from 'zustand'
import type { TokenUsage, TokenUsageSummary } from '../types'

interface TokenUsageState {
  paneUsage: Record<string, TokenUsage>
  paneLoading: Record<string, boolean>
  summary: TokenUsageSummary | null
  summaryLoading: boolean
}

interface TokenUsageActions {
  refreshPane: (target: string) => Promise<void>
  refreshSummary: (force?: boolean) => Promise<void>
}

export const useTokenUsageStore = create<TokenUsageState & TokenUsageActions>((set, get) => ({
  paneUsage: {},
  paneLoading: {},
  summary: null,
  summaryLoading: false,

  refreshPane: async (target) => {
    if (!target || get().paneLoading[target]) return
    set((state) => ({ paneLoading: { ...state.paneLoading, [target]: true } }))
    try {
      const usage = await window.api.getTokenUsage(target)
      set((state) => ({
        paneUsage: { ...state.paneUsage, [target]: usage },
        paneLoading: { ...state.paneLoading, [target]: false }
      }))
    } catch {
      set((state) => ({ paneLoading: { ...state.paneLoading, [target]: false } }))
    }
  },

  refreshSummary: async (force = false) => {
    if (get().summaryLoading) return
    set({ summaryLoading: true })
    try {
      const summary = await window.api.getTokenUsageSummary(force)
      set({ summary, summaryLoading: false })
    } catch {
      set({ summaryLoading: false })
    }
  }
}))
