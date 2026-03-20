import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { listPanes, sendInput, capturePane, getPaneDetail, gitAdd, gitCommit, gitPush, listTmuxSessions, createSession, killPane, getPaneCwd } from './tmux'
import { listCommands } from './commands'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
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
    mainWindow.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.huge-mouse')

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

  ipcMain.handle('tmux:send-input', async (_event, { target, text, vimMode }) => {
    return sendInput(target, text, vimMode)
  })

  ipcMain.handle('tmux:capture-pane', async (_event, target: string) => {
    return capturePane(target)
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

  ipcMain.handle('tmux:create-session', async (_event, { sessionName, command }) => {
    return createSession(sessionName, command)
  })

  ipcMain.handle('tmux:kill-pane', async (_event, target: string) => {
    return killPane(target)
  })

  ipcMain.handle('commands:list', async (_event, target: string) => {
    const cwd = await getPaneCwd(target)
    return listCommands(cwd)
  })

  ipcMain.handle('git:add', async (_event, cwd: string) => gitAdd(cwd))
  ipcMain.handle('git:commit', async (_event, { cwd, message }) => gitCommit(cwd, message))
  ipcMain.handle('git:push', async (_event, cwd: string) => gitPush(cwd))

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
    const win = BrowserWindow.getAllWindows()[0]
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
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        if (isCompact) toggleCompact()
        win.show()
        win.focus()
        win.webContents.send('focus-textarea')
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
