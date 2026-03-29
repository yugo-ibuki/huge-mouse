import { memo, useMemo } from 'react'
import type { TmuxPane } from '../types'
import { usePaneStore } from '../stores/paneStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useUiStore } from '../stores/uiStore'

export const PaneHeader = memo(function PaneHeader(): React.JSX.Element {
  const panes = usePaneStore((s) => s.panes)
  const selected = usePaneStore((s) => s.selected)
  const setSelected = usePaneStore((s) => s.setSelected)
  const vimMode = useSettingsStore((s) => s.vimMode)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)
  const shellMode = useUiStore((s) => s.shellMode)

  const groups = useMemo(
    () =>
      panes.reduce<Record<string, TmuxPane[]>>((acc, p) => {
        const session = p.target.split(':')[0]
        ;(acc[session] ??= []).push(p)
        return acc
      }, {}),
    [panes]
  )

  return (
    <div className="header">
      <div className="tags">
        {panes.length === 0 && <span className="no-sessions">No sessions found</span>}
        {Object.entries(groups).map(([session, group]) => (
          <div key={session} className="session-group">
            <span className="session-label">{session}</span>
            {group.map((p) => (
              <div key={p.target} className="tag-row">
                <button
                  className={`tag ${selected === p.target ? 'tag-active' : ''} ${p.status !== 'idle' ? 'tag-dim' : ''} ${p.command === 'codex' ? 'tag-codex' : ''}`}
                  onClick={() => setSelected(p.target)}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && !e.shiftKey && p.choices.length > 0) {
                      e.preventDefault()
                      const row = e.currentTarget.closest('.tag-row')
                      const firstChoice = row?.querySelector<HTMLButtonElement>('.choice-num')
                      firstChoice?.focus()
                    }
                  }}
                >
                  <span className={`dot dot-${p.status}`} />
                  <span className={`cmd-badge cmd-badge-${p.command}`}>
                    {p.command === 'codex' ? 'CX' : 'CC'}
                  </span>
                  {p.target.split(':')[1]}
                  {shellMode && <span className="shell-mode-badge">SHELL</span>}
                </button>
                {selected === p.target && p.status === 'busy' && (
                  <button
                    className="stop-btn"
                    title="Stop session"
                    onClick={async (e) => {
                      e.stopPropagation()
                      const result = await window.api.stopSession(p.target)
                      if (result.success) {
                        useUiStore.getState().flashStatus(`Stopped → ${p.target}`, true)
                      } else {
                        useUiStore.getState().flashStatus(result.error ?? 'Failed to stop', false)
                      }
                    }}
                  >
                    ■
                  </button>
                )}
                {p.choices.length > 0 && (
                  <div className="inline-choices">
                    {p.choices.map((c) => (
                      <button
                        key={c.number}
                        className="choice-num"
                        tabIndex={-1}
                        title={c.label}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && !e.shiftKey) {
                            e.preventDefault()
                            const next = e.currentTarget
                              .nextElementSibling as HTMLButtonElement | null
                            if (next) {
                              next.focus()
                            } else {
                              const ta = document.querySelector<HTMLTextAreaElement>('.textarea')
                              ta?.focus()
                            }
                          }
                          if (e.key === 'Tab' && e.shiftKey) {
                            e.preventDefault()
                            const prev = e.currentTarget
                              .previousElementSibling as HTMLButtonElement | null
                            if (prev) {
                              prev.focus()
                            } else {
                              const tag = e.currentTarget
                                .closest('.tag-row')
                                ?.querySelector<HTMLButtonElement>('.tag')
                              tag?.focus()
                            }
                          }
                        }}
                        onClick={async () => {
                          await window.api.sendInput(p.target, c.number, vimMode)
                          useUiStore.getState().flashStatus(`Sent ${c.number} → ${p.target}`, true)
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
  )
})
