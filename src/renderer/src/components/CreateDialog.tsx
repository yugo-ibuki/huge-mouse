import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../stores/uiStore'
import { usePaneStore } from '../stores/paneStore'

type Mode = 'new' | 'existing'

export function CreateDialog(): React.JSX.Element | null {
  const createDialog = useUiStore((s) => s.createDialog)
  const setCreateDialog = useUiStore((s) => s.setCreateDialog)
  const tmuxSessions = useUiStore((s) => s.tmuxSessions)
  const newSessionTarget = useUiStore((s) => s.newSessionTarget)
  const setNewSessionTarget = useUiStore((s) => s.setNewSessionTarget)
  const newSessionCommand = useUiStore((s) => s.newSessionCommand)
  const setNewSessionCommand = useUiStore((s) => s.setNewSessionCommand)
  const paneDetail = useUiStore((s) => s.paneDetail)
  const setPanes = usePaneStore((s) => s.setPanes)

  const [mode, setMode] = useState<Mode>('new')
  const [sessionName, setSessionName] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync highlightIndex when dialog opens or sessions change
  useEffect(() => {
    if (!createDialog) return
    const idx = tmuxSessions.indexOf(newSessionTarget)
    setHighlightIndex(idx >= 0 ? idx : 0)
  }, [createDialog, tmuxSessions, newSessionTarget])

  // Auto-scroll highlighted item into view
  useEffect(() => {
    const item = listRef.current?.children[highlightIndex] as HTMLLIElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  // Focus input when mode switches to 'new'
  useEffect(() => {
    if (mode === 'new') {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [mode])

  const closeDialog = (): void => {
    setCreateDialog(false)
    setSessionName('')
    setMode('new')
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
    })
  }

  const handleCreateNew = async (): Promise<void> => {
    const name = sessionName.trim()
    if (!name) return
    const r = await window.api.createNewSession(name, newSessionCommand, paneDetail?.cwd)
    if (r.success) {
      setCreateDialog(false)
      setSessionName('')
      useUiStore.getState().flashStatus(`Created session "${name}" with ${newSessionCommand}`, true)
      const result = await window.api.listSessions()
      setPanes(result)
    } else {
      useUiStore.getState().flashStatus(r.error ?? 'Failed', false)
    }
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
    })
  }

  const handleAddToExisting = async (): Promise<void> => {
    const target = tmuxSessions[highlightIndex] ?? newSessionTarget
    if (!target) return
    const r = await window.api.createSession(target, newSessionCommand, paneDetail?.cwd)
    if (r.success) {
      setCreateDialog(false)
      useUiStore.getState().flashStatus(`Added ${newSessionCommand} to ${target}`, true)
      const result = await window.api.listSessions()
      setPanes(result)
    } else {
      useUiStore.getState().flashStatus(r.error ?? 'Failed', false)
    }
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
    })
  }

  if (!createDialog) return null

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.nativeEvent.isComposing) return
    if ((e.target as HTMLElement).tagName === 'INPUT') return

    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault()
        if (mode === 'existing') {
          setHighlightIndex((i) => {
            const next = Math.min(i + 1, tmuxSessions.length - 1)
            setNewSessionTarget(tmuxSessions[next])
            return next
          })
        }
        break
      case 'k':
      case 'ArrowUp':
        e.preventDefault()
        if (mode === 'existing') {
          setHighlightIndex((i) => {
            const next = Math.max(i - 1, 0)
            setNewSessionTarget(tmuxSessions[next])
            return next
          })
        }
        break
      case 'h':
        e.preventDefault()
        setNewSessionCommand('claude')
        break
      case 'l':
        e.preventDefault()
        setNewSessionCommand('codex')
        break
      case 'Tab':
        e.preventDefault()
        setMode((m) => (m === 'new' ? 'existing' : 'new'))
        break
      case 'Enter':
        e.preventDefault()
        if (mode === 'new') handleCreateNew()
        else handleAddToExisting()
        break
      case 'Escape':
        e.preventDefault()
        closeDialog()
        break
    }
  }

  return (
    <div
      className="pane-overlay"
      tabIndex={-1}
      ref={(el) => {
        if (el && !el.dataset.focused) {
          el.focus()
          el.dataset.focused = 'true'
        }
      }}
      onClick={closeDialog}
      onKeyDown={handleKeyDown}
    >
      <div className="pane-popup detail-popup" onClick={(e) => e.stopPropagation()}>
        <div className="pane-popup-header">
          <span className="pane-popup-title">New Session</span>
          <span className="create-dialog-hint">Tab: switch · h/l: cmd · Enter: create</span>
          <button className="pane-popup-close" onClick={closeDialog}>
            Esc
          </button>
        </div>
        <div className="create-session-form">
          {/* Mode tabs */}
          <div className="create-mode-tabs">
            <button
              className={`create-mode-tab ${mode === 'new' ? 'create-mode-tab-active' : ''}`}
              onClick={() => setMode('new')}
            >
              New Session
            </button>
            <button
              className={`create-mode-tab ${mode === 'existing' ? 'create-mode-tab-active' : ''}`}
              onClick={() => setMode('existing')}
            >
              Add to Existing
            </button>
          </div>

          {mode === 'new' ? (
            <div className="setting-row">
              <span className="setting-label">Name</span>
              <input
                ref={inputRef}
                className="git-commit-input"
                placeholder="Session name..."
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.nativeEvent.isComposing) return
                  if (e.key === 'Enter' && sessionName.trim()) {
                    e.preventDefault()
                    handleCreateNew()
                  }
                  if (e.key === 'Escape') {
                    closeDialog()
                  }
                }}
              />
            </div>
          ) : (
            <div className="setting-row">
              <span className="setting-label">Session</span>
              <ul className="create-session-list" ref={listRef}>
                {tmuxSessions.map((s, i) => (
                  <li
                    key={s}
                    className={`create-session-item ${i === highlightIndex ? 'create-session-item-active' : ''}`}
                    onClick={() => {
                      setHighlightIndex(i)
                      setNewSessionTarget(s)
                    }}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="setting-row">
            <span className="setting-label">Command</span>
            <div className="theme-segment">
              <button
                className={`theme-btn ${newSessionCommand === 'claude' ? 'theme-btn-active' : ''}`}
                onClick={() => setNewSessionCommand('claude')}
              >
                claude
              </button>
              <button
                className={`theme-btn ${newSessionCommand === 'codex' ? 'theme-btn-active' : ''}`}
                onClick={() => setNewSessionCommand('codex')}
              >
                codex
              </button>
            </div>
          </div>
          <button
            className="git-btn create-session-btn"
            disabled={mode === 'new' ? !sessionName.trim() : !tmuxSessions[highlightIndex]}
            onClick={mode === 'new' ? handleCreateNew : handleAddToExisting}
          >
            {mode === 'new' ? 'Create' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
