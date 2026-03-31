import { ElectronAPI } from '@electron-toolkit/preload'

interface SkillEntry {
  name: string
  description: string
}

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
  listSkills: (cwd: string) => Promise<{ user: SkillEntry[]; project: SkillEntry[] }>
  listTmuxSessions: () => Promise<string[]>
  createSession: (
    sessionName: string,
    command: 'claude' | 'codex',
    cwd?: string
  ) => Promise<SendResult>
  killPane: (target: string) => Promise<SendResult>
  findShellPane: (session: string) => Promise<string | null>
  ensureShellPane: (
    session: string,
    cwd: string
  ) => Promise<{ success: boolean; target?: string; error?: string }>
  sendInput: (
    target: string,
    text: string,
    vimMode?: boolean,
    paneStatus?: string,
    paneCommand?: string
  ) => Promise<SendResult>
  capturePane: (target: string) => Promise<string>
  getPaneDetail: (target: string) => Promise<PaneDetail | null>
  listTmuxSessions: () => Promise<string[]>
  createSession: (
    sessionName: string,
    command: 'claude' | 'codex',
    cwd?: string
  ) => Promise<SendResult>
  killPane: (target: string) => Promise<SendResult>
  gitAdd: (cwd: string) => Promise<SendResult>
  gitCommit: (cwd: string, message: string) => Promise<SendResult>
  gitPush: (cwd: string) => Promise<SendResult>
  setAlwaysOnTop: (value: boolean) => Promise<boolean>
  getAlwaysOnTop: () => Promise<boolean>
  setOpacity: (value: number) => Promise<number>
  getOpacity: () => Promise<number>
  setFocusShortcut: (key: string) => Promise<boolean>
  toggleCompact: () => Promise<boolean>
  onCompactChanged: (callback: (compact: boolean) => void) => () => void
  onFocusTextarea: (callback: () => void) => () => void
  startStream: (target: string) => Promise<boolean>
  stopStream: () => Promise<boolean>
  onStreamData: (callback: (content: string) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: TmuxAPI
  }
}
