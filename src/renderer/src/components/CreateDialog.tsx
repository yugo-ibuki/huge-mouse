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
  const setPanes = usePaneStore((s) => s.setPanes)

  const closeDialog = (): void => {
    setCreateDialog(false)
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
    })
  }

  if (!createDialog) return null

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
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          closeDialog()
          e.preventDefault()
        }
      }}
    >
      <div className="pane-popup detail-popup" onClick={(e) => e.stopPropagation()}>
        <div className="pane-popup-header">
          <span className="pane-popup-title">New Session</span>
          <button className="pane-popup-close" onClick={closeDialog}>
            Esc
          </button>
        </div>
        <div className="create-session-form">
          <label className="setting-row">
            <span className="setting-label">Session</span>
            <select
              className="create-session-select"
              value={newSessionTarget}
              onChange={(e) => setNewSessionTarget(e.target.value)}
            >
              {tmuxSessions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="setting-row">
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
          </label>
          <button
            className="git-btn create-session-btn"
            disabled={!newSessionTarget}
            onClick={async () => {
              const r = await window.api.createSession(newSessionTarget, newSessionCommand)
              if (r.success) {
                setCreateDialog(false)
                useUiStore
                  .getState()
                  .flashStatus(`Created ${newSessionCommand} in ${newSessionTarget}`, true)
                const result = await window.api.listSessions()
                setPanes(result)
              } else {
                useUiStore.getState().flashStatus(r.error ?? 'Failed', false)
              }
              requestAnimationFrame(() => {
                document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
              })
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
