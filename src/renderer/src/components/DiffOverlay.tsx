import { useRef } from 'react'
import { useUiStore } from '../stores/uiStore'

function renderDiffLines(diff: string): React.JSX.Element[] {
  const elements: React.JSX.Element[] = []
  const lines = diff.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let className = ''
    if (line.startsWith('+++') || line.startsWith('---')) {
      className = 'diff-meta'
    } else if (line.startsWith('@@')) {
      className = 'diff-hunk'
    } else if (line.startsWith('+')) {
      className = 'diff-add'
    } else if (line.startsWith('-')) {
      className = 'diff-del'
    } else if (line.startsWith('diff ')) {
      className = 'diff-header'
    } else if (
      line.startsWith('index ') ||
      line.startsWith('new file') ||
      line.startsWith('deleted file')
    ) {
      className = 'diff-meta'
    }
    elements.push(
      <span key={i} className={className}>
        {line}
        {i < lines.length - 1 ? '\n' : ''}
      </span>
    )
  }
  return elements
}

export function DiffOverlay(): React.JSX.Element | null {
  const diffContent = useUiStore((s) => s.diffContent)
  const diffStaged = useUiStore((s) => s.diffStaged)
  const diffCwd = useUiStore((s) => s.diffCwd)
  const setDiffContent = useUiStore((s) => s.setDiffContent)
  const setDiffStaged = useUiStore((s) => s.setDiffStaged)
  const contentRef = useRef<HTMLPreElement>(null)

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

  if (diffContent === null) return null

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
        if ((e.target as HTMLElement).tagName === 'INPUT') return
        const el = contentRef.current
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
          <span className="pane-popup-title">Diff {diffStaged ? '(staged)' : '(unstaged)'}</span>
          <span className="pane-popup-hint">s toggle j/k d/u g/G q</span>
          <button className="pane-popup-close" onClick={closeDiff}>
            Esc
          </button>
        </div>
        <pre ref={contentRef} className="pane-popup-content diff-content">
          {renderDiffLines(diffContent)}
        </pre>
      </div>
    </div>
  )
}
