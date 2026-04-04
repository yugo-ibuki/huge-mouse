import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../stores/uiStore'
import { usePaneStore } from '../stores/paneStore'

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

  const [highlightIndex, setHighlightIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

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

  const closeDialog = (): void => {
    setCreateDialog(false)
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
    })
  }

  const handleCreate = async (): Promise<void> => {
    const target = tmuxSessions[highlightIndex] ?? newSessionTarget
    if (!target) return
    const r = await window.api.createSession(target, newSessionCommand, paneDetail?.cwd)
    if (r.success) {
      setCreateDialog(false)
      useUiStore
        .getState()
        .flashStatus(`Created ${newSessionCommand} in ${target}`, true)
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
    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault()
        setHighlightIndex((i) => {
          const next = Math.min(i + 1, tmuxSessions.length - 1)
          setNewSessionTarget(tmuxSessions[next])
          return next
        })
        break
      case 'k':
      case 'ArrowUp':
        e.preventDefault()
        setHighlightIndex((i) => {
          const next = Math.max(i - 1, 0)
          setNewSessionTarget(tmuxSessions[next])
          return next
        })
        break
      case 'h':
        e.preventDefault()
        setNewSessionCommand('claude')
        break
      case 'l':
        e.preventDefault()
        setNewSessionCommand('codex')
        break
      case 'Enter':
        e.preventDefault()
        handleCreate()
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
          <span className="create-dialog-hint">j/k: select · h/l: cmd · Enter: create</span>
          <button className="pane-popup-close" onClick={closeDialog}>
            Esc
          </button>
        </div>
        <div className="create-session-form">
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
            disabled={!tmuxSessions[highlightIndex]}
            onClick={handleCreate}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
