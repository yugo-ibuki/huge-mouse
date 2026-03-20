import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { TmuxPane, PaneDetail } from './api'

function App(): React.JSX.Element {
  const [panes, setPanes] = useState<TmuxPane[]>([])
  const [selected, setSelected] = useState('')
  const [text, setText] = useState('')
  const [status, setStatus] = useState<{ message: string; ok: boolean } | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') ?? 'dark'
  })
  const [choiceModifier, setChoiceModifier] = useState<'ctrl' | 'cmd'>(() => {
    return (localStorage.getItem('choiceModifier') as 'ctrl' | 'cmd') ?? 'ctrl'
  })
  const [fontSize, setFontSize] = useState(() => {
    return Number(localStorage.getItem('fontSize') ?? '13')
  })
  const [sendKey, setSendKey] = useState<'enter' | 'cmd+enter'>(() => {
    return (localStorage.getItem('sendKey') as 'enter' | 'cmd+enter') ?? 'cmd+enter'
  })
  const [vimMode, setVimMode] = useState(() => {
    return localStorage.getItem('vimMode') === 'true'
  })
  const [paneContent, setPaneContent] = useState<string | null>(null)
  const [paneDetail, setPaneDetail] = useState<PaneDetail | null>(null)
  const [commitMsg, setCommitMsg] = useState('')
  const [gitResult, setGitResult] = useState<{ message: string; ok: boolean } | null>(null)
  const [gitPopup, setGitPopup] = useState<PaneDetail | null>(null)
  const detailContentRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const paneViewerRef = useRef<HTMLPreElement>(null)
  const [history, setHistory] = useState<string[]>([])
  const historyIndex = useRef(-1)
  const savedDraft = useRef('')

  useEffect(() => {
    const focusTextarea = (): void => {
      if (!paneContent && !paneDetail && !gitPopup) {
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('focus', focusTextarea)
    return () => window.removeEventListener('focus', focusTextarea)
  }, [paneContent, paneDetail, gitPopup])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`)
  }, [fontSize])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('choiceModifier', choiceModifier)
  }, [choiceModifier])

  useEffect(() => {
    const poll = async (): Promise<void> => {
      const result = await api.listSessions()
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

    const sent = text
    const result = await api.sendInput(selected, sent, vimMode)
    if (result.success) {
      setHistory((prev) => [...prev, sent])
      historyIndex.current = -1
      savedDraft.current = ''
      setText('')
      setStatus({ message: 'Sent!', ok: true })
    } else {
      setStatus({ message: result.error ?? 'Failed', ok: false })
    }
    setTimeout(() => setStatus(null), 2000)
  }, [selected, text, vimMode])

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent): void => {
      // Pane navigation: Cmd+ArrowUp/Down or Ctrl+H/L
      const isPrevPane =
        (e.metaKey && e.key === 'ArrowUp') || (e.ctrlKey && e.key === 'h' && !e.metaKey)
      const isNextPane =
        (e.metaKey && e.key === 'ArrowDown') || (e.ctrlKey && e.key === 'l' && !e.metaKey)
      // Cross-session navigation: Ctrl+Cmd+H/L
      const isPrevSession = e.ctrlKey && e.metaKey && e.key === 'h'
      const isNextSession = e.ctrlKey && e.metaKey && e.key === 'l'

      if (isPrevSession || isNextSession) {
        e.preventDefault()
        setPanes((prev) => {
          if (prev.length === 0) return prev
          const sessionNames: string[] = []
          const sessionFirstIdx: number[] = []
          for (let i = 0; i < prev.length; i++) {
            const sess = prev[i].target.split(':')[0]
            if (sessionNames[sessionNames.length - 1] !== sess) {
              sessionNames.push(sess)
              sessionFirstIdx.push(i)
            }
          }
          const currentSess = selected ? selected.split(':')[0] : ''
          const currentSessionIdx = sessionNames.indexOf(currentSess)
          let nextSessionIdx: number
          if (isPrevSession) {
            nextSessionIdx =
              currentSessionIdx > 0 ? currentSessionIdx - 1 : sessionNames.length - 1
          } else {
            nextSessionIdx =
              currentSessionIdx < sessionNames.length - 1 ? currentSessionIdx + 1 : 0
          }
          setSelected(prev[sessionFirstIdx[nextSessionIdx]].target)
          return prev
        })
      } else if (isPrevPane) {
        e.preventDefault()
        setPanes((prev) => {
          const idx = prev.findIndex((p) => p.target === selected)
          const next = idx > 0 ? idx - 1 : prev.length - 1
          setSelected(prev[next].target)
          return prev
        })
      } else if (isNextPane) {
        e.preventDefault()
        setPanes((prev) => {
          const idx = prev.findIndex((p) => p.target === selected)
          const next = idx < prev.length - 1 ? idx + 1 : 0
          setSelected(prev[next].target)
          return prev
        })
      }

      // Modifier+Number: send choice
      const modPressed = choiceModifier === 'cmd' ? e.metaKey : e.ctrlKey
      const digitMatch = e.code.match(/^Digit([1-9])$/)
      if (modPressed && digitMatch) {
        const digitStr = digitMatch[1]
        const pane = panes.find((p) => p.target === selected)
        if (pane && pane.choices.length > 0) {
          const choice = pane.choices.find((c) => c.number === digitStr)
          if (choice) {
            e.preventDefault()
            api.sendInput(pane.target, choice.number, vimMode).then((result) => {
              if (result.success) {
                setStatus({ message: `Sent ${choice.number} -> ${pane.target}`, ok: true })
              } else {
                setStatus({ message: result.error ?? 'Failed', ok: false })
              }
              setTimeout(() => setStatus(null), 2000)
            })
          }
        }
      }

      // Ctrl+P: preview pane content
      if (e.ctrlKey && e.key === 'p' && !e.metaKey) {
        e.preventDefault()
        if (selected) {
          api.capturePane(selected).then((content) => {
            setPaneContent(content)
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                paneViewerRef.current?.scrollTo(0, paneViewerRef.current.scrollHeight)
              })
            })
          })
        }
      }

      // Ctrl+D: detail popup
      if (e.ctrlKey && e.key === 'd' && !e.metaKey) {
        e.preventDefault()
        if (selected) {
          api.getPaneDetail(selected).then((detail) => {
            setPaneDetail(detail)
          })
        }
      }

      // Ctrl+G: git popup
      if (e.ctrlKey && e.key === 'g' && !e.metaKey) {
        e.preventDefault()
        if (selected) {
          api.getPaneDetail(selected).then((detail) => {
            if (detail?.gitBranch) {
              setGitPopup(detail)
            }
          })
        }
      }

      // Git popup shortcuts
      if (gitPopup && e.ctrlKey && !e.metaKey && (e.target as HTMLElement).tagName !== 'INPUT') {
        if (e.key === 'a') {
          e.preventDefault()
          api.gitAdd(gitPopup.cwd).then(async (r) => {
            setGitResult(
              r.success
                ? { message: 'Staged all', ok: true }
                : { message: r.error ?? 'Failed', ok: false }
            )
            const refreshed = await api.getPaneDetail(gitPopup.target)
            if (refreshed) setGitPopup(refreshed)
            setTimeout(() => setGitResult(null), 2000)
          })
        }
        if (e.key === 'p') {
          e.preventDefault()
          api.gitPush(gitPopup.cwd).then((r) => {
            setGitResult(
              r.success
                ? { message: 'Pushed', ok: true }
                : { message: r.error ?? 'Failed', ok: false }
            )
            setTimeout(() => setGitResult(null), 2000)
          })
        }
      }

      // Escape: close popups
      if (e.key === 'Escape') {
        if (paneContent !== null) {
          e.preventDefault()
          setPaneContent(null)
          requestAnimationFrame(() => textareaRef.current?.focus())
        } else if (paneDetail !== null) {
          e.preventDefault()
          setPaneDetail(null)
          requestAnimationFrame(() => textareaRef.current?.focus())
        } else if (gitPopup !== null) {
          e.preventDefault()
          setGitPopup(null)
          requestAnimationFrame(() => textareaRef.current?.focus())
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [selected, panes, choiceModifier, vimMode, paneContent, paneDetail, gitPopup])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.nativeEvent.isComposing) return
      if (e.key === 'Enter') {
        const isSend = sendKey === 'cmd+enter' ? e.metaKey : !e.metaKey && !e.shiftKey
        if (isSend) {
          e.preventDefault()
          send()
          return
        }
        if (sendKey === 'enter' && e.metaKey) {
          e.preventDefault()
          const ta = e.currentTarget as HTMLTextAreaElement
          const start = ta.selectionStart
          const end = ta.selectionEnd
          const val = ta.value
          setText(val.substring(0, start) + '\n' + val.substring(end))
          requestAnimationFrame(() => {
            ta.selectionStart = ta.selectionEnd = start + 1
          })
          return
        }
      }
      if (e.key === 'ArrowUp' && !e.metaKey && history.length > 0) {
        const ta = e.currentTarget as HTMLTextAreaElement
        const isAtTop = !ta.value.includes('\n') || ta.selectionStart === 0
        if (isAtTop) {
          e.preventDefault()
          if (historyIndex.current === -1) {
            savedDraft.current = text
            historyIndex.current = history.length - 1
          } else if (historyIndex.current > 0) {
            historyIndex.current -= 1
          }
          setText(history[historyIndex.current])
        }
      }
      if (e.key === 'ArrowDown' && !e.metaKey && historyIndex.current >= 0) {
        const ta = e.currentTarget as HTMLTextAreaElement
        const isAtBottom = !ta.value.includes('\n') || ta.selectionStart === ta.value.length
        if (isAtBottom) {
          e.preventDefault()
          if (historyIndex.current < history.length - 1) {
            historyIndex.current += 1
            setText(history[historyIndex.current])
          } else {
            historyIndex.current = -1
            setText(savedDraft.current)
          }
        }
      }
    },
    [send, sendKey, history, text]
  )

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
                    className={`tag ${selected === p.target ? 'tag-active' : ''} ${p.status !== 'idle' ? 'tag-dim' : ''} ${p.command === 'codex' ? 'tag-codex' : ''}`}
                    onClick={() => setSelected(p.target)}
                  >
                    <span className={`dot dot-${p.status}`} />
                    <span className={`cmd-badge cmd-badge-${p.command}`}>
                      {p.command === 'codex' ? 'CX' : 'CC'}
                    </span>
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
                            await api.sendInput(p.target, c.number, vimMode)
                            setStatus({ message: `Sent ${c.number} -> ${p.target}`, ok: true })
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
          {sidebarOpen ? '\u2715' : '\u2699'}
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
                        await api.sendInput(selectedPane.target, c.number, vimMode)
                        setStatus({
                          message: `Sent ${c.number} -> ${selectedPane.target}`,
                          ok: true
                        })
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
            placeholder={`Type input to send... (${sendKey === 'cmd+enter' ? 'Cmd+Enter' : 'Enter'} to send)`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <div className="footer">
            {status && (
              <span className={status.ok ? 'status-ok' : 'status-err'}>{status.message}</span>
            )}
            <button className="send-btn" onClick={send} disabled={!selected || !text.trim()}>
              Send
            </button>
          </div>
        </div>

        <div className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <div className="sidebar-title">Settings</div>
          <label className="setting-row">
            <span className="setting-label">Font Size</span>
            <input
              type="range"
              className="opacity-slider"
              min="10"
              max="20"
              step="1"
              value={fontSize}
              onChange={(e) => {
                const v = Number(e.target.value)
                setFontSize(v)
                localStorage.setItem('fontSize', String(v))
              }}
            />
          </label>
          <div
            className="setting-row"
            style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}
          >
            <span className="setting-label">Theme</span>
            <div className="theme-segment">
              <button
                className={`theme-btn ${theme === 'dark' ? 'theme-btn-active' : ''}`}
                onClick={() => setTheme('dark')}
              >
                Dark
              </button>
              <button
                className={`theme-btn ${theme === 'light' ? 'theme-btn-active' : ''}`}
                onClick={() => setTheme('light')}
              >
                Light
              </button>
            </div>
          </div>
          <div
            className="setting-row"
            style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}
          >
            <span className="setting-label">Choice Key</span>
            <div className="theme-segment">
              <button
                className={`theme-btn ${choiceModifier === 'ctrl' ? 'theme-btn-active' : ''}`}
                onClick={() => setChoiceModifier('ctrl')}
              >
                Ctrl
              </button>
              <button
                className={`theme-btn ${choiceModifier === 'cmd' ? 'theme-btn-active' : ''}`}
                onClick={() => setChoiceModifier('cmd')}
              >
                Cmd
              </button>
            </div>
          </div>
          <div
            className="setting-row"
            style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}
          >
            <span className="setting-label">Send Key</span>
            <div className="theme-segment">
              <button
                className={`theme-btn ${sendKey === 'cmd+enter' ? 'theme-btn-active' : ''}`}
                onClick={() => {
                  setSendKey('cmd+enter')
                  localStorage.setItem('sendKey', 'cmd+enter')
                }}
              >
                Cmd+Enter
              </button>
              <button
                className={`theme-btn ${sendKey === 'enter' ? 'theme-btn-active' : ''}`}
                onClick={() => {
                  setSendKey('enter')
                  localStorage.setItem('sendKey', 'enter')
                }}
              >
                Enter
              </button>
            </div>
          </div>
          <label className="setting-row">
            <span className="setting-label">Vim Mode</span>
            <button
              className={`toggle ${vimMode ? 'toggle-on' : ''}`}
              onClick={() => {
                const next = !vimMode
                setVimMode(next)
                localStorage.setItem('vimMode', String(next))
              }}
            >
              <span className="toggle-knob" />
            </button>
          </label>
          <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <span className="setting-label">Shortcuts</span>
            <div className="shortcut-list">
              <span className="shortcut-item">Ctrl+P Preview</span>
              <span className="shortcut-item">Ctrl+D Detail</span>
              <span className="shortcut-item">Ctrl+G Git</span>
            </div>
          </div>
        </div>
      </div>

      {paneContent !== null && (
        <div
          className="pane-overlay"
          tabIndex={-1}
          ref={(el) => el?.focus()}
          onClick={() => {
            setPaneContent(null)
            requestAnimationFrame(() => textareaRef.current?.focus())
          }}
          onKeyDown={(e) => {
            const el = paneViewerRef.current
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
                setPaneContent(null)
                requestAnimationFrame(() => textareaRef.current?.focus())
                break
              default:
                return
            }
            e.preventDefault()
          }}
        >
          <div className="pane-popup" onClick={(e) => e.stopPropagation()}>
            <div className="pane-popup-header">
              <span className="pane-popup-title">{selected}</span>
              <span className="pane-popup-hint">j/k d/u g/G q</span>
              <button
                className="pane-popup-close"
                onClick={() => {
                  setPaneContent(null)
                  requestAnimationFrame(() => textareaRef.current?.focus())
                }}
              >
                Esc
              </button>
            </div>
            <pre ref={paneViewerRef} className="pane-popup-content">
              {(() => {
                if (!paneContent) return null
                const lastIdx = paneContent.lastIndexOf('\n\u23FA')
                if (lastIdx === -1) return paneContent
                const before = paneContent.slice(0, lastIdx + 1)
                const after = paneContent.slice(lastIdx + 1)
                return (
                  <>
                    {before}
                    <span className="last-response">{after}</span>
                  </>
                )
              })()}
            </pre>
          </div>
        </div>
      )}

      {paneDetail !== null && (
        <div
          className="pane-overlay"
          tabIndex={-1}
          ref={(el) => {
            if (el && !el.dataset.focused) {
              el.focus()
              el.dataset.focused = 'true'
            }
          }}
          onClick={() => {
            setPaneDetail(null)
            requestAnimationFrame(() => textareaRef.current?.focus())
          }}
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
                setPaneDetail(null)
                requestAnimationFrame(() => textareaRef.current?.focus())
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
              <button
                className="pane-popup-close"
                onClick={() => {
                  setPaneDetail(null)
                  requestAnimationFrame(() => textareaRef.current?.focus())
                }}
              >
                Esc
              </button>
            </div>
            <div ref={detailContentRef} className="detail-grid">
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
            </div>
          </div>
        </div>
      )}

      {gitPopup !== null && (
        <div
          className="pane-overlay"
          tabIndex={-1}
          ref={(el) => {
            if (el && !el.dataset.focused) {
              el.focus()
              el.dataset.focused = 'true'
            }
          }}
          onClick={() => {
            setGitPopup(null)
            requestAnimationFrame(() => textareaRef.current?.focus())
          }}
          onKeyDown={(e) => {
            if ((e.target as HTMLElement).tagName === 'INPUT') return
            if (e.key === 'Escape' || e.key === 'q') {
              setGitPopup(null)
              requestAnimationFrame(() => textareaRef.current?.focus())
              e.preventDefault()
            }
          }}
        >
          <div className="pane-popup detail-popup" onClick={(e) => e.stopPropagation()}>
            <div className="pane-popup-header">
              <span className="pane-popup-title">Git — {gitPopup.gitBranch}</span>
              <span className="pane-popup-hint">^a add ^p push</span>
              <button
                className="pane-popup-close"
                onClick={() => {
                  setGitPopup(null)
                  requestAnimationFrame(() => textareaRef.current?.focus())
                }}
              >
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
                    const r = await api.gitAdd(gitPopup.cwd)
                    setGitResult(
                      r.success
                        ? { message: 'Staged all', ok: true }
                        : { message: r.error ?? 'Failed', ok: false }
                    )
                    const refreshed = await api.getPaneDetail(gitPopup.target)
                    if (refreshed) setGitPopup(refreshed)
                    setTimeout(() => setGitResult(null), 2000)
                  }}
                >
                  Add All
                </button>
                <button
                  className="git-btn git-btn-push"
                  onClick={async () => {
                    const r = await api.gitPush(gitPopup.cwd)
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
                      api.gitCommit(gitPopup.cwd, commitMsg.trim()).then(async (r) => {
                        setGitResult(
                          r.success
                            ? { message: 'Committed', ok: true }
                            : { message: r.error ?? 'Failed', ok: false }
                        )
                        if (r.success) setCommitMsg('')
                        const refreshed = await api.getPaneDetail(gitPopup.target)
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
                    const r = await api.gitCommit(gitPopup.cwd, commitMsg.trim())
                    setGitResult(
                      r.success
                        ? { message: 'Committed', ok: true }
                        : { message: r.error ?? 'Failed', ok: false }
                    )
                    if (r.success) setCommitMsg('')
                    const refreshed = await api.getPaneDetail(gitPopup.target)
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
      )}
    </div>
  )
}

export default App
