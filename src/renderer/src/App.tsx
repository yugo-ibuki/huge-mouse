import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

interface TmuxChoice {
  number: string
  label: string
}

interface TmuxPane {
  target: string
  pid: string
  command: string
  title: string
  status: 'idle' | 'busy' | 'waiting'
  choices: TmuxChoice[]
  prompt: string
}

function App(): React.JSX.Element {
  const [panes, setPanes] = useState<TmuxPane[]>([])
  const [selected, setSelected] = useState('')
  const [text, setText] = useState('')
  const [status, setStatus] = useState<{ message: string; ok: boolean } | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    window.api.getAlwaysOnTop().then(setAlwaysOnTop)
  }, [])

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

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey && e.key === 'ArrowUp') {
        e.preventDefault()
        setPanes((prev) => {
          const idx = prev.findIndex((p) => p.target === selected)
          if (idx > 0) setSelected(prev[idx - 1].target)
          return prev
        })
      } else if (e.metaKey && e.key === 'ArrowDown') {
        e.preventDefault()
        setPanes((prev) => {
          const idx = prev.findIndex((p) => p.target === selected)
          if (idx < prev.length - 1) setSelected(prev[idx + 1].target)
          return prev
        })
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [selected])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && e.metaKey) {
        e.preventDefault()
        send()
      }
    },
    [send]
  )

  const toggleAlwaysOnTop = async (): Promise<void> => {
    const next = !alwaysOnTop
    await window.api.setAlwaysOnTop(next)
    setAlwaysOnTop(next)
  }

  const selectedPane = panes.find((p) => p.target === selected)

  return (
    <div className="layout">
      <div className="header">
        <div className="tags">
          {panes.length === 0 && <span className="no-sessions">No sessions found</span>}
          {Object.entries(
            panes.reduce<Record<string, TmuxPane[]>>((groups, p) => {
              const session = p.target.split(':')[0]
              ;(groups[session] ??= []).push(p)
              return groups
            }, {})
          ).map(([session, group]) => (
            <div key={session} className="session-group">
              <span className="session-label">{session}</span>
              {group.map((p) => (
                <div key={p.target} className="tag-row">
                  <button
                    className={`tag ${selected === p.target ? 'tag-active' : ''} ${p.status !== 'idle' ? 'tag-dim' : ''}`}
                    onClick={() => setSelected(p.target)}
                  >
                    <span className={`dot dot-${p.status}`} />
                    {p.target.split(':')[1]}
                  </button>
                  {p.choices.length > 0 && (
                    <div className="inline-choices">
                      {p.choices.map((c) => (
                        <button
                          key={c.number}
                          className="choice-num"
                          title={c.label}
                          onClick={async () => {
                            await window.api.sendInput(p.target, c.number)
                            setStatus({ message: `Sent ${c.number} → ${p.target}`, ok: true })
                            setTimeout(() => setStatus(null), 2000)
                          }}
                        >
                          {c.number}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <button className="gear-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? '✕' : '⚙'}
        </button>
      </div>

      <div className="main-area">
        <div className="content">
          {selectedPane?.prompt && (
            <div className="prompt-box">
              <pre className="prompt-text">{selectedPane.prompt}</pre>
              {selectedPane.choices.length > 0 && (
                <div className="prompt-choices">
                  {selectedPane.choices.map((c) => (
                    <button
                      key={c.number}
                      className="prompt-choice-btn"
                      onClick={async () => {
                        await window.api.sendInput(selectedPane.target, c.number)
                        setStatus({ message: `Sent ${c.number} → ${selectedPane.target}`, ok: true })
                        setTimeout(() => setStatus(null), 2000)
                      }}
                    >
                      {c.number}. {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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
            {status && (
              <span className={status.ok ? 'status-ok' : 'status-err'}>{status.message}</span>
            )}
          </div>
        </div>

        <div className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
            <div className="sidebar-title">Settings</div>
            <label className="setting-row">
              <span className="setting-label">Always on Top</span>
              <button
                className={`toggle ${alwaysOnTop ? 'toggle-on' : ''}`}
                onClick={toggleAlwaysOnTop}
              >
                <span className="toggle-knob" />
              </button>
            </label>
        </div>
      </div>
    </div>
  )
}

export default App
