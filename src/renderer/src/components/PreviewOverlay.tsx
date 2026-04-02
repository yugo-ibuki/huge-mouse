import type React from 'react'
import { useUiStore } from '../stores/uiStore'
import { usePaneStore } from '../stores/paneStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { StreamRefs } from '../hooks/useStreaming'
import type { ChatMessage } from '../types'

function ChatBubble({ msg, index }: { msg: ChatMessage; index: number }): React.JSX.Element {
  const isUser = msg.role === 'user'
  const ts = msg.timestamp
    ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''

  // Split text into text lines and tool lines for assistant messages
  const lines = msg.text.split('\n')

  return (
    <div key={index} className={`chat-row ${isUser ? 'chat-row-right' : 'chat-row-left'}`}>
      <div className={`chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}>
        {lines.map((line, i) => {
          // Detect tool indicator lines (emoji + tool name pattern)
          const isTool =
            !isUser &&
            /^[\u{1F4C4}\u{270F}\u{1F4DD}\u{1F4BB}\u{1F50D}\u{1F4C2}\u{1F916}\u{1F310}\u{1F50E}\u{1F4CB}\u{1F527}]/u.test(
              line
            )
          if (isTool) {
            return (
              <div key={i} className="chat-tool-line">
                {line}
              </div>
            )
          }
          return (
            <span key={i}>
              {line}
              {i < lines.length - 1 ? '\n' : ''}
            </span>
          )
        })}
        {ts && <span className="chat-timestamp">{ts}</span>}
      </div>
    </div>
  )
}

export function PreviewOverlay({
  streamRefs
}: {
  streamRefs: StreamRefs
}): React.JSX.Element | null {
  const paneContent = useUiStore((s) => s.paneContent)
  const setPaneContent = useUiStore((s) => s.setPaneContent)
  const streaming = useUiStore((s) => s.streaming)
  const setStreaming = useUiStore((s) => s.setStreaming)
  const shellMode = useUiStore((s) => s.shellMode)
  const shellHistory = useUiStore((s) => s.shellHistory)
  const chatMessages = useUiStore((s) => s.chatMessages)
  const setChatMessages = useUiStore((s) => s.setChatMessages)
  const selected = usePaneStore((s) => s.selected)
  const previewKey = useSettingsStore((s) => s.previewKey)

  const { streamActiveRef, paneViewerRef } = streamRefs

  const closePreview = (): void => {
    streamActiveRef.current = false
    setPaneContent(null)
    setChatMessages(null)
    setStreaming(false)
    window.api.stopStream()
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
    })
  }

  if (paneContent === null) return null

  const isChatMode = chatMessages !== null && chatMessages.length > 0

  return (
    <div
      className="pane-overlay"
      tabIndex={-1}
      ref={(el) => el?.focus()}
      onClick={() => closePreview()}
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
            closePreview()
            break
          default:
            return
        }
        e.preventDefault()
      }}
    >
      <div className="pane-popup" onClick={(e) => e.stopPropagation()}>
        <div className="pane-popup-header">
          <span className="pane-popup-title">
            {selected}
            {streaming && <span className="streaming-badge"> LIVE</span>}
          </span>
          <span className="pane-popup-hint">
            {!streaming && `Ctrl+${previewKey.toUpperCase()} live `}j/k d/u g/G q
          </span>
          <button className="pane-popup-close" onClick={() => closePreview()}>
            Esc
          </button>
        </div>
        {isChatMode ? (
          <div
            ref={paneViewerRef as unknown as React.RefObject<HTMLDivElement>}
            className="pane-popup-content chat-container"
            onCopy={(e) => {
              const selectedText = window.getSelection()?.toString() ?? ''
              e.clipboardData.setData('text/plain', selectedText)
              e.preventDefault()
            }}
          >
            {chatMessages.map((msg, i) => (
              <ChatBubble key={i} msg={msg} index={i} />
            ))}
          </div>
        ) : (
          <pre
            ref={paneViewerRef}
            className="pane-popup-content"
            onCopy={(e) => {
              const selectedText = window.getSelection()?.toString() ?? ''
              e.clipboardData.setData('text/plain', selectedText)
              e.preventDefault()
            }}
          >
            {(() => {
              if (!paneContent) return null
              if (shellMode && shellHistory.length > 0) {
                const lines = paneContent.split('\n')
                return lines.map((line, i) => {
                  const isInput = shellHistory.some((cmd) => line.includes(cmd))
                  return (
                    <span key={i} className={isInput ? 'shell-input-line' : ''}>
                      {line}
                      {i < lines.length - 1 ? '\n' : ''}
                    </span>
                  )
                })
              }
              // Find last response marker: ⏺ at start of a line.
              // In FLICK (alternate screen) mode, the marker may be preceded by spaces.
              const markerMatch = paneContent.match(/\n\s*⏺[^]*$/)
              if (!markerMatch || markerMatch.index === undefined) return paneContent
              const lastIdx = markerMatch.index
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
        )}
      </div>
    </div>
  )
}
