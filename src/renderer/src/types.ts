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

export interface TokenUsageSlice {
  input: number
  cachedInput: number
  output: number
  reasoningOutput: number
  total: number
  cacheHitRate: number | null
}

export interface TokenUsage extends TokenUsageSlice {
  lastRequest?: TokenUsageSlice
  updatedAt?: string
  source: 'claude-jsonl' | 'codex-jsonl' | 'none'
}

export interface TokenUsageSummary {
  all: TokenUsage
  claude: TokenUsage
  codex: TokenUsage
  updatedAt?: string
}

export interface TmuxPane {
  target: string
  pid: string
  command: string
  title: string
  status: 'idle' | 'busy' | 'waiting'
  choices: TmuxChoice[]
  prompt: string
  activityLine: string
}
