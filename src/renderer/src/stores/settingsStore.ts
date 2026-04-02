import { create } from 'zustand'

type Theme = 'dark' | 'light'
type ChoiceModifier = 'ctrl' | 'cmd'
type SendKey = 'enter' | 'cmd+enter'

interface SettingsState {
  alwaysOnTop: boolean
  opacity: number
  theme: Theme
  choiceModifier: ChoiceModifier
  previewKey: string
  detailKey: string
  gitKey: string
  diffKey: string
  focusKey: string
  fontSize: number
  sendKey: SendKey
  vimMode: boolean
  compactKey: string
}

interface SettingsActions {
  setAlwaysOnTop: (value: boolean) => void
  setOpacity: (value: number) => void
  setTheme: (value: Theme) => void
  setChoiceModifier: (value: ChoiceModifier) => void
  setPreviewKey: (value: string) => void
  setDetailKey: (value: string) => void
  setGitKey: (value: string) => void
  setDiffKey: (value: string) => void
  setFocusKey: (value: string) => void
  setFontSize: (value: number) => void
  setSendKey: (value: SendKey) => void
  setVimMode: (value: boolean) => void
  setCompactKey: (value: string) => void
}

const STORAGE_KEY = 'unitmux:settings'

function loadSetting<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${key}`)
    if (raw === null) return defaultValue
    return JSON.parse(raw) as T
  } catch {
    return defaultValue
  }
}

function saveSetting(key: string, value: unknown): void {
  localStorage.setItem(`${STORAGE_KEY}:${key}`, JSON.stringify(value))
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

function applyFontSize(size: number): void {
  document.documentElement.style.setProperty('--font-size', `${size}px`)
}

const initialTheme = loadSetting<Theme>('theme', 'dark')
const initialFontSize = loadSetting<number>('fontSize', 12)

applyTheme(initialTheme)
applyFontSize(initialFontSize)

export const useSettingsStore = create<SettingsState & SettingsActions>((set) => ({
  alwaysOnTop: loadSetting<boolean>('alwaysOnTop', false),
  opacity: loadSetting<number>('opacity', 1),
  theme: initialTheme,
  choiceModifier: loadSetting<ChoiceModifier>('choiceModifier', 'ctrl'),
  previewKey: loadSetting<string>('previewKey', 'p'),
  detailKey: loadSetting<string>('detailKey', 'd'),
  gitKey: loadSetting<string>('gitKey', 'g'),
  diffKey: loadSetting<string>('diffKey', 'f'),
  focusKey: loadSetting<string>('focusKey', 'h'),
  fontSize: initialFontSize,
  sendKey: loadSetting<SendKey>('sendKey', 'cmd+enter'),
  vimMode: loadSetting<boolean>('vimMode', false),
  compactKey: loadSetting<string>('compactKey', 'w'),

  setAlwaysOnTop: (value) => {
    saveSetting('alwaysOnTop', value)
    set({ alwaysOnTop: value })
  },

  setOpacity: (value) => {
    saveSetting('opacity', value)
    window.api.setOpacity(value)
    set({ opacity: value })
  },

  setTheme: (value) => {
    saveSetting('theme', value)
    applyTheme(value)
    set({ theme: value })
  },

  setChoiceModifier: (value) => {
    saveSetting('choiceModifier', value)
    set({ choiceModifier: value })
  },

  setPreviewKey: (value) => {
    saveSetting('previewKey', value)
    set({ previewKey: value })
  },

  setDetailKey: (value) => {
    saveSetting('detailKey', value)
    set({ detailKey: value })
  },

  setGitKey: (value) => {
    saveSetting('gitKey', value)
    set({ gitKey: value })
  },

  setDiffKey: (value) => {
    saveSetting('diffKey', value)
    set({ diffKey: value })
  },

  setFocusKey: (value) => {
    saveSetting('focusKey', value)
    window.api.setFocusShortcut(value)
    set({ focusKey: value })
  },

  setFontSize: (value) => {
    saveSetting('fontSize', value)
    applyFontSize(value)
    set({ fontSize: value })
  },

  setSendKey: (value) => {
    saveSetting('sendKey', value)
    set({ sendKey: value })
  },

  setVimMode: (value) => {
    saveSetting('vimMode', value)
    set({ vimMode: value })
  },

  setCompactKey: (value) => {
    saveSetting('compactKey', value)
    set({ compactKey: value })
  },

}))
