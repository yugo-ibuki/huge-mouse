import { execFile } from 'child_process'
import { existsSync } from 'fs'

export interface TmuxPane {
  target: string
  pid: string
  command: string
  title: string
}

const TMUX_PATHS = ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux']

function findTmux(): string {
  for (const p of TMUX_PATHS) {
    if (existsSync(p)) return p
  }
  return 'tmux'
}

const tmuxBin = findTmux()

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(tmuxBin, args, { timeout: 5000 }, (error, stdout) => {
      if (error) return reject(error)
      resolve(stdout)
    })
  })
}

export async function listPanes(): Promise<TmuxPane[]> {
  const format = '#{session_name}:#{window_index}.#{pane_index}|#{pane_pid}|#{pane_current_command}|#{pane_title}'
  const stdout = await run(['list-panes', '-a', '-F', format])

  return stdout
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [target, pid, command, title] = line.split('|')
      return { target, pid, command, title }
    })
    .filter((pane) => /^(claude|codex)$/i.test(pane.command))
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
