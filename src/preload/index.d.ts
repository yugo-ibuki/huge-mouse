import { ElectronAPI } from '@electron-toolkit/preload'

interface TmuxChoice {
  number: string
  label: string
}

interface TmuxPane {
  target: string
  pid: string
  command: string
  title: string
  status: 'idle' | 'busy' | 'waiting'
  choices: TmuxChoice[]
  prompt: string
}

interface SendResult {
  success: boolean
  error?: string
}

interface TmuxAPI {
  listSessions: () => Promise<TmuxPane[]>
  sendInput: (target: string, text: string) => Promise<SendResult>
  setAlwaysOnTop: (value: boolean) => Promise<boolean>
  getAlwaysOnTop: () => Promise<boolean>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: TmuxAPI
  }
}
