import { create } from 'zustand'
import type { PaneDetail, ChatMessage } from '../types'

interface StatusMessage {
  message: string
  ok: boolean
}

interface GitResult {
  message: string
  ok: boolean
}

interface UiState {
  sidebarOpen: boolean
  compact: boolean
  status: StatusMessage | null
  paneContent: string | null
  streaming: boolean
  paneDetail: PaneDetail | null
  gitResult: GitResult | null
  gitPopup: PaneDetail | null
  createDialog: boolean
  tmuxSessions: string[]
  newSessionTarget: string
  newSessionCommand: 'claude' | 'codex'
  confirmKill: boolean
  helpOpen: boolean
  shellMode: boolean
  shellHistory: string[]
  chatMessages: ChatMessage[] | null
}

interface UiActions {
  setSidebarOpen: (value: boolean) => void
  setCompact: (value: boolean) => void
  setStatus: (value: StatusMessage | null) => void
  setPaneContent: (value: string | null) => void
  setStreaming: (value: boolean) => void
  setPaneDetail: (value: PaneDetail | null) => void
  setGitResult: (value: GitResult | null) => void
  setGitPopup: (value: PaneDetail | null) => void
  setCreateDialog: (value: boolean) => void
  setTmuxSessions: (value: string[]) => void
  setNewSessionTarget: (value: string) => void
  setNewSessionCommand: (value: 'claude' | 'codex') => void
  setConfirmKill: (value: boolean) => void
  setHelpOpen: (value: boolean) => void
  setShellMode: (value: boolean) => void
  toggleShellMode: () => void
  pushShellHistory: (cmd: string) => void
  clearShellHistory: () => void
  setChatMessages: (value: ChatMessage[] | null) => void
  flashStatus: (message: string, ok: boolean) => void
}

export const useUiStore = create<UiState & UiActions>((set) => ({
  sidebarOpen: false,
  compact: false,
  status: null,
  paneContent: null,
  streaming: false,
  paneDetail: null,
  gitResult: null,
  gitPopup: null,
  createDialog: false,
  tmuxSessions: [],
  newSessionTarget: '',
  newSessionCommand: 'claude',
  confirmKill: false,
  helpOpen: false,
  shellMode: false,
  shellHistory: [],
  chatMessages: null,

  setSidebarOpen: (value) => set({ sidebarOpen: value }),
  setCompact: (value) => set({ compact: value }),
  setStatus: (value) => set({ status: value }),
  setPaneContent: (value) => set({ paneContent: value }),
  setStreaming: (value) => set({ streaming: value }),
  setPaneDetail: (value) => set({ paneDetail: value }),
  setGitResult: (value) => set({ gitResult: value }),
  setGitPopup: (value) => set({ gitPopup: value }),
  setCreateDialog: (value) => set({ createDialog: value }),
  setTmuxSessions: (value) => set({ tmuxSessions: value }),
  setNewSessionTarget: (value) => set({ newSessionTarget: value }),
  setNewSessionCommand: (value) => set({ newSessionCommand: value }),
  setConfirmKill: (value) => set({ confirmKill: value }),
  setHelpOpen: (value) => set({ helpOpen: value }),
  setShellMode: (value) => set({ shellMode: value }),
  toggleShellMode: () => set((s) => ({ shellMode: !s.shellMode })),
  pushShellHistory: (cmd) => set((s) => ({ shellHistory: [...s.shellHistory, cmd] })),
  clearShellHistory: () => set({ shellHistory: [] }),
  setChatMessages: (value) => set({ chatMessages: value }),

  flashStatus: (message, ok) => {
    set({ status: { message, ok } })
    setTimeout(() => {
      set({ status: null })
    }, ok ? 2000 : 5000)
  }
}))
