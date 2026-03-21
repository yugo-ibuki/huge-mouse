import { useState } from 'react'
import { useUiStore } from '../stores/uiStore'

export function GitOverlay(): React.JSX.Element | null {
  const gitPopup = useUiStore((s) => s.gitPopup)
  const setGitPopup = useUiStore((s) => s.setGitPopup)
  const gitResult = useUiStore((s) => s.gitResult)
  const setGitResult = useUiStore((s) => s.setGitResult)
  const [commitMsg, setCommitMsg] = useState('')

  const closePopup = (): void => {
    setGitPopup(null)
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
    })
  }

  if (gitPopup === null) return null

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
      onClick={closePopup}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return
        if (e.key === 'Escape' || e.key === 'q') {
          closePopup()
          e.preventDefault()
        }
      }}
    >
      <div className="pane-popup detail-popup" onClick={(e) => e.stopPropagation()}>
        <div className="pane-popup-header">
          <span className="pane-popup-title">Git — {gitPopup.gitBranch}</span>
          <span className="pane-popup-hint">^a add ^p push</span>
          <button className="pane-popup-close" onClick={closePopup}>
            Esc
          </button>
        </div>
        {gitPopup.gitStatus && (
          <pre className="detail-value detail-git-status" style={{ margin: '8px 12px' }}>
            {gitPopup.gitStatus}
          </pre>
        )}
        <div className="git-actions">
          <div className="git-actions-row">
            <button
              className="git-btn"
              onClick={async () => {
                const r = await window.api.gitAdd(gitPopup.cwd)
                setGitResult(
                  r.success
                    ? { message: 'Staged all', ok: true }
                    : { message: r.error ?? 'Failed', ok: false }
                )
                const refreshed = await window.api.getPaneDetail(gitPopup.target)
                if (refreshed) setGitPopup(refreshed)
                setTimeout(() => setGitResult(null), 2000)
              }}
            >
              Add All
            </button>
            <button
              className="git-btn git-btn-push"
              onClick={async () => {
                const r = await window.api.gitPush(gitPopup.cwd)
                setGitResult(
                  r.success
                    ? { message: 'Pushed', ok: true }
                    : { message: r.error ?? 'Failed', ok: false }
                )
                setTimeout(() => setGitResult(null), 2000)
              }}
            >
              Push
            </button>
          </div>
          <div className="git-commit-row">
            <input
              className="git-commit-input"
              placeholder="Commit message..."
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter' && commitMsg.trim()) {
                  window.api.gitCommit(gitPopup.cwd, commitMsg.trim()).then(async (r) => {
                    setGitResult(
                      r.success
                        ? { message: 'Committed', ok: true }
                        : { message: r.error ?? 'Failed', ok: false }
                    )
                    if (r.success) setCommitMsg('')
                    const refreshed = await window.api.getPaneDetail(gitPopup.target)
                    if (refreshed) setGitPopup(refreshed)
                    setTimeout(() => setGitResult(null), 2000)
                  })
                }
              }}
            />
            <button
              className="git-btn"
              disabled={!commitMsg.trim()}
              onClick={async () => {
                const r = await window.api.gitCommit(gitPopup.cwd, commitMsg.trim())
                setGitResult(
                  r.success
                    ? { message: 'Committed', ok: true }
                    : { message: r.error ?? 'Failed', ok: false }
                )
                if (r.success) setCommitMsg('')
                const refreshed = await window.api.getPaneDetail(gitPopup.target)
                if (refreshed) setGitPopup(refreshed)
                setTimeout(() => setGitResult(null), 2000)
              }}
            >
              Commit
            </button>
          </div>
          {gitResult && (
            <span className={gitResult.ok ? 'git-result-ok' : 'git-result-err'}>
              {gitResult.message}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
