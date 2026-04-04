import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface SkillEntry {
  name: string
  description: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

export interface TmuxPane {
  target: string
  pid: string
  command: string
  title: string
  activityLine: string
}

export interface PaneDetail {
  target: string
  pid: string
  command: string
  title: string
  width: string
  height: string
  startedAt: string
  cwd: string
  tty: string
  gitBranch: string
  gitStatus: string
  model: string
  sessionId: string
}

export interface SendResult {
  success: boolean
  error?: string
}

const api = {
  listSessions: (): Promise<TmuxPane[]> => ipcRenderer.invoke('tmux:list-sessions'),
  sendInput: (target: string, text: string, vimMode = false, images: string[] = []): Promise<SendResult> =>
    ipcRenderer.invoke('tmux:send-input', { target, text, vimMode, images }),
  capturePane: (target: string): Promise<string> => ipcRenderer.invoke('tmux:capture-pane', target),
  getPaneDetail: (target: string): Promise<PaneDetail | null> =>
    ipcRenderer.invoke('tmux:pane-detail', target),
  listSkills: (cwd: string): Promise<{ user: SkillEntry[]; project: SkillEntry[] }> =>
    ipcRenderer.invoke('skills:list', cwd),
  listTmuxSessions: (): Promise<string[]> => ipcRenderer.invoke('tmux:list-tmux-sessions'),
  createSession: (sessionName: string, command: 'claude' | 'codex', cwd?: string): Promise<SendResult> =>
    ipcRenderer.invoke('tmux:create-session', { sessionName, command, cwd }),
  killPane: (target: string): Promise<SendResult> => ipcRenderer.invoke('tmux:kill-pane', target),
  findShellPane: (session: string): Promise<string | null> =>
    ipcRenderer.invoke('tmux:find-shell-pane', session),
  ensureShellPane: (session: string, cwd: string): Promise<{ success: boolean; target?: string; error?: string }> =>
    ipcRenderer.invoke('tmux:ensure-shell-pane', { session, cwd }),
  gitAdd: (cwd: string): Promise<SendResult> => ipcRenderer.invoke('git:add', cwd),
  gitCommit: (cwd: string, message: string): Promise<SendResult> =>
    ipcRenderer.invoke('git:commit', { cwd, message }),
  gitPush: (cwd: string): Promise<SendResult> => ipcRenderer.invoke('git:push', cwd),
  gitDiff: (cwd: string, staged = false): Promise<string> =>
    ipcRenderer.invoke('git:diff', { cwd, staged }),
  setAlwaysOnTop: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke('window:set-always-on-top', value),
  getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('window:get-always-on-top'),
  setOpacity: (value: number): Promise<number> => ipcRenderer.invoke('window:set-opacity', value),
  getOpacity: (): Promise<number> => ipcRenderer.invoke('window:get-opacity'),
  setFocusShortcut: (key: string): Promise<boolean> =>
    ipcRenderer.invoke('window:set-focus-shortcut', key),
  toggleCompact: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-compact'),
  onCompactChanged: (callback: (compact: boolean) => void): (() => void) => {
    const handler = (_event: unknown, compact: boolean): void => callback(compact)
    ipcRenderer.on('compact-changed', handler)
    return () => ipcRenderer.removeListener('compact-changed', handler)
  },
  onFocusTextarea: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('focus-textarea', handler)
    return () => ipcRenderer.removeListener('focus-textarea', handler)
  },
  getConversationLog: (target: string): Promise<ChatMessage[]> =>
    ipcRenderer.invoke('tmux:conversation-log', target),
  startStream: (target: string, mode?: 'raw' | 'chat'): Promise<boolean> =>
    ipcRenderer.invoke('tmux:start-stream', mode ? { target, mode } : target),
  stopStream: (): Promise<boolean> => ipcRenderer.invoke('tmux:stop-stream'),
  onStreamData: (callback: (content: string) => void): (() => void) => {
    const handler = (_event: unknown, content: string): void => callback(content)
    ipcRenderer.on('tmux:stream-data', handler)
    return () => ipcRenderer.removeListener('tmux:stream-data', handler)
  },
  onChatData: (callback: (messages: ChatMessage[]) => void): (() => void) => {
    const handler = (_event: unknown, messages: ChatMessage[]): void => callback(messages)
    ipcRenderer.on('tmux:chat-data', handler)
    return () => ipcRenderer.removeListener('tmux:chat-data', handler)
  },
  selectImages: (): Promise<string[]> => ipcRenderer.invoke('dialog:open-image'),
  onImageDropped: (callback: (paths: string[]) => void): (() => void) => {
    const handler = (_event: unknown, paths: string[]): void => callback(paths)
    ipcRenderer.on('image-dropped', handler)
    return () => ipcRenderer.removeListener('image-dropped', handler)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore (define in dts)
  window.api = api
}

// Prevent Electron from navigating to dropped files & capture image drops
window.addEventListener('DOMContentLoaded', () => {
  const imageExt = /\.(png|jpe?g|gif|webp|svg|bmp)$/i

  document.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  document.addEventListener('drop', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const paths: string[] = []
    if (e.dataTransfer) {
      for (const file of Array.from(e.dataTransfer.files)) {
        const filePath = webUtils.getPathForFile(file)
        if (filePath && imageExt.test(filePath)) {
          paths.push(filePath)
        }
      }
    }
    if (paths.length > 0) {
      ipcRenderer.send('image-dropped-from-renderer', paths)
    }
  })
})
