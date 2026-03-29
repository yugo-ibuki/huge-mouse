import { useUiStore } from '../stores/uiStore'
import { usePaneStore } from '../stores/paneStore'

export function ConfirmDialog(): React.JSX.Element | null {
  const confirmKill = useUiStore((s) => s.confirmKill)
  const setConfirmKill = useUiStore((s) => s.setConfirmKill)
  const paneDetail = useUiStore((s) => s.paneDetail)
  const setPaneDetail = useUiStore((s) => s.setPaneDetail)
  const selected = usePaneStore((s) => s.selected)
  const setSelected = usePaneStore((s) => s.setSelected)
  const setPanes = usePaneStore((s) => s.setPanes)

  if (!confirmKill || !paneDetail) return null

  const doKill = async (): Promise<void> => {
    const session = paneDetail.target.split(':')[0]
    const r = await window.api.killPane(paneDetail.target)
    setConfirmKill(false)
    setPaneDetail(null)
    if (r.success) {
      useUiStore.getState().flashStatus(`Closed ${paneDetail.target}`, true)
      if (selected === paneDetail.target) setSelected('')
      const result = await window.api.listSessions()
      setPanes(result)
      if (result.length > 0 && !result.find((p) => p.target === selected)) {
        setSelected(result[0].target)
      }
      // Clean up shell pane if no claude/codex panes remain in this session
      const sessionHasPanes = result.some((p) => p.target.startsWith(session + ':'))
      if (!sessionHasPanes) {
        window.api.findShellPane(session).then((shellTarget) => {
          if (shellTarget) window.api.killPane(shellTarget)
        })
      }
    } else {
      useUiStore.getState().flashStatus(r.error ?? 'Failed', false)
    }
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
    })
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
      onClick={() => setConfirmKill(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setConfirmKill(false)
          e.preventDefault()
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          doKill()
        }
      }}
    >
      <div className="pane-popup detail-popup confirm-popup" onClick={(e) => e.stopPropagation()}>
        <div className="pane-popup-header">
          <span className="pane-popup-title">Confirm Close</span>
        </div>
        <div className="confirm-body">
          <p>
            Close session <strong>{paneDetail.target}</strong> ({paneDetail.command})?
          </p>
          <div className="confirm-actions">
            <button className="git-btn" onClick={() => setConfirmKill(false)}>
              Cancel <span className="shortcut-hint">Esc</span>
            </button>
            <button className="git-btn detail-kill-btn" onClick={doKill}>
              Close <span className="shortcut-hint">Enter</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
