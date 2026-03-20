export interface TmuxChoice {
  number: string
  label: string
}

export interface TmuxPane {
  target: string
  pid: string
  command: string
  title: string
  status: 'idle' | 'busy' | 'waiting'
  choices: TmuxChoice[]
  prompt: string
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

export const api = {
  listSessions: async (): Promise<TmuxPane[]> => {
    const res = await fetch('/api/panes')
    return res.json()
  },

  sendInput: async (target: string, text: string, vimMode = false): Promise<SendResult> => {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, text, vimMode })
    })
    return res.json()
  },

  capturePane: async (target: string): Promise<string> => {
    const res = await fetch(`/api/capture?target=${encodeURIComponent(target)}`)
    const data = await res.json()
    return data.content
  },

  getPaneDetail: async (target: string): Promise<PaneDetail | null> => {
    const res = await fetch(`/api/detail?target=${encodeURIComponent(target)}`)
    const data = await res.json()
    return data
  },

  gitAdd: async (cwd: string): Promise<SendResult> => {
    const res = await fetch('/api/git/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd })
    })
    return res.json()
  },

  gitCommit: async (cwd: string, message: string): Promise<SendResult> => {
    const res = await fetch('/api/git/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd, message })
    })
    return res.json()
  },

  gitPush: async (cwd: string): Promise<SendResult> => {
    const res = await fetch('/api/git/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd })
    })
    return res.json()
  }
}
