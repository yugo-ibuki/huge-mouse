import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../stores/uiStore'
import { COLLAPSE_THRESHOLD, getDiffSidebarItems } from '../utils/diffSidebar'
import { parseDiff } from '../utils/parseDiff'
import { DiffFileSection } from './DiffFileSection'

export function DiffOverlay(): React.JSX.Element | null {
  const diffContent = useUiStore((s) => s.diffContent)
  const diffStaged = useUiStore((s) => s.diffStaged)
  const diffCwd = useUiStore((s) => s.diffCwd)
  const setDiffContent = useUiStore((s) => s.setDiffContent)
  const setDiffStaged = useUiStore((s) => s.setDiffStaged)

  if (diffContent === null) return null

  return (
    <DiffOverlayContent
      key={`${diffStaged}:${diffContent}`}
      diffContent={diffContent}
      diffStaged={diffStaged}
      diffCwd={diffCwd}
      setDiffContent={setDiffContent}
      setDiffStaged={setDiffStaged}
    />
  )
}

function DiffOverlayContent({
  diffContent,
  diffStaged,
  diffCwd,
  setDiffContent,
  setDiffStaged
}: {
  diffContent: string
  diffStaged: boolean
  diffCwd: string
  setDiffContent: (value: string | null) => void
  setDiffStaged: (value: boolean) => void
}): React.JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null)

  const [openFiles, setOpenFiles] = useState<Record<number, boolean>>({})
  const [focusedFile, setFocusedFile] = useState(-1)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const hunkIndexRef = useRef(-1)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const files = diffContent && diffContent !== '(no changes)' ? parseDiff(diffContent) : []
  const sidebarItems = getDiffSidebarItems(files, openFiles)

  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
    }
  }, [])

  const isFileOpen = (i: number): boolean =>
    openFiles[i] ?? files[i].additions + files[i].deletions < COLLAPSE_THRESHOLD

  const toggleFile = (i: number): void => {
    setOpenFiles((prev) => ({ ...prev, [i]: !isFileOpen(i) }))
  }

  const scrollToFile = (index: number): void => {
    const el = contentRef.current?.querySelector(`[data-file-index="${index}"]`)
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const focusFile = (index: number): void => {
    setFocusedFile(index)
    scrollToFile(index)
  }

  const jumpToHunk = (direction: 'next' | 'prev'): void => {
    const hunks = contentRef.current?.querySelectorAll('[data-hunk-id]')
    if (!hunks || hunks.length === 0) return

    if (direction === 'next') {
      hunkIndexRef.current = Math.min(hunkIndexRef.current + 1, hunks.length - 1)
    } else {
      hunkIndexRef.current = Math.max(hunkIndexRef.current - 1, 0)
    }

    hunks[hunkIndexRef.current]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const closeDiff = (): void => {
    setDiffContent(null)
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
    })
  }

  const toggleStaged = async (): Promise<void> => {
    const next = !diffStaged
    setDiffStaged(next)
    const result = await window.api.gitDiff(diffCwd, next)
    setDiffContent(result || '(no changes)')
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
      onClick={closeDiff}
      onKeyDown={(e) => {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'BUTTON') return
        const el = contentRef.current
        if (!el) return

        // Handle two-key sequences (]c / [c)
        if (pendingKey) {
          const combo = pendingKey + e.key
          setPendingKey(null)
          if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
          if (combo === ']c') {
            jumpToHunk('next')
            e.preventDefault()
            return
          }
          if (combo === '[c') {
            jumpToHunk('prev')
            e.preventDefault()
            return
          }
          // Not a valid combo, fall through to normal handling
        }

        if (e.key === ']' || e.key === '[') {
          setPendingKey(e.key)
          if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
          pendingTimerRef.current = setTimeout(() => setPendingKey(null), 500)
          e.preventDefault()
          return
        }

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
          case 'n':
            if (files.length > 0) {
              const next = Math.min(focusedFile + 1, files.length - 1)
              focusFile(next)
            }
            break
          case 'N':
            if (files.length > 0) {
              const prev = Math.max(focusedFile - 1, 0)
              focusFile(prev)
            }
            break
          case 'Enter':
          case 'o':
            if (focusedFile >= 0 && focusedFile < files.length) {
              toggleFile(focusedFile)
            }
            break
          case 's':
            e.preventDefault()
            toggleStaged()
            break
          case 'Escape':
          case 'q':
            closeDiff()
            break
          default:
            return
        }
        e.preventDefault()
      }}
    >
      <div className="pane-popup" onClick={(e) => e.stopPropagation()}>
        <div className="pane-popup-header">
          <span className="pane-popup-title">
            Diff {diffStaged ? '(staged)' : '(unstaged)'}
            <span className="diff-file-count">{files.length} files</span>
          </span>
          <span className="pane-popup-hint">n/N file j/k d/u g/G ]c [c o s q</span>
          <button className="pane-popup-close" onClick={closeDiff}>
            Esc
          </button>
        </div>
        <div className="diff-layout">
          <aside className="diff-sidebar" aria-label="Changed files">
            {sidebarItems.length === 0 ? (
              <div className="diff-sidebar-empty">No files</div>
            ) : (
              sidebarItems.map((item) => (
                <button
                  key={item.index}
                  className={`diff-sidebar-row${item.index === focusedFile ? ' diff-sidebar-row-active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => focusFile(item.index)}
                >
                  <span className="diff-sidebar-status">{item.open ? '▾' : '▸'}</span>
                  <span className="diff-sidebar-path" title={item.path}>
                    {item.path}
                  </span>
                  <span className="diff-sidebar-stats">
                    {item.additions > 0 && <span className="diff-stat-add">+{item.additions}</span>}
                    {item.deletions > 0 && <span className="diff-stat-del">-{item.deletions}</span>}
                  </span>
                </button>
              ))
            )}
          </aside>
          <div ref={contentRef} className="pane-popup-content diff-content">
            {files.length === 0 ? (
              <div className="diff-empty">(no changes)</div>
            ) : (
              files.map((file, i) => (
                <DiffFileSection
                  key={i}
                  file={file}
                  open={isFileOpen(i)}
                  onToggle={() => toggleFile(i)}
                  focused={i === focusedFile}
                  fileIndex={i}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
