import { create } from 'zustand'
import type { SlashCommand, SkillCommand } from '../types'

interface InputState {
  text: string
  slashFilter: string | null
  slashIndex: number
  history: string[]
  historyIndex: number
  savedDraft: string
  slashCommands: SlashCommand[]
  skillCommands: SkillCommand[]
  images: string[]
}

interface InputActions {
  setText: (text: string) => void
  setSlashFilter: (filter: string | null) => void
  setSlashIndex: (indexOrUpdater: number | ((prev: number) => number)) => void
  pushHistory: (text: string) => void
  navigateHistory: (direction: 'up' | 'down', currentText: string) => string | null
  setSlashCommands: (commands: SlashCommand[]) => void
  updateUserSkills: (skills: SkillCommand[]) => void
  updateProjectSkills: (skills: SkillCommand[]) => void
  addImages: (paths: string[]) => void
  removeImage: (path: string) => void
  clearImages: () => void
}

const SLASH_COMMANDS_KEY = 'unitmux:slashCommands'

function loadSlashCommands(): SlashCommand[] {
  try {
    const raw = localStorage.getItem(SLASH_COMMANDS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export const useInputStore = create<InputState & InputActions>((set, get) => ({
  text: '',
  slashFilter: null,
  slashIndex: 0,
  history: [],
  historyIndex: -1,
  savedDraft: '',
  slashCommands: loadSlashCommands(),
  skillCommands: [],
  images: [],

  setText: (text) => set({ text }),

  setSlashFilter: (slashFilter) => set({ slashFilter }),

  setSlashIndex: (indexOrUpdater) => {
    if (typeof indexOrUpdater === 'function') {
      set((state) => ({ slashIndex: indexOrUpdater(state.slashIndex) }))
    } else {
      set({ slashIndex: indexOrUpdater })
    }
  },

  pushHistory: (text) => {
    const { history } = get()
    const updated = [text, ...history.filter((h) => h !== text)].slice(0, 10)
    set({ history: updated, historyIndex: -1, savedDraft: '' })
  },

  navigateHistory: (direction, currentText) => {
    const { history, historyIndex, savedDraft } = get()
    if (history.length === 0) return null

    if (direction === 'up') {
      if (historyIndex === -1) {
        set({ savedDraft: currentText, historyIndex: 0 })
        return history[0]
      }
      const nextIndex = Math.min(historyIndex + 1, history.length - 1)
      set({ historyIndex: nextIndex })
      return history[nextIndex]
    } else {
      if (historyIndex === -1) return null
      if (historyIndex === 0) {
        set({ historyIndex: -1 })
        return savedDraft
      }
      const nextIndex = historyIndex - 1
      set({ historyIndex: nextIndex })
      return history[nextIndex]
    }
  },

  setSlashCommands: (commands) => {
    localStorage.setItem(SLASH_COMMANDS_KEY, JSON.stringify(commands))
    set({ slashCommands: commands })
  },

  updateUserSkills: (skills) => {
    const { skillCommands } = get()
    const projectSkills = skillCommands.filter((c) => c.source === 'skill-project')
    set({ skillCommands: [...projectSkills, ...skills] })
  },

  updateProjectSkills: (skills) => {
    const { skillCommands } = get()
    const userSkills = skillCommands.filter((c) => c.source === 'skill-user')
    set({ skillCommands: [...userSkills, ...skills] })
  },

  addImages: (paths) => {
    const { images } = get()
    const unique = paths.filter((p) => !images.includes(p))
    if (unique.length > 0) set({ images: [...images, ...unique] })
  },
  removeImage: (path) => set({ images: get().images.filter((p) => p !== path) }),
  clearImages: () => set({ images: [] })
}))
