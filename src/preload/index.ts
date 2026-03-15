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
  sendInput: (target: string, text: string): Promise<SendResult> =>
    ipcRenderer.invoke('tmux:send-input', { target, text }),
  capturePane: (target: string): Promise<string> =>
    ipcRenderer.invoke('tmux:capture-pane', target),
  getPaneDetail: (target: string): Promise<PaneDetail | null> =>
    ipcRenderer.invoke('tmux:pane-detail', target),
  gitAdd: (cwd: string): Promise<SendResult> => ipcRenderer.invoke('git:add', cwd),
  gitCommit: (cwd: string, message: string): Promise<SendResult> =>
    ipcRenderer.invoke('git:commit', { cwd, message }),
  gitPush: (cwd: string): Promise<SendResult> => ipcRenderer.invoke('git:push', cwd),
  setAlwaysOnTop: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke('window:set-always-on-top', value),
  getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('window:get-always-on-top'),
  setOpacity: (value: number): Promise<number> =>
    ipcRenderer.invoke('window:set-opacity', value),
  getOpacity: (): Promise<number> => ipcRenderer.invoke('window:get-opacity'),
  setFocusShortcut: (key: string): Promise<boolean> =>
    ipcRenderer.invoke('window:set-focus-shortcut', key),
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
