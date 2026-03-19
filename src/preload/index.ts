import { contextBridge, ipcRenderer } from 'electron'

export interface TmuxPane {
  target: string
  pid: string
  command: string
  title: string
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
  sendInput: (target: string, text: string, vimMode = false): Promise<SendResult> =>
    ipcRenderer.invoke('tmux:send-input', { target, text, vimMode }),
  capturePane: (target: string): Promise<string> => ipcRenderer.invoke('tmux:capture-pane', target),
  getPaneDetail: (target: string): Promise<PaneDetail | null> =>
    ipcRenderer.invoke('tmux:pane-detail', target),
  gitAdd: (cwd: string): Promise<SendResult> => ipcRenderer.invoke('git:add', cwd),
  gitCommit: (cwd: string, message: string): Promise<SendResult> =>
    ipcRenderer.invoke('git:commit', { cwd, message }),
  gitPush: (cwd: string): Promise<SendResult> => ipcRenderer.invoke('git:push', cwd),
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
  startStream: (target: string): Promise<boolean> =>
    ipcRenderer.invoke('tmux:start-stream', target),
  stopStream: (): Promise<boolean> => ipcRenderer.invoke('tmux:stop-stream'),
  onStreamData: (callback: (content: string) => void): (() => void) => {
    const handler = (_event: unknown, content: string): void => callback(content)
    ipcRenderer.on('tmux:stream-data', handler)
    return () => ipcRenderer.removeListener('tmux:stream-data', handler)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
