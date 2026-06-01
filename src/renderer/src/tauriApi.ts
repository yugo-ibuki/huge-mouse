type Unsubscribe = () => void

interface TauriEvent<T> {
  payload: T
}

interface DragDropPayload {
  type?: string
  paths?: string[]
}

const imagePathPattern = /\.(png|jpe?g|gif|webp|svg|bmp)$/i

const invoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  const tauriInvoke = window.__TAURI_INTERNALS__?.invoke
  if (!tauriInvoke) throw new Error('Tauri invoke is unavailable')
  return tauriInvoke<T>(cmd, args)
}

const listen = async <T>(event: string, callback: (payload: T) => void): Promise<Unsubscribe> => {
  const internals = window.__TAURI_INTERNALS__
  if (!internals?.invoke || !internals.transformCallback) {
    throw new Error('Tauri event listener is unavailable')
  }
  const tauriInvoke = internals.invoke
  const handler = internals.transformCallback((payload) => {
    callback((payload as TauriEvent<T>).payload)
  })
  const eventId = await tauriInvoke<number>('plugin:event|listen', {
    event,
    target: { kind: 'Any' },
    handler
  })
  return () => {
    void tauriInvoke('plugin:event|unlisten', { event, eventId })
    internals.unregisterCallback?.(handler)
  }
}

const subscribe = <T>(event: string, callback: (payload: T) => void): Unsubscribe => {
  let active = true
  let unsubscribe: Unsubscribe = () => {}
  listen(event, callback)
    .then((nextUnsubscribe) => {
      if (active) {
        unsubscribe = nextUnsubscribe
      } else {
        nextUnsubscribe()
      }
    })
    .catch(console.error)
  return () => {
    active = false
    unsubscribe()
  }
}

type DropNavigationEvent = {
  preventDefault: () => void
  stopPropagation: () => void
}

type DropNavigationDocument = {
  addEventListener: (
    event: 'dragover' | 'drop',
    callback: (event: DropNavigationEvent) => void
  ) => void
}

export function installDropNavigationGuard(documentRef: DropNavigationDocument): void {
  const preventNavigation = (event: DropNavigationEvent): void => {
    event.preventDefault()
    event.stopPropagation()
  }

  // Preserve the desktop bridge behavior: dropped files should attach via
  // the app flow, not navigate the webview away from unitmux.
  documentRef.addEventListener('dragover', preventNavigation)
  documentRef.addEventListener('drop', preventNavigation)
}

export function installTauriApi(): void {
  if (window.api) return
  if (typeof document !== 'undefined') installDropNavigationGuard(document)

  let compact = false
  const compactListeners = new Set<(value: boolean) => void>()

  window.api = {
    listSessions: () => invoke('list_sessions'),
    sendInput: (target, text, vimMode = false, images = []) =>
      invoke('send_input', { target, text, vimMode, images }),
    capturePane: (target) => invoke('capture_pane', { target }),
    getPaneDetail: (target) => invoke('get_pane_detail', { target }),
    getTokenUsage: (target) => invoke('get_token_usage', { target }),
    getTokenUsageSummary: (force = false) => invoke('get_token_usage_summary', { force }),
    listSkills: (cwd) => invoke('list_skills', { cwd }),
    listTmuxSessions: () => invoke('list_tmux_sessions'),
    createSession: (sessionName, command, cwd) =>
      invoke('create_session', { sessionName, command, cwd }),
    createNewSession: (sessionName, command, cwd) =>
      invoke('create_new_session', { sessionName, command, cwd }),
    killPane: (target) => invoke('kill_pane', { target }),
    findShellPane: (session) => invoke('find_shell_pane', { session }),
    ensureShellPane: (session, cwd) => invoke('ensure_shell_pane', { session, cwd }),
    gitAdd: (cwd) => invoke('git_add', { cwd }),
    gitAddFiles: (cwd, files) => invoke('git_add_files', { cwd, files }),
    gitCommit: (cwd, message) => invoke('git_commit', { cwd, message }),
    gitPush: (cwd) => invoke('git_push', { cwd }),
    gitDiff: (cwd, staged = false) => invoke('git_diff', { cwd, staged }),
    setAlwaysOnTop: (value) => invoke('set_always_on_top', { value }),
    getAlwaysOnTop: () => invoke('get_always_on_top'),
    setOpacity: (value) => invoke('set_opacity', { value }),
    getOpacity: () => invoke('get_opacity'),
    setFocusShortcut: (key) => invoke('set_focus_shortcut', { key }),
    toggleCompact: async () => {
      compact = await invoke('toggle_compact')
      compactListeners.forEach((listener) => listener(compact))
      return compact
    },
    onCompactChanged: (callback): Unsubscribe => {
      compactListeners.add(callback)
      const unsubscribe = subscribe<boolean>('compact-changed', (value) => {
        compact = value
        callback(value)
      })
      return () => {
        compactListeners.delete(callback)
        unsubscribe()
      }
    },
    onFocusTextarea: (callback): Unsubscribe => subscribe<void>('focus-textarea', callback),
    startStream: (target) => invoke('start_stream', { target }),
    stopStream: () => invoke('stop_stream'),
    onStreamData: (callback): Unsubscribe => subscribe<string>('tmux:stream-data', callback),
    selectImages: () => invoke('select_images'),
    onImageDropped: (callback): Unsubscribe =>
      subscribe<DragDropPayload>('tauri://drag-drop', (payload) => {
        const imagePaths = payload.paths?.filter((path) => imagePathPattern.test(path)) ?? []
        if ((payload.type === undefined || payload.type === 'drop') && imagePaths.length > 0) {
          callback(imagePaths)
        }
      })
  }
}
