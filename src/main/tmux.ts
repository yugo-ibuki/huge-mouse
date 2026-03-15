import { execFile } from 'child_process'
import { existsSync } from 'fs'

export type PaneStatus = 'idle' | 'busy' | 'waiting'

export interface TmuxChoice {
  number: string
  label: string
}

export interface TmuxPane {
  target: string
  pid: string
  command: string
  title: string
  status: PaneStatus
  choices: TmuxChoice[]
  prompt: string
}

const TMUX_PATHS = ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux']
const GIT_PATHS = ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git']

function findBin(candidates: string[], fallback: string): string {
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return fallback
}

const tmuxBin = findBin(TMUX_PATHS, 'tmux')
const gitBin = findBin(GIT_PATHS, 'git')

function getTmuxSocketPath(): string | undefined {
  // When launched from Finder, TMUX env var is not inherited.
  // Try common default socket paths.
  const candidates = [
    process.env['TMUX']?.split(',')[0],
    `/private/tmp/tmux-${process.getuid?.() ?? 0}/default`
  ]
  for (const c of candidates) {
    if (c && existsSync(c)) return c
  }
  return undefined
}

function run(args: string[]): Promise<string> {
  const socketPath = getTmuxSocketPath()
  const fullArgs = socketPath ? ['-S', socketPath, ...args] : args

  return new Promise((resolve, reject) => {
    execFile(tmuxBin, fullArgs, { timeout: 5000, env: { ...process.env, LANG: 'en_US.UTF-8' } }, (error, stdout, stderr) => {
      if (error) {
        console.error('[tmux]', error.message, stderr)
        return reject(error)
      }
      resolve(stdout)
    })
  })
}

function runGit(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(gitBin, args, { timeout: 30000 }, (error, stdout) => {
      if (error) return reject(error)
      resolve(stdout)
    })
  })
}

const MODEL_PATTERNS = [
  /claude-opus[^\s]*/i,
  /claude-sonnet[^\s]*/i,
  /claude-haiku[^\s]*/i,
  /claude-\d[^\s]*/i,
  /\b(opus|sonnet|haiku)\s+[\d.]+/i,
  /model:\s*([^\s,]+)/i,
  /\bgpt-[^\s]*/i,
  /\bo[13]-[^\s]*/i,
  /\bcodex-[^\s]*/i
]

function parseModel(content: string): string {
  const lines = content.split('\n')
  for (const line of lines) {
    for (const pattern of MODEL_PATTERNS) {
      const match = line.match(pattern)
      if (match) return match[0].trim()
    }
  }
  return ''
}

function parseSessionId(content: string): string {
  const lines = content.split('\n')
  for (const line of lines) {
    // "session: abc123..." or "Session ID: abc123..."
    const idMatch = line.match(/[Ss]ession(?:\s*ID)?[:\s]+([a-f0-9-]{8,})/)
    if (idMatch) return idMatch[1]
    // standalone UUID pattern near "session" context
    const uuidMatch = line.match(/\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/)
    if (uuidMatch) return uuidMatch[1]
  }
  return ''
}

const WAITING_PATTERNS = [
  /Yes\s*\/\s*No/,
  /\(y\/n\)/i,
  /\(yes\/no\)/i,
  /Allow\s+for this session/,
  /Do you want to/
]

async function capturePaneContent(target: string): Promise<string> {
  try {
    return await run(['capture-pane', '-t', target, '-p'])
  } catch {
    return ''
  }
}

// Match only lines with special prompt markers (❯›>☞) followed by numbered choices.
// Space is intentionally excluded to avoid false positives on regular numbered lists.
const CHOICE_PATTERN = /^\s*[❯›>☞]\s*(\d+)[.)]\s+(.+)$/

function parseChoices(content: string): TmuxChoice[] {
  const lines = content.split('\n').slice(-20)
  const choices: TmuxChoice[] = []
  for (const line of lines) {
    const match = line.match(CHOICE_PATTERN)
    if (match) {
      choices.push({ number: match[1], label: match[2].trim() })
    }
  }
  return choices
}

function parsePrompt(content: string): string {
  const lines = content.split('\n')
  // Walk backwards from end, skip choice lines and hints, collect prompt text
  const promptLines: string[] = []
  let pastChoices = false
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line === '') {
      if (pastChoices) break
      continue
    }
    if (CHOICE_PATTERN.test(line) || /^Esc to cancel/.test(line)) {
      pastChoices = true
      continue
    }
    if (pastChoices) {
      if (/^─+$/.test(line)) break
      promptLines.unshift(line)
    }
  }
  return promptLines.join('\n').trim()
}

function detectStatus(title: string, content: string): { status: PaneStatus; choices: TmuxChoice[]; prompt: string } {
  if (!title.includes('✳')) return { status: 'busy', choices: [], prompt: '' }

  const choices = parseChoices(content)

  // If numbered choices are detected, it's a waiting state regardless of prompt text
  if (choices.length > 0) {
    return { status: 'waiting', choices, prompt: parsePrompt(content) }
  }

  const lines = content.split('\n').slice(-10)
  for (const pattern of WAITING_PATTERNS) {
    if (lines.some((line) => pattern.test(line))) {
      return { status: 'waiting', choices: [], prompt: parsePrompt(content) }
    }
  }
  return { status: 'idle', choices: [], prompt: '' }
}

export async function listPanes(): Promise<TmuxPane[]> {
  const format = '#{session_name}:#{window_index}.#{pane_index}|#{pane_pid}|#{pane_current_command}|#{pane_title}'
  const stdout = await run(['list-panes', '-a', '-F', format])

  const panes = stdout
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [target, pid, command, title] = line.split('|')
      return { target, pid, command, title, status: 'busy' as PaneStatus, choices: [] as TmuxChoice[], prompt: '' }
    })
    .filter((pane) => /^(claude|codex)$/i.test(pane.command))

  await Promise.all(
    panes.map(async (pane) => {
      const content = await capturePaneContent(pane.target)
      const result = detectStatus(pane.title, content)
      pane.status = result.status
      pane.choices = result.choices
      pane.prompt = result.prompt
    })
  )

  return panes
}

const TARGET_PATTERN = /^[a-zA-Z0-9_-]+:\d+\.\d+$/

export async function sendInput(
  target: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  if (!TARGET_PATTERN.test(target)) {
    return { success: false, error: 'Invalid target format' }
  }

  try {
    // Detect if the pane is showing choices (waiting state).
    // When choices are visible and input is a single digit (1-9),
    // skip insert mode switch since choices work in normal mode.
    const content = await capturePane(target)
    const title = await run(['display-message', '-t', target, '-p', '#{pane_title}'])
    const { status } = detectStatus(title.trim(), content)
    const isChoiceResponse = status === 'waiting' && /^[1-9]$/.test(text)

    if (!isChoiceResponse) {
      // Ensure insert mode: Escape (go to normal) → i (enter insert)
      await run(['send-keys', '-t', target, 'Escape'])
      await new Promise((r) => setTimeout(r, 50))
      await run(['send-keys', '-t', target, 'i'])
      await new Promise((r) => setTimeout(r, 100))
    }

    const hasNewlines = text.includes('\n')
    if (hasNewlines) {
      // Send bracketed paste escape sequences to preserve newlines
      const trimmed = text.replace(/\n+$/, '')
      await run(['send-keys', '-t', target, '\x1b[200~'])
      await run(['send-keys', '-t', target, '-l', trimmed])
      await run(['send-keys', '-t', target, '\x1b[201~'])
      await new Promise((r) => setTimeout(r, 300))
      await run(['send-keys', '-t', target, '', 'Enter'])
    } else {
      await run(['send-keys', '-t', target, '-l', text])
      await run(['send-keys', '-t', target, 'Enter'])
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
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

export async function getPaneDetail(target: string): Promise<PaneDetail | null> {
  if (!TARGET_PATTERN.test(target)) return null
  try {
    const format = [
      '#{session_name}:#{window_index}.#{pane_index}',
      '#{pane_pid}',
      '#{pane_current_command}',
      '#{pane_title}',
      '#{pane_width}',
      '#{pane_height}',
      '#{pane_start_command}',
      '#{pane_current_path}',
      '#{pane_tty}'
    ].join('|')
    const stdout = await run(['display-message', '-t', target, '-p', format])
    const parts = stdout.trim().split('|')
    const cwd = parts[7]

    const [gitBranch, gitStatus, content] = await Promise.all([
      runGit(['-C', cwd, 'branch', '--show-current']).catch(() => ''),
      runGit(['-C', cwd, 'status', '--short']).catch(() => ''),
      capturePaneContent(target)
    ])

    const model = parseModel(content)
    const sessionId = parseSessionId(content)

    return {
      target: parts[0],
      pid: parts[1],
      command: parts[2],
      title: parts[3],
      width: parts[4],
      height: parts[5],
      startedAt: parts[6],
      cwd,
      tty: parts[8],
      gitBranch: gitBranch.trim(),
      gitStatus: gitStatus.trim(),
      model,
      sessionId
    }
  } catch {
    return null
  }
}

export async function gitAdd(cwd: string): Promise<{ success: boolean; error?: string }> {
  try {
    await runGit(['-C', cwd, 'add', '-A'])
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function gitCommit(
  cwd: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await runGit(['-C', cwd, 'commit', '-m', message])
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function gitPush(cwd: string): Promise<{ success: boolean; error?: string }> {
  try {
    await runGit(['-C', cwd, 'push'])
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function capturePane(target: string): Promise<string> {
  if (!TARGET_PATTERN.test(target)) return ''
  try {
    return await run(['capture-pane', '-t', target, '-p', '-S', '-500'])
  } catch {
    return ''
  }
}
