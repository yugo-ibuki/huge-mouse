import { ElectronAPI } from '@electron-toolkit/preload'

interface TmuxPane {
  target: string
  pid: string
  command: string
  title: string
}

interface SendResult {
  success: boolean
  error?: string
}

interface TmuxAPI {
  listSessions: () => Promise<TmuxPane[]>
  sendInput: (target: string, text: string) => Promise<SendResult>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: TmuxAPI
  }
}
