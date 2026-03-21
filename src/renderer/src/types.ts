export interface SlashCommand {
  name: string
  body: string
}

export interface SkillCommand {
  name: string
  body: string
  source: 'skill-user' | 'skill-project'
}

export interface TmuxChoice {
  number: string
  label: string
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

export interface TmuxPane {
  target: string
  pid: string
  command: string
  title: string
  status: 'idle' | 'busy' | 'waiting'
  choices: TmuxChoice[]
  prompt: string
}
