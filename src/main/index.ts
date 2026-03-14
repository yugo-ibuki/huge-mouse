import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { listPanes, sendInput } from './tmux'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 700,
    height: 400,
    alwaysOnTop: true,
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

  ipcMain.handle('window:set-always-on-top', (_event, value: boolean) => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.setAlwaysOnTop(value)
    return value
  })

  ipcMain.handle('window:get-always-on-top', () => {
    const win = BrowserWindow.getFocusedWindow()
    return win?.isAlwaysOnTop() ?? true
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
