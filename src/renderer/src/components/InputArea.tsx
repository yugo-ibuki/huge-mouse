import { useCallback, useMemo } from 'react'
import type { SlashCommand, SkillCommand } from '../types'
import { useInputStore } from '../stores/inputStore'
import { useSettingsStore } from '../stores/settingsStore'
import { usePaneStore } from '../stores/paneStore'
import { useUiStore } from '../stores/uiStore'

interface InputAreaProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}

export function InputArea({ textareaRef }: InputAreaProps): React.JSX.Element {
  const text = useInputStore((s) => s.text)
  const setText = useInputStore((s) => s.setText)
  const slashFilter = useInputStore((s) => s.slashFilter)
  const setSlashFilter = useInputStore((s) => s.setSlashFilter)
  const slashIndex = useInputStore((s) => s.slashIndex)
  const setSlashIndex = useInputStore((s) => s.setSlashIndex)
  const slashCommands = useInputStore((s) => s.slashCommands)
  const skillCommands = useInputStore((s) => s.skillCommands)
  const sendKey = useSettingsStore((s) => s.sendKey)
  const vimMode = useSettingsStore((s) => s.vimMode)
  const selected = usePaneStore((s) => s.selected)
  const status = useUiStore((s) => s.status)

  const allCommands = useMemo<(SlashCommand | SkillCommand)[]>(
    () => [
      ...slashCommands,
      ...skillCommands.filter((sk) => !slashCommands.some((uc) => uc.name === sk.name))
    ],
    [slashCommands, skillCommands]
  )

  const filteredSlash = useMemo(
    () =>
      slashFilter !== null
        ? allCommands.filter((c) => c.name.toLowerCase().startsWith(slashFilter.toLowerCase()))
        : [],
    [slashFilter, allCommands]
  )

  const applySlashCommand = useCallback(
    (cmd: SlashCommand | SkillCommand) => {
      const isSkill = 'source' in cmd
      useInputStore.getState().setText(isSkill ? `/${cmd.name}` : cmd.body)
      useInputStore.getState().setSlashFilter(null)
      useInputStore.getState().setSlashIndex(0)
      requestAnimationFrame(() => textareaRef.current?.focus())
    },
    [textareaRef]
  )

  const send = useCallback(async () => {
    const { text: currentText } = useInputStore.getState()
    const { selected: currentSelected } = usePaneStore.getState()
    if (!currentSelected || !currentText.trim()) return

    const sent = currentText
    const result = await window.api.sendInput(currentSelected, sent, vimMode)
    if (result.success) {
      useInputStore.getState().pushHistory(sent)
      useInputStore.getState().setText('')
      const firstLine = sent.split('\n')[0].slice(0, 60)
      usePaneStore.getState().updateLastPrompt(currentSelected, firstLine)
      useUiStore.getState().flashStatus('Sent!', true)
    } else {
      useUiStore.getState().flashStatus(result.error ?? 'Failed', false)
    }
  }, [vimMode])

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value
      setText(val)
      const match = val.match(/^\/(\S*)$/)
      if (match && allCommands.length > 0) {
        setSlashFilter(match[1])
        setSlashIndex(0)
      } else {
        setSlashFilter(null)
      }
    },
    [setText, setSlashFilter, setSlashIndex, allCommands]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.nativeEvent.isComposing) return

      if (slashFilter !== null && filteredSlash.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSlashIndex((i) => (i + 1) % filteredSlash.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSlashIndex((i) => (i - 1 + filteredSlash.length) % filteredSlash.length)
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          applySlashCommand(filteredSlash[slashIndex])
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setSlashFilter(null)
          return
        }
      }

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

      const { history, historyIndex } = useInputStore.getState()

      if (e.key === 'ArrowUp' && !e.metaKey && history.length > 0) {
        const ta = e.currentTarget as HTMLTextAreaElement
        const isAtTop = !ta.value.includes('\n') || ta.selectionStart === 0
        if (isAtTop) {
          e.preventDefault()
          const next = useInputStore.getState().navigateHistory('up', text)
          if (next !== null) setText(next)
        }
      }
      if (e.key === 'ArrowDown' && !e.metaKey && historyIndex >= 0) {
        const ta = e.currentTarget as HTMLTextAreaElement
        const isAtBottom = !ta.value.includes('\n') || ta.selectionStart === ta.value.length
        if (isAtBottom) {
          e.preventDefault()
          const next = useInputStore.getState().navigateHistory('down', text)
          if (next !== null) setText(next)
        }
      }
    },
    [
      send,
      sendKey,
      text,
      slashFilter,
      filteredSlash,
      slashIndex,
      applySlashCommand,
      setSlashFilter,
      setSlashIndex,
      setText
    ]
  )

  const selectedPane = usePaneStore.getState().panes.find((p) => p.target === selected)

  return (
    <>
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
                    await window.api.sendInput(selectedPane.target, c.number, vimMode)
                    useUiStore
                      .getState()
                      .flashStatus(`Sent ${c.number} → ${selectedPane.target}`, true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && !e.shiftKey) {
                      const next = e.currentTarget.nextElementSibling as HTMLButtonElement | null
                      if (!next) {
                        e.preventDefault()
                        document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
                      }
                    }
                  }}
                >
                  {c.number}. {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="textarea-wrapper">
        <textarea
          ref={textareaRef}
          className="textarea"
          rows={5}
          placeholder={`Type input to send... (${sendKey === 'cmd+enter' ? 'Cmd+Enter' : 'Enter'} to send)`}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
        />
        {slashFilter !== null && filteredSlash.length > 0 && (
          <div className="slash-menu">
            {filteredSlash.map((cmd, i) => (
              <button
                key={cmd.name}
                className={`slash-item ${i === slashIndex ? 'slash-item-active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  applySlashCommand(cmd)
                }}
              >
                <span className="slash-item-name">/{cmd.name}</span>
                <span className="slash-item-body">
                  {cmd.body.length > 40 ? cmd.body.slice(0, 40) + '...' : cmd.body}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="footer">
        {status && <span className={status.ok ? 'status-ok' : 'status-err'}>{status.message}</span>}
        <button className="send-btn" onClick={send} disabled={!selected || !text.trim()}>
          Send
        </button>
      </div>
    </>
  )
}
