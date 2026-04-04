import { useEffect, useRef } from 'react'
import './App.css'

import { usePaneStore } from './stores/paneStore'
import { useSettingsStore } from './stores/settingsStore'
import { useUiStore } from './stores/uiStore'

import { PaneHeader } from './components/PaneHeader'
import { InputArea } from './components/InputArea'
import { Sidebar } from './components/Sidebar'
import { PreviewOverlay } from './components/PreviewOverlay'
import { DetailOverlay } from './components/DetailOverlay'
import { GitOverlay } from './components/GitOverlay'
import { DiffOverlay } from './components/DiffOverlay'
import { HelpOverlay } from './components/HelpOverlay'
import { CreateDialog } from './components/CreateDialog'
import { ConfirmDialog } from './components/ConfirmDialog'

import { usePolling } from './hooks/usePolling'
import { useStreaming } from './hooks/useStreaming'
import { useGlobalKeyboard } from './hooks/useGlobalKeyboard'

import type { TmuxChoice } from './types'

const EMPTY_CHOICES: TmuxChoice[] = []

function App(): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const compact = useUiStore((s) => s.compact)
  const paneContent = useUiStore((s) => s.paneContent)
  const paneDetail = useUiStore((s) => s.paneDetail)
  const gitPopup = useUiStore((s) => s.gitPopup)
  const diffContent = useUiStore((s) => s.diffContent)
  const createDialog = useUiStore((s) => s.createDialog)
  const confirmKill = useUiStore((s) => s.confirmKill)
  const lastPrompts = usePaneStore((s) => s.lastPrompts)
  const selected = usePaneStore((s) => s.selected)
  const selectedPrompt = usePaneStore((s) => s.panes.find((p) => p.target === s.selected)?.prompt)
  const selectedChoices = usePaneStore(
    (s) => s.panes.find((p) => p.target === s.selected)?.choices ?? EMPTY_CHOICES
  )

  // Boot: read initial window state
  useEffect(() => {
    window.api.getAlwaysOnTop().then(useSettingsStore.getState().setAlwaysOnTop)
    window.api.setOpacity(useSettingsStore.getState().opacity)
    window.api.setFocusShortcut(useSettingsStore.getState().focusKey)
  }, [])

  // Window focus → focus textarea
  useEffect(() => {
    const focusTextarea = (): void => {
      if (!paneContent && !paneDetail && !gitPopup) {
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('focus', focusTextarea)
    return () => window.removeEventListener('focus', focusTextarea)
  }, [paneContent, paneDetail, gitPopup])

  // IPC listeners
  useEffect(() => {
    return window.api.onCompactChanged((value) => {
      useUiStore.getState().setCompact(value)
      if (!value) requestAnimationFrame(() => textareaRef.current?.focus())
    })
  }, [])

  useEffect(() => {
    return window.api.onFocusTextarea(() => {
      requestAnimationFrame(() => textareaRef.current?.focus())
    })
  }, [])

  // Hooks
  usePolling()
  const streamRefs = useStreaming()
  useGlobalKeyboard(textareaRef, streamRefs)

  return (
    <div className="layout">
      <PaneHeader />

      {!compact && (
        <div className="main-area">
          <div className="content">
            {lastPrompts[selected] && (
              <div className="last-prompt-bar">{lastPrompts[selected]}</div>
            )}
            {selectedPrompt && (
              <div className="prompt-box">
                <pre className="prompt-text">{selectedPrompt}</pre>
                {selectedChoices.length > 0 && (
                  <div className="prompt-choices">
                    {selectedChoices.map((c) => (
                      <button
                        key={c.number}
                        className="prompt-choice-btn"
                        onClick={async () => {
                          const sel = usePaneStore.getState().selected
                          const vm = useSettingsStore.getState().vimMode
                          await window.api.sendInput(sel, c.number, vm)
                          useUiStore.getState().flashStatus(`Sent ${c.number} → ${sel}`, true)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && !e.shiftKey) {
                            const next = e.currentTarget
                              .nextElementSibling as HTMLButtonElement | null
                            if (!next) {
                              e.preventDefault()
                              document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
                            }
                          }
                        }}
                      >
                        {c.number}. {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <InputArea textareaRef={textareaRef} />
          </div>
          <Sidebar />
        </div>
      )}

      {paneContent !== null && <PreviewOverlay streamRefs={streamRefs} />}
      {paneDetail !== null && <DetailOverlay />}
      {gitPopup !== null && <GitOverlay />}
      {diffContent !== null && <DiffOverlay />}
      {createDialog && <CreateDialog />}
      {confirmKill && paneDetail && <ConfirmDialog />}
      <HelpOverlay />
    </div>
  )
}

export default App
