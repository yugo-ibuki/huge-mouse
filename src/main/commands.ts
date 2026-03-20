import { existsSync, readdirSync, readFileSync, watch, FSWatcher } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface SlashCommand {
  name: string
  description: string
  source: 'user' | 'project'
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  commands: SlashCommand[]
  loadedAt: number
  watcher: FSWatcher | null
}

// User-level cache: shared across all sessions
let userCache: CacheEntry | null = null

// Project-level cache: keyed by absolute cwd path
const projectCacheMap = new Map<string, CacheEntry>()

function loadCommandsFromDir(dir: string, source: 'user' | 'project'): SlashCommand[] {
  if (!existsSync(dir)) return []
  try {
    const files = readdirSync(dir)
    return files
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const name = f.replace(/\.md$/, '')
        let description = ''
        try {
          const content = readFileSync(join(dir, f), 'utf-8')
          const firstLine = content.split('\n')[0] ?? ''
          // Strip markdown heading markers to get plain description
          description = firstLine.replace(/^#+\s*/, '').trim()
        } catch {
          // Ignore read errors for individual files
        }
        return { name, description, source }
      })
  } catch {
    return []
  }
}

function watchDir(dir: string, onChanged: () => void): FSWatcher | null {
  if (!existsSync(dir)) return null
  try {
    return watch(dir, () => onChanged())
  } catch {
    return null
  }
}

function getUserCommands(): SlashCommand[] {
  const userDir = join(homedir(), '.claude', 'commands')

  if (userCache && Date.now() - userCache.loadedAt < CACHE_TTL_MS) {
    return userCache.commands
  }

  const commands = loadCommandsFromDir(userDir, 'user')

  // Close existing watcher before replacing cache
  userCache?.watcher?.close()

  const watcher = watchDir(userDir, () => {
    // Force reload on next access when directory changes
    if (userCache) userCache.loadedAt = 0
  })

  userCache = { commands, loadedAt: Date.now(), watcher }
  return commands
}

function getProjectCommands(cwd: string): SlashCommand[] {
  if (!cwd) return []
  const projectDir = join(cwd, '.claude', 'commands')

  const cached = projectCacheMap.get(cwd)
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.commands
  }

  const commands = loadCommandsFromDir(projectDir, 'project')

  // Close existing watcher before replacing cache entry
  cached?.watcher?.close()

  const watcher = watchDir(projectDir, () => {
    const entry = projectCacheMap.get(cwd)
    if (entry) entry.loadedAt = 0
  })

  projectCacheMap.set(cwd, { commands, loadedAt: Date.now(), watcher })
  return commands
}

export function listCommands(cwd: string): SlashCommand[] {
  const userCmds = getUserCommands()
  const projectCmds = getProjectCommands(cwd)
  return [...userCmds, ...projectCmds]
}
