import { useState } from 'react'
import type { DiffFile } from '../utils/parseDiff'

const COLLAPSE_THRESHOLD = 50

export function DiffFileSection({ file }: { file: DiffFile }): React.JSX.Element {
  const totalChanged = file.additions + file.deletions
  const [open, setOpen] = useState(totalChanged < COLLAPSE_THRESHOLD)

  return (
    <div className="diff-file-section">
      <button className="diff-file-header" onClick={() => setOpen(!open)}>
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
                return (
                  <tr key={i} className="diff-line diff-line-hunk">
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
