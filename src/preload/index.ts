import { contextBridge, ipcRenderer } from 'electron'

export interface TmuxPane {
  target: string
  pid: string
  command: string
  title: string
}

export interface SendResult {
  success: boolean
  error?: string
}

const api = {
  listSessions: (): Promise<TmuxPane[]> => ipcRenderer.invoke('tmux:list-sessions'),
  sendInput: (target: string, text: string): Promise<SendResult> =>
    ipcRenderer.invoke('tmux:send-input', { target, text }),
  setAlwaysOnTop: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke('window:set-always-on-top', value),
  getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('window:get-always-on-top')
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
