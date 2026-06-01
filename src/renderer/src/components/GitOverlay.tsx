import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useUiStore } from '../stores/uiStore'

interface GitFile {
  status: string
  path: string
  staged: boolean
}

function parseGitStatus(raw: string): GitFile[] {
  if (!raw) return []
  // git status --short format: "XY path" where XY is 2 status chars + space + path
  // Leading space may be trimmed, so match flexibly.
  const LINE_RE = /^(.)(.) (.+)$/
  return raw
    .split('\n')
    .filter((l) => l.trim())
    .flatMap((line) => {
      const m = line.match(LINE_RE)
      if (!m) return []
      const x = m[1] // index (staged) status
      const y = m[2] // worktree status
      const path = m[3]
      const staged = x !== ' ' && x !== '?'
      const status = staged ? x : y === '?' ? '??' : y
      return [{ status, path, staged }]
    })
}

function statusColor(status: string): string {
  switch (status) {
    case 'M':
      return 'var(--yellow, #e5a700)'
    case 'A':
      return 'var(--green)'
    case 'D':
      return 'var(--red)'
    case 'R':
      return 'var(--accent)'
    case '??':
      return 'var(--text-dim)'
    default:
      return 'var(--text)'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'M':
      return 'modified'
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case '??':
      return 'untracked'
    default:
      return status
  }
}

export function GitOverlay(): React.JSX.Element | null {
  const gitPopup = useUiStore((s) => s.gitPopup)
  const setGitPopup = useUiStore((s) => s.setGitPopup)
  const gitResult = useUiStore((s) => s.gitResult)
  const setGitResult = useUiStore((s) => s.setGitResult)
  const [commitMsg, setCommitMsg] = useState('')
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const files = useMemo(() => (gitPopup ? parseGitStatus(gitPopup.gitStatus) : []), [gitPopup])
  const selectedSize = selected.size
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to keep cursor visible
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const row = list.children[cursor] as HTMLElement | undefined
    if (row) row.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const closePopup = useCallback((): void => {
    setGitPopup(null)
    setSelected(new Set())
    setCursor(0)
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
    })
  }, [setGitPopup])

  const flashResult = useCallback(
    (message: string, ok: boolean) => {
      setGitResult({ message, ok })
      setTimeout(() => setGitResult(null), 2000)
    },
    [setGitResult]
  )

  const refresh = useCallback(async () => {
    if (!gitPopup) return
    const refreshed = await window.api.getPaneDetail(gitPopup.target)
    if (refreshed) setGitPopup(refreshed)
  }, [gitPopup, setGitPopup])

  const addAll = useCallback(async () => {
    if (!gitPopup) return
    const r = await window.api.gitAdd(gitPopup.cwd)
    flashResult(r.success ? 'Staged all' : r.error ?? 'Failed', r.success)
    await refresh()
    setSelected(new Set())
  }, [gitPopup, flashResult, refresh])

  const addSelected = useCallback(async () => {
    if (!gitPopup || selectedSize === 0) return
    const r = await window.api.gitAddFiles(gitPopup.cwd, Array.from(selected))
    flashResult(
      r.success ? `Staged ${selectedSize} file${selectedSize > 1 ? 's' : ''}` : r.error ?? 'Failed',
      r.success
    )
    await refresh()
    setSelected(new Set())
  }, [gitPopup, selected, selectedSize, flashResult, refresh])

  const toggleFile = useCallback(
    (path: string) => {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        return next
      })
    },
    []
  )

  const toggleAll = useCallback(() => {
    if (selectedSize === files.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(files.map((f) => f.path)))
    }
  }, [selectedSize, files])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      switch (e.key) {
        case 'Escape':
        case 'q':
          closePopup()
          e.preventDefault()
          break
        case 'j':
          setCursor((c) => Math.min(c + 1, files.length - 1))
          e.preventDefault()
          break
        case 'k':
          setCursor((c) => Math.max(c - 1, 0))
          e.preventDefault()
          break
        case ' ':
          if (files[cursor]) toggleFile(files[cursor].path)
          e.preventDefault()
          break
        case 'a':
          if (e.ctrlKey) {
            addAll()
          } else {
            toggleAll()
          }
          e.preventDefault()
          break
        case 'g':
          setCursor(0)
          e.preventDefault()
          break
        case 'G':
          setCursor(files.length - 1)
          e.preventDefault()
          break
        case 'Enter':
          if (selectedSize > 0) addSelected()
          e.preventDefault()
          break
        case 'p':
          if (e.ctrlKey && gitPopup) {
            window.api.gitPush(gitPopup.cwd).then((r) => {
              flashResult(r.success ? 'Pushed' : r.error ?? 'Failed', r.success)
            })
            e.preventDefault()
          }
          break
      }
    },
    [
      cursor,
      files,
      selectedSize,
      closePopup,
      toggleFile,
      toggleAll,
      addAll,
      addSelected,
      gitPopup,
      flashResult
    ]
  )

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
      onKeyDown={handleKeyDown}
    >
      <div className="pane-popup detail-popup" onClick={(e) => e.stopPropagation()}>
        <div className="pane-popup-header">
          <span className="pane-popup-title">Git — {gitPopup.gitBranch}</span>
          <span className="pane-popup-hint">j/k move · space select · a all · enter stage</span>
          <button className="pane-popup-close" onClick={closePopup}>
            Esc
          </button>
        </div>

        {files.length > 0 ? (
          <div className="git-file-list" ref={listRef}>
            {files.map((f, i) => (
              <div
                key={f.path}
                className={`git-file-row${i === cursor ? ' git-file-active' : ''}${selected.has(f.path) ? ' git-file-selected' : ''}`}
                onClick={() => toggleFile(f.path)}
              >
                <span className="git-file-check">{selected.has(f.path) ? '●' : '○'}</span>
                <span className="git-file-status" style={{ color: statusColor(f.status) }}>
                  {f.status.padEnd(2)}
                </span>
                <span className="git-file-path">{f.path}</span>
                <span className="git-file-label" style={{ color: statusColor(f.status) }}>
                  {statusLabel(f.status)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="git-empty">Nothing to commit, working tree clean</div>
        )}

        <div className="git-actions">
          <div className="git-actions-row">
            <button className="git-btn" onClick={addAll}>
              Add All
            </button>
            <button
              className="git-btn git-btn-stage"
              disabled={selected.size === 0}
              onClick={addSelected}
            >
              Add Selected ({selected.size})
            </button>
            <button
              className="git-btn git-btn-push"
              onClick={async () => {
                const r = await window.api.gitPush(gitPopup.cwd)
                flashResult(r.success ? 'Pushed' : r.error ?? 'Failed', r.success)
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
                    flashResult(r.success ? 'Committed' : r.error ?? 'Failed', r.success)
                    if (r.success) setCommitMsg('')
                    await refresh()
                  })
                }
                if (e.key === 'Escape') {
                  ;(e.target as HTMLElement).blur()
                }
              }}
            />
            <button
              className="git-btn"
              disabled={!commitMsg.trim()}
              onClick={async () => {
                const r = await window.api.gitCommit(gitPopup.cwd, commitMsg.trim())
                flashResult(r.success ? 'Committed' : r.error ?? 'Failed', r.success)
                if (r.success) setCommitMsg('')
                await refresh()
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
