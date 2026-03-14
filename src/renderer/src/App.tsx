import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

interface TmuxPane {
  target: string
  pid: string
  command: string
  title: string
}

function App(): React.JSX.Element {
  const [panes, setPanes] = useState<TmuxPane[]>([])
  const [selected, setSelected] = useState('')
  const [text, setText] = useState('')
  const [status, setStatus] = useState<{ message: string; ok: boolean } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const poll = async (): Promise<void> => {
      const result = await window.api.listSessions()
      setPanes(result)
      if (result.length > 0 && !selected) {
        setSelected(result[0].target)
      }
    }

    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [selected])

  const send = useCallback(async () => {
    if (!selected || !text.trim()) return

    const result = await window.api.sendInput(selected, text)
    if (result.success) {
      setText('')
      setStatus({ message: 'Sent!', ok: true })
    } else {
      setStatus({ message: result.error ?? 'Failed', ok: false })
    }
    setTimeout(() => setStatus(null), 2000)
  }, [selected, text])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && e.metaKey) {
        e.preventDefault()
        send()
      }
    },
    [send]
  )

  return (
    <div className="container">
      <select value={selected} onChange={(e) => setSelected(e.target.value)} className="select">
        {panes.length === 0 && <option value="">No sessions found</option>}
        {panes.map((p) => (
          <option key={p.target} value={p.target}>
            {p.target} ({p.command})
          </option>
        ))}
      </select>

      <textarea
        ref={textareaRef}
        className="textarea"
        rows={5}
        placeholder="Type input to send... (Cmd+Enter to send)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      <div className="footer">
        <button className="send-btn" onClick={send} disabled={!selected || !text.trim()}>
          Send
        </button>
        {status && <span className={status.ok ? 'status-ok' : 'status-err'}>{status.message}</span>}
      </div>
    </div>
  )
}

export default App
