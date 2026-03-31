import { useCallback, useMemo } from 'react'
import type { SlashCommand, SkillCommand } from '../types'
import { useInputStore } from '../stores/inputStore'
import { useSettingsStore } from '../stores/settingsStore'
import { usePaneStore } from '../stores/paneStore'
import { useUiStore } from '../stores/uiStore'

function StatusFooter({ send }: { send: () => void }): React.JSX.Element {
  const status = useUiStore((s) => s.status)
  const hasText = useInputStore((s) => s.text.trim().length > 0)
  const hasSelected = usePaneStore((s) => s.selected !== '')

  return (
    <div className="footer">
      {status && <span className={status.ok ? 'status-ok' : 'status-err'}>{status.message}</span>}
      <button className="send-btn" onClick={send} disabled={!hasSelected || !hasText}>
        Send
      </button>
    </div>
  )
}

interface InputAreaProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}

export function InputArea({ textareaRef }: InputAreaProps): React.JSX.Element {
  const slashFilter = useInputStore((s) => s.slashFilter)
  const slashIndex = useInputStore((s) => s.slashIndex)
  const slashCommands = useInputStore((s) => s.slashCommands)
  const skillCommands = useInputStore((s) => s.skillCommands)
  const sendKey = useSettingsStore((s) => s.sendKey)
  const shellMode = useUiStore((s) => s.shellMode)

  const allCommands = useMemo(
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
    [allCommands, slashFilter]
  )

  const applySlashCommand = useCallback(
    (cmd: SlashCommand | SkillCommand) => {
      const isSkill = 'source' in cmd
      const val = isSkill ? `/${cmd.name}` : cmd.body
      if (textareaRef.current) textareaRef.current.value = val
      useInputStore.getState().setText(val)
      useInputStore.getState().setSlashFilter(null)
      useInputStore.getState().setSlashIndex(0)
      requestAnimationFrame(() => textareaRef.current?.focus())
    },
    [textareaRef]
  )

  const send = useCallback(async () => {
    const currentText = textareaRef.current?.value ?? ''
    const { selected: currentSelected } = usePaneStore.getState()
    if (!currentSelected || !currentText.trim()) return

    const { shellMode: isShell } = useUiStore.getState()

    if (isShell) {
      const session = currentSelected.split(':')[0]
      const detail = await window.api.getPaneDetail(currentSelected)
      const cwd = detail?.cwd ?? ''
      const result = await window.api.ensureShellPane(session, cwd)
      if (!result.success || !result.target) {
        useUiStore.getState().flashStatus(result.error ?? 'Failed to create shell pane', false)
        return
      }
      const sendResult = await window.api.sendInput(result.target, currentText)
      if (sendResult.success) {
        useInputStore.getState().pushHistory(currentText)
        useUiStore.getState().pushShellHistory(currentText)
        if (textareaRef.current) textareaRef.current.value = ''
        useInputStore.getState().setText('')
        useUiStore.getState().flashStatus('Sent to shell!', true)
      } else {
        useUiStore.getState().flashStatus(sendResult.error ?? 'Failed', false)
      }
    } else {
      const currentVimMode = useSettingsStore.getState().vimMode
      const pane = usePaneStore.getState().panes.find((p) => p.target === currentSelected)
      const result = await window.api.sendInput(
        currentSelected,
        currentText,
        currentVimMode,
        pane?.status,
        pane?.command
      )
      if (result.success) {
        useInputStore.getState().pushHistory(currentText)
        if (textareaRef.current) textareaRef.current.value = ''
        useInputStore.getState().setText('')
        const firstLine = currentText.split('\n')[0].slice(0, 60)
        usePaneStore.getState().updateLastPrompt(currentSelected, firstLine)
        useUiStore.getState().flashStatus('Sent!', true)
      } else {
        useUiStore.getState().flashStatus(result.error ?? 'Failed', false)
      }
    }
  }, [textareaRef])

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    const store = useInputStore.getState()
    store.setText(val)
    const cmds = [
      ...store.slashCommands,
      ...store.skillCommands.filter((sk) => !store.slashCommands.some((uc) => uc.name === sk.name))
    ]
    const match = val.match(/^\/(\S*)$/)
    if (match && cmds.length > 0) {
      store.setSlashFilter(match[1])
      store.setSlashIndex(0)
    } else {
      store.setSlashFilter(null)
    }
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.nativeEvent.isComposing) return

      const store = useInputStore.getState()
      const currentSlashFilter = store.slashFilter
      const currentSlashIndex = store.slashIndex

      if (currentSlashFilter !== null) {
        const currentAllCommands = [
          ...store.slashCommands,
          ...store.skillCommands.filter(
            (sk) => !store.slashCommands.some((uc) => uc.name === sk.name)
          )
        ]
        const currentFiltered = currentAllCommands.filter((c) =>
          c.name.toLowerCase().startsWith(currentSlashFilter.toLowerCase())
        )

        if (currentFiltered.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            store.setSlashIndex((i) => (i + 1) % currentFiltered.length)
            return
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            store.setSlashIndex((i) => (i - 1 + currentFiltered.length) % currentFiltered.length)
            return
          }
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            applySlashCommand(currentFiltered[currentSlashIndex])
            return
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            store.setSlashFilter(null)
            return
          }
        }
      }

      if (e.key === 'Enter') {
        const currentSendKey = useSettingsStore.getState().sendKey
        const isSend = currentSendKey === 'cmd+enter' ? e.metaKey : !e.metaKey && !e.shiftKey
        if (isSend) {
          e.preventDefault()
          send()
          return
        }
        if (currentSendKey === 'enter' && e.metaKey) {
          e.preventDefault()
          const ta = e.currentTarget as HTMLTextAreaElement
          const start = ta.selectionStart
          const end = ta.selectionEnd
          const val = ta.value
          const newVal = val.substring(0, start) + '\n' + val.substring(end)
          ta.value = newVal
          ta.selectionStart = ta.selectionEnd = start + 1
          store.setText(newVal)
          return
        }
      }

      const { history, historyIndex } = useInputStore.getState()

      if (e.key === 'ArrowUp' && !e.metaKey && history.length > 0) {
        const ta = e.currentTarget as HTMLTextAreaElement
        const isAtTop = !ta.value.includes('\n') || ta.selectionStart === 0
        if (isAtTop) {
          e.preventDefault()
          const currentText = ta.value
          const next = useInputStore.getState().navigateHistory('up', currentText)
          if (next !== null) {
            ta.value = next
            useInputStore.getState().setText(next)
          }
        }
      }
      if (e.key === 'ArrowDown' && !e.metaKey && historyIndex >= 0) {
        const ta = e.currentTarget as HTMLTextAreaElement
        const isAtBottom = !ta.value.includes('\n') || ta.selectionStart === ta.value.length
        if (isAtBottom) {
          e.preventDefault()
          const currentText = ta.value
          const next = useInputStore.getState().navigateHistory('down', currentText)
          if (next !== null) {
            ta.value = next
            useInputStore.getState().setText(next)
          }
        }
      }
    },
    [send, applySlashCommand]
  )

  return (
    <>
      <div className="textarea-wrapper">
        <textarea
          ref={textareaRef}
          className="textarea"
          rows={5}
          placeholder={
            shellMode
              ? 'Type shell command... (Enter to send)'
              : `Type input to send... (${sendKey === 'cmd+enter' ? 'Cmd+Enter' : 'Enter'} to send)`
          }
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

      <StatusFooter send={send} />
    </>
  )
}
