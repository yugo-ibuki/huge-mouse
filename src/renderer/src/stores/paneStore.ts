import { create } from 'zustand'
import type { TmuxPane } from '../types'

interface PaneState {
  panes: TmuxPane[]
  selected: string
  lastPrompts: Record<string, string>
}

interface PaneActions {
  setPanes: (panes: TmuxPane[]) => void
  setSelected: (target: string) => void
  updateLastPrompt: (target: string, prompt: string) => void
  cleanupPrompts: (activeTargets: string[]) => void
}

const LAST_PROMPTS_KEY = 'unitmux:lastPrompts'

function loadLastPrompts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LAST_PROMPTS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function panesChanged(prev: TmuxPane[], next: TmuxPane[]): boolean {
  if (prev.length !== next.length) return true
  for (let i = 0; i < next.length; i++) {
    const p = prev[i]
    const n = next[i]
    if (
      p.target !== n.target ||
      p.status !== n.status ||
      p.prompt !== n.prompt ||
      p.choices.length !== n.choices.length ||
      p.activityLine !== n.activityLine
    ) {
      return true
    }
  }
  return false
}

export const usePaneStore = create<PaneState & PaneActions>((set, get) => ({
  panes: [],
  selected: '',
  lastPrompts: loadLastPrompts(),

  setPanes: (panes) => {
    const state = get()
    if (!panesChanged(state.panes, panes)) {
      return
    }
    set({ panes })
  },

  setSelected: (target) => set({ selected: target }),

  updateLastPrompt: (target, prompt) => {
    const lastPrompts = { ...get().lastPrompts, [target]: prompt }
    localStorage.setItem(LAST_PROMPTS_KEY, JSON.stringify(lastPrompts))
    set({ lastPrompts })
  },

  cleanupPrompts: (activeTargets) => {
    const current = get().lastPrompts
    const cleaned: Record<string, string> = {}
    for (const target of activeTargets) {
      if (current[target] !== undefined) {
        cleaned[target] = current[target]
      }
    }
    localStorage.setItem(LAST_PROMPTS_KEY, JSON.stringify(cleaned))
    set({ lastPrompts: cleaned })
  }
}))
