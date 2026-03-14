import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { listPanes, sendInput, capturePane, getPaneDetail, gitAdd, gitCommit, gitPush } from './tmux'

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

  ipcMain.handle('tmux:send-input', async (_event, { target, text }) => {
    return sendInput(target, text)
  })

  ipcMain.handle('tmux:capture-pane', async (_event, target: string) => {
    return capturePane(target)
  })

  ipcMain.handle('tmux:pane-detail', async (_event, target: string) => {
    return getPaneDetail(target)
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

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
