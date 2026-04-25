import type { DiffFile } from '../utils/parseDiff'

export function DiffFileSection({
  file,
  open,
  onToggle,
  focused,
  fileIndex
}: {
  file: DiffFile
  open: boolean
  onToggle: () => void
  focused: boolean
  fileIndex: number
}): React.JSX.Element {
  let hunkCounter = 0

  return (
    <div
      className={'diff-file-section' + (focused ? ' diff-file-focused' : '')}
      data-file-index={fileIndex}
    >
      <button
        className="diff-file-header"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
      >
        <span className="diff-file-chevron">{open ? '▼' : '▶'}</span>
        <span className="diff-file-path">{file.path}</span>
        <span className="diff-file-stats">
          {file.additions > 0 && <span className="diff-stat-add">+{file.additions}</span>}
          {file.deletions > 0 && <span className="diff-stat-del">-{file.deletions}</span>}
        </span>
      </button>
      {open && (
        <table className="diff-line-table">
          <tbody>
            {file.lines.map((line, i) => {
              if (line.type === 'hunk') {
                const hunkId = `${fileIndex}-${hunkCounter++}`
                return (
                  <tr key={i} className="diff-line diff-line-hunk" data-hunk-id={hunkId}>
                    <td className="diff-ln" />
                    <td className="diff-ln" />
                    <td className="diff-line-content">{line.content}</td>
                  </tr>
                )
              }
              const rowClass = `diff-line diff-line-${line.type}`
              return (
                <tr key={i} className={rowClass}>
                  <td className="diff-ln">{line.oldNum ?? ''}</td>
                  <td className="diff-ln">{line.newNum ?? ''}</td>
                  <td className="diff-line-content">{line.content}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
