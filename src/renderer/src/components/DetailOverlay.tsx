import { useRef } from 'react'
import { useUiStore } from '../stores/uiStore'

export function DetailOverlay(): React.JSX.Element | null {
  const paneDetail = useUiStore((s) => s.paneDetail)
  const setPaneDetail = useUiStore((s) => s.setPaneDetail)
  const setConfirmKill = useUiStore((s) => s.setConfirmKill)

  const detailContentRef = useRef<HTMLDivElement>(null)

  const closeDetail = (): void => {
    setPaneDetail(null)
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
    })
  }

  if (paneDetail === null) return null

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
      onClick={closeDetail}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return
        const el = detailContentRef.current
        if (!el) return
        const line = 16
        const half = el.clientHeight / 2
        switch (e.key) {
          case 'j':
            el.scrollBy(0, line)
            break
          case 'k':
            el.scrollBy(0, -line)
            break
          case 'd':
            el.scrollBy(0, half)
            break
          case 'u':
            el.scrollBy(0, -half)
            break
          case 'g':
            el.scrollTo(0, 0)
            break
          case 'G':
            el.scrollTo(0, el.scrollHeight)
            break
          case 'Escape':
          case 'q':
            closeDetail()
            break
          default:
            return
        }
        e.preventDefault()
      }}
    >
      <div className="pane-popup detail-popup" onClick={(e) => e.stopPropagation()}>
        <div className="pane-popup-header">
          <span className="pane-popup-title">Session Detail</span>
          <span className="pane-popup-hint">j/k d/u g/G q</span>
          <button className="pane-popup-close" onClick={closeDetail}>
            Esc
          </button>
        </div>
        <div ref={detailContentRef} className="detail-grid">
          <div className="detail-actions">
            <button className="git-btn detail-kill-btn" onClick={() => setConfirmKill(true)}>
              Close Session
            </button>
          </div>
          <span className="detail-label">Target</span>
          <span className="detail-value">{paneDetail.target}</span>
          <span className="detail-label">Command</span>
          <span className="detail-value">{paneDetail.command}</span>
          {paneDetail.model && (
            <>
              <span className="detail-label">Model</span>
              <span className="detail-value detail-model">{paneDetail.model}</span>
            </>
          )}
          {paneDetail.sessionId && (
            <>
              <span className="detail-label">Session</span>
              <span className="detail-value detail-session">{paneDetail.sessionId}</span>
            </>
          )}
          <span className="detail-label">PID</span>
          <span className="detail-value">{paneDetail.pid}</span>
          <span className="detail-label">Title</span>
          <span className="detail-value">{paneDetail.title}</span>
          <span className="detail-label">CWD</span>
          <span className="detail-value">{paneDetail.cwd}</span>
          {paneDetail.gitBranch && (
            <>
              <span className="detail-label">Branch</span>
              <span className="detail-value detail-branch">{paneDetail.gitBranch}</span>
            </>
          )}
          {paneDetail.gitStatus && (
            <>
              <span className="detail-label">Git Status</span>
              <pre className="detail-value detail-git-status">{paneDetail.gitStatus}</pre>
            </>
          )}
          <div className="detail-actions">
            <button className="git-btn detail-kill-btn" onClick={() => setConfirmKill(true)}>
              Close Session
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
