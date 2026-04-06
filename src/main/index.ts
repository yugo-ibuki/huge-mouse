import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, protocol } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { readdir, readFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  listPanes,
  sendInput,
  capturePane,
  getPaneDetail,
  gitAdd,
  gitAddFiles,
  gitCommit,
  gitPush,
  listTmuxSessions,
  createSession,
  createNewTmuxSession,
  killPane,
  findShellPane,
  ensureShellPane,
  gitDiff,
  getConversationText
} from './tmux'

interface SkillEntry {
  name: string
  description: string
}

// Parse YAML frontmatter block (---\n...\n---) from a markdown file
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const result: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      result[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim()
    }
  }
  return result
}

async function listSkillsFromDir(baseDir: string): Promise<SkillEntry[]> {
  try {
    const skillsDir = join(baseDir, '.claude', 'skills')
    const entries = await readdir(skillsDir, { withFileTypes: true })
    const skills: SkillEntry[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const content = await readFile(join(skillsDir, entry.name, 'SKILL.md'), 'utf-8')
        const fm = parseFrontmatter(content)
        if (fm.name) skills.push({ name: fm.name, description: fm.description ?? '' })
      } catch {
        // Skip unreadable SKILL.md files
      }
    }
    return skills
  } catch {
    return []
  }
}

// Streaming state: polls capture-pane (+ JSONL history) and pushes content to renderer
let streamTarget: string | null = null
let streamTimer: ReturnType<typeof setInterval> | null = null
let lastStreamContent = ''

function combineHistoryAndCapture(history: string, capture: string): string {
  if (!history) return capture
  if (!capture) return history
  return history + '\n\n── live ──────────────────────\n\n' + capture
}

function startStream(win: BrowserWindow, target: string): void {
  stopStream()
  streamTarget = target
  lastStreamContent = ''

  const tick = async (): Promise<void> => {
    if (!streamTarget) return
    try {
      const [history, capture] = await Promise.all([
        getConversationText(streamTarget),
        capturePane(streamTarget)
      ])
      const content = combineHistoryAndCapture(history, capture)
      if (content !== lastStreamContent) {
        // Skip if content shrank significantly — likely a mid-redraw capture
        // (TUI flicker). Allow small shrinkage for trimCliFooter variance.
        if (lastStreamContent && content.length < lastStreamContent.length * 0.8) {
          return
        }
        lastStreamContent = content
        win.webContents.send('tmux:stream-data', content)
      }
    } catch {
      // pane may have closed
    }
  }

  tick()
  streamTimer = setInterval(tick, 500)
}

function stopStream(): void {
  if (streamTimer) {
    clearInterval(streamTimer)
    streamTimer = null
  }
  streamTarget = null
  lastStreamContent = ''
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 400,
    alwaysOnTop: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Relay image drops from preload to renderer
  ipcMain.on('image-dropped-from-renderer', (_event, paths: string[]) => {
    mainWindow?.webContents.send('image-dropped', paths)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register custom protocol to serve local files for image thumbnails
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-image', privileges: { bypassCSP: true, supportFetchAPI: true } }
])

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.unitmux')

  // Handle local-image:// requests by serving files from disk
  protocol.handle('local-image', async (request) => {
    const filePath = decodeURIComponent(new URL(request.url).pathname)
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp'
    }
    const data = await readFile(filePath)
    return new Response(data, {
      headers: { 'Content-Type': mimeMap[ext] ?? 'application/octet-stream' }
    })
  })

  // Custom menu: remove Cmd+H (Hide) accelerator to prevent conflict with Ctrl+Cmd+H
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide', accelerator: '' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('tmux:list-sessions', async () => {
    try {
      return await listPanes()
    } catch {
      return []
    }
  })

  ipcMain.handle('tmux:send-input', async (_event, { target, text, vimMode, images }) => {
    return sendInput(target, text, vimMode, images)
  })

  ipcMain.handle('dialog:open-image', async () => {
    const win = mainWindow
    if (!win) return []
    // Temporarily disable alwaysOnTop so the native dialog is visible on macOS
    const wasOnTop = win.isAlwaysOnTop()
    if (wasOnTop) win.setAlwaysOnTop(false)
    try {
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }]
      })
      return result.canceled ? [] : result.filePaths
    } finally {
      if (wasOnTop) win.setAlwaysOnTop(true)
    }
  })

  ipcMain.handle('tmux:capture-pane', async (_event, target: string) => {
    const [history, capture] = await Promise.all([
      getConversationText(target),
      capturePane(target)
    ])
    return combineHistoryAndCapture(history, capture)
  })

  ipcMain.handle('tmux:start-stream', async (_event, arg: string) => {
    const win = mainWindow
    if (!win) return true
    startStream(win, arg)
    return true
  })

  ipcMain.handle('tmux:stop-stream', async () => {
    stopStream()
    return true
  })

  ipcMain.handle('tmux:pane-detail', async (_event, target: string) => {
    return getPaneDetail(target)
  })

  ipcMain.handle('tmux:list-tmux-sessions', async () => {
    try {
      return await listTmuxSessions()
    } catch {
      return []
    }
  })

  ipcMain.handle('tmux:create-session', async (_event, { sessionName, command, cwd }) => {
    return createSession(sessionName, command, cwd)
  })

  ipcMain.handle('tmux:create-new-session', async (_event, { sessionName, command, cwd }) => {
    return createNewTmuxSession(sessionName, command, cwd)
  })

  ipcMain.handle('tmux:kill-pane', async (_event, target: string) => {
    return killPane(target)
  })

  ipcMain.handle('tmux:find-shell-pane', async (_event, session: string) => {
    return findShellPane(session)
  })

  ipcMain.handle('tmux:ensure-shell-pane', async (_event, { session, cwd }) => {
    return ensureShellPane(session, cwd)
  })

  ipcMain.handle('skills:list', async (_event, cwd: string) => {
    const [user, project] = await Promise.all([
      listSkillsFromDir(homedir()),
      cwd ? listSkillsFromDir(cwd) : Promise.resolve([])
    ])
    return { user, project }
  })

  ipcMain.handle('git:add', async (_event, cwd: string) => gitAdd(cwd))
  ipcMain.handle('git:add-files', async (_event, { cwd, files }) => gitAddFiles(cwd, files))
  ipcMain.handle('git:commit', async (_event, { cwd, message }) => gitCommit(cwd, message))
  ipcMain.handle('git:push', async (_event, cwd: string) => gitPush(cwd))
  ipcMain.handle('git:diff', async (_event, { cwd, staged }) => gitDiff(cwd, staged))

  ipcMain.handle('window:set-always-on-top', (_event, value: boolean) => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.setAlwaysOnTop(value)
    return value
  })

  ipcMain.handle('window:get-always-on-top', () => {
    const win = BrowserWindow.getFocusedWindow()
    return win?.isAlwaysOnTop() ?? true
  })

  ipcMain.handle('window:set-opacity', (_event, value: number) => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.setOpacity(value)
    return value
  })

  ipcMain.handle('window:get-opacity', () => {
    const win = BrowserWindow.getFocusedWindow()
    return win?.getOpacity() ?? 1
  })

  let savedBounds: Electron.Rectangle | null = null
  let isCompact = false

  const toggleCompact = (): boolean => {
    const win = mainWindow
    if (!win) return isCompact
    if (!isCompact) {
      savedBounds = win.getBounds()
      const bounds = win.getBounds()
      win.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: 70 })
      isCompact = true
    } else if (savedBounds) {
      win.setBounds(savedBounds)
      savedBounds = null
      isCompact = false
    }
    win.webContents.send('compact-changed', isCompact)
    return isCompact
  }

  ipcMain.handle('window:toggle-compact', () => {
    return toggleCompact()
  })

  createWindow()

  const registerFocusShortcut = (key: string): boolean => {
    globalShortcut.unregisterAll()
    const accelerator = `CommandOrControl+Shift+${key.toUpperCase()}`
    return globalShortcut.register(accelerator, () => {
      if (!mainWindow) return
      if (mainWindow.isFocused()) {
        mainWindow.blur()
      } else {
        mainWindow.focus()
        mainWindow.webContents.send('focus-textarea')
        if (isCompact) toggleCompact()
      }
    })
  }

  ipcMain.handle('window:set-focus-shortcut', (_event, key: string) => {
    return registerFocusShortcut(key)
  })

  ipcMain.handle('window:get-focus-shortcut', () => {
    return true
  })

  registerFocusShortcut('h')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
