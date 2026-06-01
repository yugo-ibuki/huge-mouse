import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { installDropNavigationGuard, installTauriApi } from '../src/renderer/src/tauriApi'

interface TestWindow {
  api?: TmuxAPI
  __TAURI_INTERNALS__?: {
    invoke?: ReturnType<typeof vi.fn>
    transformCallback?: ReturnType<typeof vi.fn>
    unregisterCallback?: ReturnType<typeof vi.fn>
  }
}

const testWindow = (): TestWindow => globalThis.window as unknown as TestWindow
const root = process.cwd()
let callbacks: Record<number, (event: unknown) => void>

function rustCommandNames(): string[] {
  const commandsRs = readFileSync(join(root, 'src-tauri/src/commands.rs'), 'utf8')
  const commandList = commandsRs.match(/const COMMAND_NAMES: &\[&str\] = &\[(?<body>[\s\S]*?)\];/)
    ?.groups?.body

  if (!commandList) throw new Error('COMMAND_NAMES was not found')

  return Array.from(commandList.matchAll(/"([^"]+)"/g), (match) => match[1])
}

async function exerciseInvokerApi(api: TmuxAPI): Promise<void> {
  await api.listSessions()
  await api.listSkills('/repo')
  await api.listTmuxSessions()
  await api.createSession('alpha', 'claude', '/repo')
  await api.createNewSession('beta', 'codex', '/repo')
  await api.killPane('alpha:1.0')
  await api.findShellPane('alpha')
  await api.ensureShellPane('alpha', '/repo')
  await api.sendInput('alpha:1.0', 'hello', true, ['/tmp/a.png'])
  await api.capturePane('alpha:1.0')
  await api.getPaneDetail('alpha:1.0')
  await api.getTokenUsage('alpha:1.0')
  await api.getTokenUsageSummary(true)
  await api.gitAdd('/repo')
  await api.gitAddFiles('/repo', ['a.ts'])
  await api.gitCommit('/repo', 'msg')
  await api.gitPush('/repo')
  await api.gitDiff('/repo', true)
  await api.setAlwaysOnTop(false)
  await api.getAlwaysOnTop()
  await api.setOpacity(0.75)
  await api.getOpacity()
  await api.setFocusShortcut('h')
  await api.toggleCompact()
  await api.startStream('alpha:1.0')
  await api.stopStream()
  await api.selectImages()
}

describe('Tauri API bridge', () => {
  beforeEach(() => {
    let callbackId = 0
    callbacks = {}
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        __TAURI_INTERNALS__: {
          invoke: vi.fn(async (cmd: string) => {
            if (cmd === 'plugin:event|listen') return 42
            return true
          }),
          transformCallback: vi.fn((callback: (event: unknown) => void) => {
            const id = ++callbackId
            callbacks[id] = callback
            return id
          }),
          unregisterCallback: vi.fn()
        }
      }
    })
  })

  it('installs every renderer API method on window.api', () => {
    installTauriApi()

    expect(Object.keys(testWindow().api ?? {}).sort()).toEqual(
      [
        'capturePane',
        'createNewSession',
        'createSession',
        'ensureShellPane',
        'findShellPane',
        'getAlwaysOnTop',
        'getOpacity',
        'getPaneDetail',
        'getTokenUsage',
        'getTokenUsageSummary',
        'gitAdd',
        'gitAddFiles',
        'gitCommit',
        'gitDiff',
        'gitPush',
        'killPane',
        'listSessions',
        'listSkills',
        'listTmuxSessions',
        'onCompactChanged',
        'onFocusTextarea',
        'onImageDropped',
        'onStreamData',
        'selectImages',
        'sendInput',
        'setAlwaysOnTop',
        'setFocusShortcut',
        'setOpacity',
        'startStream',
        'stopStream',
        'toggleCompact'
      ].sort()
    )
  })

  it('maps commands to the Rust Tauri command names', async () => {
    installTauriApi()
    const api = testWindow().api!
    const invoke = testWindow().__TAURI_INTERNALS__!.invoke!

    await api.sendInput('s:1.0', 'hello', true, ['/tmp/a.png'])
    await api.setAlwaysOnTop(false)
    await api.setOpacity(0.75)
    await api.setFocusShortcut('h')
    await api.startStream('s:1.0')
    await api.stopStream()
    await api.selectImages()

    expect(invoke).toHaveBeenCalledWith('send_input', {
      target: 's:1.0',
      text: 'hello',
      vimMode: true,
      images: ['/tmp/a.png']
    })
    expect(invoke).toHaveBeenCalledWith('set_always_on_top', { value: false })
    expect(invoke).toHaveBeenCalledWith('set_opacity', { value: 0.75 })
    expect(invoke).toHaveBeenCalledWith('set_focus_shortcut', { key: 'h' })
    expect(invoke).toHaveBeenCalledWith('start_stream', { target: 's:1.0' })
    expect(invoke).toHaveBeenCalledWith('stop_stream', undefined)
    expect(invoke).toHaveBeenCalledWith('select_images', undefined)
  })

  it('keeps every invoker-backed renderer method wired to a registered Rust command', async () => {
    installTauriApi()
    const api = testWindow().api!
    const invoke = testWindow().__TAURI_INTERNALS__!.invoke!

    await exerciseInvokerApi(api)

    const invokedCommands = invoke.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => !String(cmd).startsWith('plugin:event|'))
    const registeredCommands = rustCommandNames()
    const rustOnlyCommands = registeredCommands.filter((cmd) => !invokedCommands.includes(cmd))

    expect(invokedCommands).toEqual([
      'list_sessions',
      'list_skills',
      'list_tmux_sessions',
      'create_session',
      'create_new_session',
      'kill_pane',
      'find_shell_pane',
      'ensure_shell_pane',
      'send_input',
      'capture_pane',
      'get_pane_detail',
      'get_token_usage',
      'get_token_usage_summary',
      'git_add',
      'git_add_files',
      'git_commit',
      'git_push',
      'git_diff',
      'set_always_on_top',
      'get_always_on_top',
      'set_opacity',
      'get_opacity',
      'set_focus_shortcut',
      'toggle_compact',
      'start_stream',
      'stop_stream',
      'select_images'
    ])
    expect(invokedCommands.every((cmd) => registeredCommands.includes(cmd))).toBe(true)
    expect(rustOnlyCommands).toEqual(['focus_textarea'])
  })

  it('registers Tauri event listeners for push-style renderer callbacks', () => {
    installTauriApi()
    const api = testWindow().api!
    const invoke = testWindow().__TAURI_INTERNALS__!.invoke!
    const unsubscribeStream = api.onStreamData(() => {})
    const unsubscribeFocus = api.onFocusTextarea(() => {})
    const unsubscribeDrop = api.onImageDropped(() => {})

    expect(invoke).toHaveBeenCalledWith('plugin:event|listen', {
      event: 'tmux:stream-data',
      target: { kind: 'Any' },
      handler: 1
    })
    expect(invoke).toHaveBeenCalledWith('plugin:event|listen', {
      event: 'focus-textarea',
      target: { kind: 'Any' },
      handler: 2
    })
    expect(invoke).toHaveBeenCalledWith('plugin:event|listen', {
      event: 'tauri://drag-drop',
      target: { kind: 'Any' },
      handler: 3
    })

    unsubscribeStream()
    unsubscribeFocus()
    unsubscribeDrop()
  })

  it('filters dropped files to image paths before notifying renderer code', () => {
    installTauriApi()
    const api = testWindow().api!
    const onDrop = vi.fn()
    api.onImageDropped(onDrop)

    callbacks[1]({
      payload: {
        type: 'drop',
        paths: ['/tmp/image.png', '/tmp/readme.txt', '/tmp/photo.JPG', '/tmp/archive.zip']
      }
    })

    expect(onDrop).toHaveBeenCalledWith(['/tmp/image.png', '/tmp/photo.JPG'])
  })

  it('accepts raw Tauri drop payloads without a duplicate type field', () => {
    installTauriApi()
    const api = testWindow().api!
    const onDrop = vi.fn()
    api.onImageDropped(onDrop)

    callbacks[1]({
      payload: {
        paths: ['/tmp/screenshot.webp', '/tmp/notes.md']
      }
    })

    expect(onDrop).toHaveBeenCalledWith(['/tmp/screenshot.webp'])
  })

  it('prevents browser navigation for drag and drop events like the legacy bridge did', () => {
    const listeners: Record<string, (event: { preventDefault: () => void; stopPropagation: () => void }) => void> = {}
    const documentLike = {
      addEventListener: vi.fn((event: string, callback: (event: { preventDefault: () => void; stopPropagation: () => void }) => void) => {
        listeners[event] = callback
      })
    }
    const dragEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    }
    const dropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    }

    installDropNavigationGuard(documentLike)
    listeners.dragover(dragEvent)
    listeners.drop(dropEvent)

    expect(documentLike.addEventListener).toHaveBeenCalledWith('dragover', expect.any(Function))
    expect(documentLike.addEventListener).toHaveBeenCalledWith('drop', expect.any(Function))
    expect(dragEvent.preventDefault).toHaveBeenCalled()
    expect(dragEvent.stopPropagation).toHaveBeenCalled()
    expect(dropEvent.preventDefault).toHaveBeenCalled()
    expect(dropEvent.stopPropagation).toHaveBeenCalled()
  })
})
