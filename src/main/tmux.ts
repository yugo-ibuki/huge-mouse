import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { readFile, readdir } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

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
  activityLine: string
}

// Strip ANSI escape sequences from captured pane content.
// capture-pane -p normally strips them, but FLICK (alternate screen) mode
// can leave CSI / OSC remnants in certain tmux versions.
const ESC = String.fromCharCode(0x1b)
const BEL = String.fromCharCode(0x07)
const RE_CSI = new RegExp(ESC + '\\[[0-9;]*[A-Za-z]', 'g')
const RE_OSC = new RegExp(ESC + '\\][^' + BEL + ESC + ']*(?:' + BEL + '|' + ESC + '\\\\)', 'g')
const RE_CHARSET = new RegExp(ESC + '[()][AB012]', 'g')
const RE_MODE = new RegExp(ESC + '[>=]', 'g')

function stripAnsi(text: string): string {
  return text.replace(RE_CSI, '').replace(RE_OSC, '').replace(RE_CHARSET, '').replace(RE_MODE, '')
}

// Detect if a pane is currently showing the alternate screen buffer
// (i.e. Claude Code is running in FLICK / NO_FLICKER mode).
async function isAlternateScreen(target: string): Promise<boolean> {
  try {
    const result = await run(['display-message', '-t', target, '-p', '#{alternate_on}'])
    return result.trim() === '1'
  } catch {
    return false
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

const TOOL_ICONS: Record<string, string> = {
  Read: '\u{1F4C4}',
  Edit: '\u{270F}\u{FE0F}',
  Write: '\u{1F4DD}',
  Bash: '\u{1F4BB}',
  Grep: '\u{1F50D}',
  Glob: '\u{1F4C2}',
  Agent: '\u{1F916}',
  WebFetch: '\u{1F310}',
  WebSearch: '\u{1F50E}',
  TodoWrite: '\u{1F4CB}'
}

function encodeCwd(cwd: string): string {
  return cwd.replace(/[/.]/g, '-')
}

// Walk the process tree from a given PID to find descendant PIDs (up to maxDepth).
// Used to locate the claude process running inside a tmux pane, since pane_pid
// is the initial shell (e.g. fish) and claude runs as a grandchild.
async function findDescendantPids(pid: string, maxDepth = 3): Promise<string[]> {
  const result: string[] = []
  const queue: { pid: string; depth: number }[] = [{ pid, depth: 0 }]

  while (queue.length > 0) {
    const item = queue.shift()!
    if (item.depth >= maxDepth) continue

    try {
      const output = await new Promise<string>((resolve, reject) => {
        execFile('pgrep', ['-P', item.pid], (err, stdout) => {
          if (err) reject(err)
          else resolve(stdout)
        })
      })
      for (const line of output.trim().split('\n')) {
        const childPid = line.trim()
        if (childPid) {
          result.push(childPid)
          queue.push({ pid: childPid, depth: item.depth + 1 })
        }
      }
    } catch {
      // pgrep returns exit code 1 when no children found
    }
  }

  return result
}

async function findSessionJsonl(target: string): Promise<string | null> {
  try {
    const info = await run([
      'display-message',
      '-t',
      target,
      '-p',
      '#{pane_pid}|#{pane_current_path}'
    ])
    const [pid, cwd] = info.trim().split('|')

    const claudeDir = join(homedir(), '.claude')
    const sessionsDir = join(claudeDir, 'sessions')

    // Helper: resolve a session file by PID to its JSONL path
    const resolveByPid = async (p: string): Promise<string | null> => {
      try {
        const data = JSON.parse(await readFile(join(sessionsDir, `${p}.json`), 'utf-8'))
        const jsonlPath = join(claudeDir, 'projects', encodeCwd(data.cwd), `${data.sessionId}.jsonl`)
        if (existsSync(jsonlPath)) return jsonlPath
      } catch {
        // no session file for this PID
      }
      return null
    }

    // 1. Try direct PID match (pane_pid itself)
    const direct = await resolveByPid(pid)
    if (direct) return direct

    // 2. Walk descendant processes (shell → claude grandchild) and match
    try {
      const descendants = await findDescendantPids(pid)
      for (const childPid of descendants) {
        const match = await resolveByPid(childPid)
        if (match) return match
      }
    } catch {
      // process tree walk failed
    }

    // 3. Fallback: scan session files for matching CWD, pick most recent
    try {
      const files = await readdir(sessionsDir)
      let best: { path: string; startedAt: number } | null = null

      for (const file of files) {
        if (!file.endsWith('.json')) continue
        try {
          const data = JSON.parse(await readFile(join(sessionsDir, file), 'utf-8'))
          if (data.cwd === cwd) {
            const jsonlPath = join(
              claudeDir,
              'projects',
              encodeCwd(data.cwd),
              `${data.sessionId}.jsonl`
            )
            if (existsSync(jsonlPath) && (!best || data.startedAt > best.startedAt)) {
              best = { path: jsonlPath, startedAt: data.startedAt }
            }
          }
        } catch {
          /* skip */
        }
      }
      return best?.path ?? null
    } catch {
      return null
    }
  } catch {
    return null
  }
}

function formatToolUse(block: { name?: string; input?: Record<string, string> }): string {
  const name = block.name ?? 'Tool'
  const icon = TOOL_ICONS[name] ?? '\u{1F527}'
  const input = block.input ?? {}

  if ((name === 'Read' || name === 'Edit' || name === 'Write') && input.file_path) {
    return `${icon} ${name} ${input.file_path.split('/').pop()}`
  }
  if (name === 'Bash' && input.command) {
    return `${icon} ${input.command.slice(0, 60)}`
  }
  if (name === 'Grep' && input.pattern) {
    return `${icon} Grep "${input.pattern.slice(0, 40)}"`
  }
  return `${icon} ${name}`
}

export async function getConversationLog(target: string): Promise<ChatMessage[]> {
  const jsonlPath = await findSessionJsonl(target)
  if (!jsonlPath) return []

  try {
    const raw = await readFile(jsonlPath, 'utf-8')
    const messages: ChatMessage[] = []

    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      try {
        const record = JSON.parse(line)

        if (record.type === 'user' && record.message?.role === 'user') {
          const text =
            typeof record.message.content === 'string' ? record.message.content.trim() : ''
          if (text) {
            messages.push({ role: 'user', text, timestamp: record.timestamp ?? '' })
          }
        } else if (record.type === 'assistant' && record.message?.role === 'assistant') {
          const blocks = record.message.content
          if (!Array.isArray(blocks)) continue

          const parts: string[] = []
          for (const block of blocks) {
            if (block.type === 'text' && block.text?.trim()) {
              parts.push(block.text.trim())
            } else if (block.type === 'tool_use') {
              parts.push(formatToolUse(block))
            }
          }

          if (parts.length > 0) {
            const last = messages[messages.length - 1]
            if (last?.role === 'assistant') {
              // Merge consecutive assistant messages (same turn)
              last.text += '\n' + parts.join('\n')
              last.timestamp = record.timestamp ?? last.timestamp
            } else {
              messages.push({
                role: 'assistant',
                text: parts.join('\n'),
                timestamp: record.timestamp ?? ''
              })
            }
          }
        }
      } catch {
        /* skip malformed lines */
      }
    }

    return messages
  } catch {
    return []
  }
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
    execFile(
      tmuxBin,
      fullArgs,
      { timeout: 5000, env: { ...process.env, LANG: 'en_US.UTF-8' } },
      (error, stdout, stderr) => {
        if (error) {
          console.error('[tmux]', error.message, stderr)
          return reject(error)
        }
        resolve(stdout)
      }
    )
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
    const uuidMatch = line.match(
      /\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/
    )
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
    const output = await run(['capture-pane', '-t', target, '-p'])
    return stripAnsi(output)
  } catch {
    return ''
  }
}

// Choice patterns in Claude CLI:
//   One-per-line with marker:  " ❯ 1. Yes"  /  "  2. No"
//   One-per-line with colon:   "  1: Bad"
//   Inline (multiple on one line): "  1: Bad    2: Fine   3: Good   0: Dismiss"
// Marker characters: ❯ › > ☞ ●
const MARKER_CHOICE_PATTERN = /^\s*[❯›>☞●]\s*(\d+)[.:)]\s*(.+)$/
const PLAIN_CHOICE_PATTERN = /^\s+(\d+)[.:)]\s*(.+)$/
// Inline choices: multiple "N: label" separated by whitespace on a single line
const INLINE_CHOICE_PATTERN = /(\d+)[.:)]\s+(\S+)/g

// Session feedback prompt — optional rating, not an actionable choice
const SESSION_RATING_PATTERN = /how is claude doing/i
// Broader optional survey detection: "(optional)" marker in surrounding context
const OPTIONAL_SURVEY_PATTERN = /\(optional\)/i
// Feedback/rating labels that indicate a survey rather than an actionable choice
const SURVEY_LABEL_SET = new Set(['bad', 'fine', 'good', 'great', 'dismiss', 'skip'])

// Check if choices are all feedback/rating labels (survey, not actionable)
function isSurveyChoices(choices: TmuxChoice[]): boolean {
  return (
    choices.length > 0 && choices.every((c) => SURVEY_LABEL_SET.has(c.label.toLowerCase()))
  )
}

// Check if surrounding lines contain "(optional)" marker
function hasOptionalContext(lines: string[], centerIndex: number): boolean {
  // Check up to 3 lines before and 1 line after for "(optional)"
  const start = Math.max(0, centerIndex - 3)
  const end = Math.min(lines.length - 1, centerIndex + 1)
  for (let i = start; i <= end; i++) {
    if (OPTIONAL_SURVEY_PATTERN.test(lines[i])) return true
  }
  return false
}

function parseChoices(content: string): TmuxChoice[] {
  const allLines = content.split('\n')

  // Strip trailing empty lines — TUI apps (Claude CLI) pad below visible content
  while (allLines.length > 0 && allLines[allLines.length - 1].trim() === '') {
    allLines.pop()
  }
  // Strip CLI footer lines (separator ─{5,}, session/model info, prompt cursor, mode indicator)
  // so that the "last 20 lines" window reaches the actual content area.
  while (allLines.length > 0) {
    const last = allLines[allLines.length - 1]
    if (
      /─{5,}/.test(last) ||
      /^\s*(Session|Model)\b/.test(last) ||
      /^\s*❯\s*$/.test(last) ||
      /\b(plan|compact) mode\b/.test(last)
    ) {
      allLines.pop()
      // Also strip blank lines between footer sections
      while (allLines.length > 0 && allLines[allLines.length - 1].trim() === '') {
        allLines.pop()
      }
    } else {
      break
    }
  }

  // "Yes, and don't ask again for:" choices can include full command text,
  // spanning many lines. 50 lines covers these long permission prompts.
  const lines = allLines.slice(-50)
  const choices: TmuxChoice[] = []
  let inChoiceBlock = false
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    // Try inline format first: "  1: Bad    2: Fine   3: Good"
    const inlineMatches = [...line.matchAll(INLINE_CHOICE_PATTERN)]
    if (inlineMatches.length >= 2) {
      // Skip optional survey/feedback prompts (not actionable choices)
      const prevLine = li > 0 ? lines[li - 1] : ''
      if (SESSION_RATING_PATTERN.test(prevLine)) continue
      const inlineCandidates = inlineMatches.map((m) => ({
        number: m[1],
        label: m[2].trim()
      }))
      if (isSurveyChoices(inlineCandidates) || hasOptionalContext(lines, li)) continue
      // Multiple choices on one line — inline format
      inChoiceBlock = true
      for (const c of inlineCandidates) {
        choices.push(c)
      }
      continue
    }

    const markerMatch = line.match(MARKER_CHOICE_PATTERN)
    if (markerMatch) {
      inChoiceBlock = true
      choices.push({ number: markerMatch[1], label: markerMatch[2].trim() })
      continue
    }
    if (inChoiceBlock) {
      const plainMatch = line.match(PLAIN_CHOICE_PATTERN)
      if (plainMatch) {
        choices.push({ number: plainMatch[1], label: plainMatch[2].trim() })
      } else if (line.trim() === '' || /^\s+\S/.test(line)) {
        // Allow blank lines and continuation lines (multi-line labels) within choice block
        continue
      } else {
        // Non-matching line ends the choice block
        inChoiceBlock = false
      }
    }
  }
  // Filter out survey/feedback choices that appeared in marker/plain format
  if (isSurveyChoices(choices)) return []
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
    if (
      MARKER_CHOICE_PATTERN.test(line) ||
      PLAIN_CHOICE_PATTERN.test(line) ||
      /^Esc to cancel/.test(line)
    ) {
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

// Codex displays "-ing" words during processing: Working, Thinking, Reconnecting, etc.
// These typically appear with "esc to interrupt" nearby.
const CODEX_BUSY_PATTERNS = [
  /\b(?:Working|Thinking|Reconnecting|Connecting|Executing)\b/,
  /esc to interrupt/i
]

// Codex footer hint when idle: "Enter to send", "Ctrl+J" / "newline", "quit" etc.
// The Rust TUI may show these on separate lines or in different formats,
// so check for any of them individually rather than requiring all on one line.
const CODEX_IDLE_INDICATORS = [
  /enter\s+to\s+send/i,
  /\bsend\b.*\bnewline\b.*\bquit\b/ // legacy format (backward compat)
]

// Extract activity indicator line from pane content (e.g. "✻ Imagining… (17s · ↑ 107 tokens)")
// These lines appear when Claude is actively processing.
function parseActivityLine(content: string): string {
  const lines = content.split('\n')
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
    const line = lines[i].trim()
    if (!line) continue
    // Match lines starting with activity indicator characters (✻, ⏺, braille spinners)
    // followed by text containing ellipsis (…)
    if (/^[✻⏺\u2800-\u28FF]/.test(line) && /…/.test(line)) {
      return line
    }
  }
  return ''
}

function detectStatusClaude(
  title: string,
  content: string
): { status: PaneStatus; choices: TmuxChoice[]; prompt: string; activityLine: string } {
  // Always check for choices first — permission prompts (e.g. "Do you want to proceed?
  // ❯ 1. Yes  2. No") can appear while the title still shows ⠂ (busy).
  const choices = parseChoices(content)
  if (choices.length > 0) {
    return { status: 'waiting', choices, prompt: parsePrompt(content), activityLine: '' }
  }

  if (!title.includes('✳')) {
    return {
      status: 'busy',
      choices: [],
      prompt: '',
      activityLine: parseActivityLine(content)
    }
  }

  const lines = content.split('\n').slice(-10)
  for (const pattern of WAITING_PATTERNS) {
    if (lines.some((line) => pattern.test(line))) {
      return { status: 'waiting', choices: [], prompt: parsePrompt(content), activityLine: '' }
    }
  }
  return { status: 'idle', choices: [], prompt: '', activityLine: '' }
}

// Codex presents options as indented "- " list items
const CODEX_OPTION_PATTERN = /^\s+-\s+\S/
// "- ...?" is a definitive question/choice indicator
const CODEX_QUESTION_PATTERN = /^\s+-\s+.+\?/

function detectStatusCodex(content: string): {
  status: PaneStatus
  choices: TmuxChoice[]
  prompt: string
  activityLine: string
} {
  const lines = content.split('\n').slice(-15)
  const tail = lines.join('\n')

  // 1. Check for explicit busy signals (-ing words or "esc to interrupt")
  const isBusy = CODEX_BUSY_PATTERNS.some((p) => p.test(tail))
  if (isBusy) {
    return { status: 'busy', choices: [], prompt: '', activityLine: parseActivityLine(content) }
  }

  // 2. Check for explicit idle signals (footer hints)
  const isIdle = CODEX_IDLE_INDICATORS.some((p) => p.test(tail))
  if (isIdle) {
    const hasQuestion = lines.some((line) => CODEX_QUESTION_PATTERN.test(line))
    const optionCount = lines.filter((line) => CODEX_OPTION_PATTERN.test(line)).length
    if (hasQuestion || optionCount >= 2) {
      return { status: 'waiting', choices: [], prompt: '', activityLine: '' }
    }
    return { status: 'idle', choices: [], prompt: '', activityLine: '' }
  }

  // 3. No busy signal detected → default to idle (not busy).
  // If Codex is NOT showing "Working"/"Thinking"/etc,
  // it is most likely at the input prompt waiting for user input.
  return { status: 'idle', choices: [], prompt: '', activityLine: '' }
}

function detectStatus(
  title: string,
  content: string,
  command: string
): { status: PaneStatus; choices: TmuxChoice[]; prompt: string; activityLine: string } {
  if (command === 'codex') return detectStatusCodex(content)
  return detectStatusClaude(title, content)
}

export async function listPanes(): Promise<TmuxPane[]> {
  const format =
    '#{session_name}:#{window_index}.#{pane_index}|#{pane_pid}|#{pane_current_command}|#{pane_title}'
  const stdout = await run(['list-panes', '-a', '-F', format])

  const panes = stdout
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [target, pid, command, title] = line.split('|')
      return {
        target,
        pid,
        command,
        title,
        status: 'busy' as PaneStatus,
        choices: [] as TmuxChoice[],
        prompt: '',
        activityLine: ''
      }
    })
    // Support popular wrappers like `ai` in addition to `claude` and `codex`.
    // Also check pane_title as a fallback — when codex spawns subprocesses,
    // pane_current_command may change to `node` while the title still contains `codex`.
    .filter((pane) => {
      if (/^(claude|codex|ai)(\b|-)/i.test(pane.command)) {
        // Normalize variant names like `codex-aarch64-a` to `codex`
        if (/^codex/i.test(pane.command)) pane.command = 'codex'
        else if (/^claude/i.test(pane.command)) pane.command = 'claude'
        return true
      }
      // Claude Code sets distinctive title prefixes: ✳ (idle) or Braille
      // spinner characters U+2800-U+28FF (busy). In plan execution mode the
      // title becomes e.g. "✳ fix-textarea-input-jank" without "claude",
      // so we detect these prefixes as a Claude Code indicator.
      if (/^[✳\u2800-\u28FF]/.test(pane.title)) {
        pane.command = 'claude'
        return true
      }
      if (/\b(claude|codex)\b/i.test(pane.title)) {
        // pane_current_command changed to a subprocess (e.g. node).
        // Normalize command so detectStatus routes correctly.
        const titleLower = pane.title.toLowerCase()
        if (titleLower.includes('codex')) pane.command = 'codex'
        else if (titleLower.includes('claude')) pane.command = 'claude'
        return true
      }
      return false
    })

  await Promise.all(
    panes.map(async (pane) => {
      const content = await capturePaneContent(pane.target)
      const result = detectStatus(pane.title, content, pane.command)
      pane.status = result.status
      pane.choices = result.choices
      pane.prompt = result.prompt
      pane.activityLine = result.activityLine
    })
  )

  return panes
}

const TARGET_PATTERN = /^[a-zA-Z0-9_-]+:\d+\.\d+$/

export async function sendInput(
  target: string,
  text: string,
  vimMode = false
): Promise<{ success: boolean; error?: string }> {
  if (!TARGET_PATTERN.test(target)) {
    return { success: false, error: 'Invalid target format' }
  }

  try {
    // Detect if the pane is showing choices (waiting state).
    // When choices are visible and input is a single digit (1-9),
    // skip insert mode switch since choices work in normal mode.
    const content = await capturePaneContent(target)
    const titleAndCmd = await run([
      'display-message',
      '-t',
      target,
      '-p',
      '#{pane_title}|#{pane_current_command}'
    ])
    const [title, command] = titleAndCmd.trim().split('|')
    const { status } = detectStatus(title, content, command)
    const isChoiceResponse = status === 'waiting' && /^[1-9]$/.test(text)

    // Only send Escape+i when Claude CLI is in vim input mode.
    // In native (readline) mode, Escape+i would type a literal "i".
    if (!isChoiceResponse && vimMode) {
      await run(['send-keys', '-t', target, 'Escape'])
      await new Promise((r) => setTimeout(r, 50))
      await run(['send-keys', '-t', target, 'i'])
      await new Promise((r) => setTimeout(r, 100))
    }

    const isCodex = command === 'codex'
    const hasNewlines = text.includes('\n')

    if (isCodex) {
      // Codex ignores Enter from external tmux clients. Use run-shell
      // to execute send-keys from within the tmux server process itself.
      await run(['send-keys', '-t', target, '-l', text])
      await run(['run-shell', `${tmuxBin} send-keys -t ${target} Enter`])
    } else if (hasNewlines) {
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

export async function gitDiff(cwd: string, staged: boolean): Promise<string> {
  try {
    const args = ['-C', cwd, 'diff']
    if (staged) args.push('--staged')
    return await runGit(args)
  } catch {
    return ''
  }
}

export async function listTmuxSessions(): Promise<string[]> {
  try {
    const stdout = await run(['list-sessions', '-F', '#{session_name}'])
    return stdout
      .trim()
      .split('\n')
      .filter((s) => s.length > 0)
  } catch {
    return []
  }
}

export async function createSession(
  sessionName: string,
  command: 'claude' | 'codex',
  cwd?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const args = ['new-window', '-a', '-t', sessionName]
    if (cwd) args.push('-c', cwd)
    args.push(command)
    await run(args)
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}


export async function killPane(target: string): Promise<{ success: boolean; error?: string }> {
  if (!TARGET_PATTERN.test(target)) {
    return { success: false, error: 'Invalid target format' }
  }
  try {
    await run(['kill-pane', '-t', target])
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

function trimCliFooter(output: string): string {
  const lines = output.split('\n')

  // Strip trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop()
  }

  // Strip CLI footer lines from the bottom: separator, session/model info,
  // prompt cursor, mode indicator, token/cost counters (FLICK mode).
  while (lines.length > 0) {
    const last = lines[lines.length - 1]
    if (
      /─{5,}/.test(last) ||
      /^\s*(Session|Model)\b/.test(last) ||
      /^\s*❯\s*$/.test(last) ||
      /\b(plan|compact) mode\b/.test(last) ||
      // FLICK mode renders token/cost counters and message counts in the footer
      /\d+\s*tokens?\b/i.test(last) ||
      /\$[\d.]+\s*(cost|spent)/i.test(last) ||
      // Keybinding hints that appear at the bottom of FLICK TUI
      /^\s*(Ctrl|Esc|Enter)\b.*\b(send|cancel|submit|menu)\b/i.test(last) ||
      // Empty input area indicator
      /^\s*>\s*$/.test(last)
    ) {
      lines.pop()
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop()
      }
    } else {
      break
    }
  }

  return lines.join('\n')
}

export async function capturePane(target: string): Promise<string> {
  if (!TARGET_PATTERN.test(target)) return ''
  try {
    const altScreen = await isAlternateScreen(target)
    // Alternate screen (FLICK / NO_FLICKER mode) has no scrollback history,
    // so -S -500 is useless. Just capture the current visible screen.
    const args = altScreen
      ? ['capture-pane', '-t', target, '-p']
      : ['capture-pane', '-t', target, '-p', '-S', '-500']
    const output = await run(args)
    return trimCliFooter(stripAnsi(output))
  } catch {
    return ''
  }
}

export async function findShellPane(session: string): Promise<string | null> {
  const format = '#{session_name}:#{window_index}.#{pane_index}|#{window_name}'
  const stdout = await run(['list-panes', '-a', '-F', format])
  for (const line of stdout.trim().split('\n')) {
    const [target, windowName] = line.split('|')
    if (target.startsWith(session + ':') && windowName === 'unitmux-shell') {
      return target
    }
  }
  return null
}

export async function ensureShellPane(
  session: string,
  cwd: string
): Promise<{ success: boolean; target?: string; error?: string }> {
  try {
    const existing = await findShellPane(session)
    if (existing) return { success: true, target: existing }

    const currentWindow = await run([
      'display-message', '-t', session, '-p', '#{window_index}'
    ]).then((s) => s.trim())

    const args = ['new-window', '-t', session, '-n', 'unitmux-shell']
    if (cwd) args.push('-c', cwd)
    await run(args)

    await run(['select-window', '-t', `${session}:${currentWindow}`])

    const target = await findShellPane(session)
    if (!target) return { success: false, error: 'Shell pane created but not found' }
    return { success: true, target }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// Exported for testing only
export const _testInternals = {
  parseChoices,
  detectStatusClaude,
  trimCliFooter,
  stripAnsi
}
