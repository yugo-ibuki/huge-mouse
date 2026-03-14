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

interface PaneDetail {
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

interface SendResult {
  success: boolean
  error?: string
}

interface TmuxAPI {
  listSessions: () => Promise<TmuxPane[]>
  sendInput: (target: string, text: string) => Promise<SendResult>
  capturePane: (target: string) => Promise<string>
  getPaneDetail: (target: string) => Promise<PaneDetail | null>
  setAlwaysOnTop: (value: boolean) => Promise<boolean>
  getAlwaysOnTop: () => Promise<boolean>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: TmuxAPI
  }
}
