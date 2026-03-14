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

function findTmux(): string {
  for (const p of TMUX_PATHS) {
    if (existsSync(p)) return p
  }
  return 'tmux'
}

const tmuxBin = findTmux()

function getTmuxSocketPath(): string | undefined {
  // When launched from Finder, TMUX env var is not inherited.
  // Try common default socket paths.
  const candidates = [
    process.env['TMUX']?.split(',')[0],
    `/private/tmp/tmux-${process.getuid()}/default`
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
    execFile(tmuxBin, fullArgs, { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[tmux]', error.message, stderr)
        return reject(error)
      }
      resolve(stdout)
    })
  })
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

const CHOICE_PATTERN = /^\s*[❯ ]\s*(\d+)\.\s+(.+)$/

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
  // Find the prompt block between the separator line and the choices
  const promptLines: string[] = []
  let inPromptBlock = false
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (CHOICE_PATTERN.test(line)) continue
    if (/^Esc to cancel/.test(line)) continue
    if (/^Do you want to/.test(line)) {
      inPromptBlock = true
      continue
    }
    if (inPromptBlock) {
      if (line === '' || /^─+$/.test(line)) break
      promptLines.unshift(line)
    }
  }
  return promptLines.join('\n').trim()
}

function detectStatus(title: string, content: string): { status: PaneStatus; choices: TmuxChoice[]; prompt: string } {
  if (!title.includes('✳')) return { status: 'busy', choices: [], prompt: '' }
  const lines = content.split('\n').slice(-10)
  for (const pattern of WAITING_PATTERNS) {
    if (lines.some((line) => pattern.test(line))) {
      return { status: 'waiting', choices: parseChoices(content), prompt: parsePrompt(content) }
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

  const sanitized = text.replace(/\n/g, ' ')

  try {
    await run(['send-keys', '-t', target, '-l', sanitized])
    await run(['send-keys', '-t', target, 'Enter'])
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}
