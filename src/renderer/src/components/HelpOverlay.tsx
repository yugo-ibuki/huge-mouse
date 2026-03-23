import { useSettingsStore } from '../stores/settingsStore'
import { useUiStore } from '../stores/uiStore'

export function HelpOverlay(): React.JSX.Element | null {
  const helpOpen = useUiStore((s) => s.helpOpen)
  const setHelpOpen = useUiStore((s) => s.setHelpOpen)
  const { compactKey, previewKey, detailKey, gitKey, focusKey, sendKey, choiceModifier, stopKey } =
    useSettingsStore.getState()

  const close = (): void => {
    setHelpOpen(false)
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
    })
  }

  if (!helpOpen) return null

  const mod = choiceModifier === 'cmd' ? 'Cmd' : 'Ctrl'

  const sections: { title: string; shortcuts: [string, string][] }[] = [
    {
      title: 'Navigation',
      shortcuts: [
        ['Ctrl+H / Cmd+↑', 'Previous pane'],
        ['Ctrl+L / Cmd+↓', 'Next pane'],
        ['Ctrl+Cmd+H', 'Previous session'],
        ['Ctrl+Cmd+L', 'Next session']
      ]
    },
    {
      title: 'Input',
      shortcuts: [
        [sendKey === 'cmd+enter' ? 'Cmd+Enter' : 'Enter', 'Send input'],
        [sendKey === 'cmd+enter' ? 'Enter' : 'Shift+Enter', 'New line'],
        ['↑ / ↓', 'History navigation'],
        ['/ + type', 'Slash command filter']
      ]
    },
    {
      title: 'Panels',
      shortcuts: [
        [`Ctrl+${previewKey.toUpperCase()}`, 'Preview (press twice for live)'],
        [`Ctrl+${detailKey.toUpperCase()}`, 'Session detail'],
        [`Ctrl+${gitKey.toUpperCase()}`, 'Git operations'],
        ['Ctrl+N', 'New session'],
        ['Ctrl+,', 'This help']
      ]
    },
    {
      title: 'Actions',
      shortcuts: [
        [`${mod}+1-9`, 'Send choice to pane'],
        [`Ctrl+${stopKey.toUpperCase()}`, 'Stop running session'],
        [`Ctrl+${compactKey.toUpperCase()}`, 'Toggle compact mode'],
        [`Cmd+Shift+${focusKey.toUpperCase()}`, 'Focus from any app']
      ]
    },
    {
      title: 'In Preview',
      shortcuts: [
        ['j / k', 'Scroll line'],
        ['d / u', 'Scroll half page'],
        ['g / G', 'Top / bottom']
      ]
    },
    {
      title: 'In Git Panel',
      shortcuts: [
        ['Ctrl+A', 'Stage all'],
        ['Ctrl+P', 'Push']
      ]
    },
    {
      title: 'General',
      shortcuts: [
        ['Escape', 'Close current panel'],
        ['q', 'Close panel (in overlays)']
      ]
    }
  ]

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
      onClick={close}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'q') {
          e.preventDefault()
          close()
          return
        }
        const el = e.currentTarget.querySelector<HTMLElement>('.help-content')
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
          default:
            return
        }
        e.preventDefault()
      }}
    >
      <div className="pane-popup help-popup" onClick={(e) => e.stopPropagation()}>
        <div className="pane-popup-header">
          <span className="pane-popup-title">Keyboard Shortcuts</span>
          <button className="pane-popup-close" onClick={close}>
            Esc
          </button>
        </div>
        <div className="help-content">
          {sections.map((section) => (
            <div key={section.title} className="help-section">
              <div className="help-section-title">{section.title}</div>
              {section.shortcuts.map(([key, desc]) => (
                <div key={key} className="help-row">
                  <kbd className="help-key">{key}</kbd>
                  <span className="help-desc">{desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
