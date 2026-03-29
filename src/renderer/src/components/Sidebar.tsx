import { useState } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { useUiStore } from '../stores/uiStore'
import { useInputStore } from '../stores/inputStore'

export function Sidebar(): React.JSX.Element {
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)
  const setAlwaysOnTop = useSettingsStore((s) => s.setAlwaysOnTop)
  const opacity = useSettingsStore((s) => s.opacity)
  const setOpacity = useSettingsStore((s) => s.setOpacity)
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const choiceModifier = useSettingsStore((s) => s.choiceModifier)
  const setChoiceModifier = useSettingsStore((s) => s.setChoiceModifier)
  const sendKey = useSettingsStore((s) => s.sendKey)
  const setSendKey = useSettingsStore((s) => s.setSendKey)
  const vimMode = useSettingsStore((s) => s.vimMode)
  const setVimMode = useSettingsStore((s) => s.setVimMode)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const setFontSize = useSettingsStore((s) => s.setFontSize)
  const compactKey = useSettingsStore((s) => s.compactKey)
  const setCompactKey = useSettingsStore((s) => s.setCompactKey)
  const previewKey = useSettingsStore((s) => s.previewKey)
  const setPreviewKey = useSettingsStore((s) => s.setPreviewKey)
  const detailKey = useSettingsStore((s) => s.detailKey)
  const setDetailKey = useSettingsStore((s) => s.setDetailKey)
  const gitKey = useSettingsStore((s) => s.gitKey)
  const setGitKey = useSettingsStore((s) => s.setGitKey)
  const focusKey = useSettingsStore((s) => s.focusKey)
  const setFocusKey = useSettingsStore((s) => s.setFocusKey)

  const sidebarOpen = useUiStore((s) => s.sidebarOpen)

  const [editingCompactKey, setEditingCompactKey] = useState(false)
  const [editingPreviewKey, setEditingPreviewKey] = useState(false)
  const [editingDetailKey, setEditingDetailKey] = useState(false)
  const [editingGitKey, setEditingGitKey] = useState(false)
  const [editingFocusKey, setEditingFocusKey] = useState(false)
  const [slashManagerOpen, setSlashManagerOpen] = useState(false)
  const [editingSlash, setEditingSlash] = useState<{ name: string; body: string } | null>(null)
  const slashCommands = useInputStore((s) => s.slashCommands)
  const setSlashCommands = useInputStore((s) => s.setSlashCommands)
  const skillCommands = useInputStore((s) => s.skillCommands)

  const toggleAlwaysOnTop = async (): Promise<void> => {
    const next = !alwaysOnTop
    await window.api.setAlwaysOnTop(next)
    setAlwaysOnTop(next)
  }

  return (
    <div className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-title">Settings</div>
      <label className="setting-row">
        <span className="setting-label">Always on Top</span>
        <button className={`toggle ${alwaysOnTop ? 'toggle-on' : ''}`} onClick={toggleAlwaysOnTop}>
          <span className="toggle-knob" />
        </button>
      </label>
      <label className="setting-row">
        <span className="setting-label">Opacity</span>
        <input
          type="range"
          className="opacity-slider"
          min="0.5"
          max="1"
          step="0.05"
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
        />
      </label>
      <label className="setting-row">
        <span className="setting-label">Font Size</span>
        <input
          type="range"
          className="opacity-slider"
          min="8"
          max="18"
          step="1"
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
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
            onClick={() => setSendKey('cmd+enter')}
          >
            ⌘↵
          </button>
          <button
            className={`theme-btn ${sendKey === 'enter' ? 'theme-btn-active' : ''}`}
            onClick={() => setSendKey('enter')}
          >
            ↵
          </button>
        </div>
      </div>
      <label className="setting-row">
        <span className="setting-label">Vim Mode</span>
        <button
          className={`toggle ${vimMode ? 'toggle-on' : ''}`}
          onClick={() => setVimMode(!vimMode)}
        >
          <span className="toggle-knob" />
        </button>
      </label>
      <label className="setting-row">
        <span className="setting-label">Compact Key</span>
        {editingCompactKey ? (
          <span
            className="key-capture"
            tabIndex={0}
            onKeyDown={(e) => {
              e.preventDefault()
              if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
                setCompactKey(e.key.toLowerCase())
                setEditingCompactKey(false)
              }
              if (e.key === 'Escape') {
                setEditingCompactKey(false)
              }
            }}
            ref={(el) => el?.focus()}
          >
            Press a key...
          </span>
        ) : (
          <button className="key-display" onClick={() => setEditingCompactKey(true)}>
            Ctrl+{compactKey.toUpperCase()}
          </button>
        )}
      </label>
      <label className="setting-row">
        <span className="setting-label">Preview Key</span>
        {editingPreviewKey ? (
          <span
            className="key-capture"
            tabIndex={0}
            onKeyDown={(e) => {
              e.preventDefault()
              if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
                setPreviewKey(e.key.toLowerCase())
                setEditingPreviewKey(false)
              }
              if (e.key === 'Escape') {
                setEditingPreviewKey(false)
              }
            }}
            ref={(el) => el?.focus()}
          >
            Press a key...
          </span>
        ) : (
          <button className="key-display" onClick={() => setEditingPreviewKey(true)}>
            Ctrl+{previewKey.toUpperCase()}
          </button>
        )}
      </label>
      <label className="setting-row">
        <span className="setting-label">Detail Key</span>
        {editingDetailKey ? (
          <span
            className="key-capture"
            tabIndex={0}
            onKeyDown={(e) => {
              e.preventDefault()
              if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
                setDetailKey(e.key.toLowerCase())
                setEditingDetailKey(false)
              }
              if (e.key === 'Escape') {
                setEditingDetailKey(false)
              }
            }}
            ref={(el) => el?.focus()}
          >
            Press a key...
          </span>
        ) : (
          <button className="key-display" onClick={() => setEditingDetailKey(true)}>
            Ctrl+{detailKey.toUpperCase()}
          </button>
        )}
      </label>
      <label className="setting-row">
        <span className="setting-label">Git Key</span>
        {editingGitKey ? (
          <span
            className="key-capture"
            tabIndex={0}
            onKeyDown={(e) => {
              e.preventDefault()
              if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
                setGitKey(e.key.toLowerCase())
                setEditingGitKey(false)
              }
              if (e.key === 'Escape') {
                setEditingGitKey(false)
              }
            }}
            ref={(el) => el?.focus()}
          >
            Press a key...
          </span>
        ) : (
          <button className="key-display" onClick={() => setEditingGitKey(true)}>
            Ctrl+{gitKey.toUpperCase()}
          </button>
        )}
      </label>
      <label className="setting-row">
        <span className="setting-label">Focus Key</span>
        {editingFocusKey ? (
          <span
            className="key-capture"
            tabIndex={0}
            onKeyDown={(e) => {
              e.preventDefault()
              if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
                setFocusKey(e.key.toLowerCase())
                setEditingFocusKey(false)
              }
              if (e.key === 'Escape') {
                setEditingFocusKey(false)
              }
            }}
            ref={(el) => el?.focus()}
          >
            Press a key...
          </span>
        ) : (
          <button className="key-display" onClick={() => setEditingFocusKey(true)}>
            ⌘⇧{focusKey.toUpperCase()}
          </button>
        )}
      </label>

      <div className="sidebar-divider" />
      <div
        className="setting-row"
        style={{ cursor: 'pointer' }}
        onClick={() => setSlashManagerOpen(!slashManagerOpen)}
      >
        <span className="setting-label">Slash Commands</span>
        <span className="slash-toggle-arrow">{slashManagerOpen ? '▾' : '▸'}</span>
      </div>
      {slashManagerOpen && (
        <div className="slash-manager">
          {skillCommands.length > 0 && (
            <div className="slash-skill-section">
              <span className="slash-skill-label">Skills (read-only)</span>
              {skillCommands.map((cmd) => (
                <div key={`skill:${cmd.name}`} className="slash-entry slash-entry-skill">
                  <span className="slash-entry-name">/{cmd.name}</span>
                  <span className="slash-skill-source">
                    {cmd.source === 'skill-user' ? 'user' : 'project'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {slashCommands.map((cmd) => (
            <div key={cmd.name} className="slash-entry">
              {editingSlash?.name === cmd.name ? (
                <div className="slash-edit-form">
                  <input
                    className="slash-input"
                    value={editingSlash.name}
                    onChange={(e) => setEditingSlash({ ...editingSlash, name: e.target.value })}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="name"
                  />
                  <textarea
                    className="slash-body-input"
                    value={editingSlash.body}
                    onChange={(e) => setEditingSlash({ ...editingSlash, body: e.target.value })}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="body"
                    rows={2}
                  />
                  <div className="slash-edit-actions">
                    <button
                      className="slash-save-btn"
                      onClick={() => {
                        if (!editingSlash.name.trim() || !editingSlash.body.trim()) return
                        setSlashCommands(
                          slashCommands.map((c) =>
                            c.name === cmd.name
                              ? { name: editingSlash.name.trim(), body: editingSlash.body.trim() }
                              : c
                          )
                        )
                        setEditingSlash(null)
                      }}
                    >
                      Save
                    </button>
                    <button className="slash-cancel-btn" onClick={() => setEditingSlash(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="slash-entry-name">/{cmd.name}</span>
                  <div className="slash-entry-actions">
                    <button
                      className="slash-action-btn"
                      onClick={() => setEditingSlash({ ...cmd })}
                    >
                      Edit
                    </button>
                    <button
                      className="slash-action-btn slash-delete-btn"
                      onClick={() =>
                        setSlashCommands(slashCommands.filter((c) => c.name !== cmd.name))
                      }
                    >
                      Del
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
