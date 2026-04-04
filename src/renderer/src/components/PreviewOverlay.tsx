import type React from 'react'
import { useUiStore } from '../stores/uiStore'
import { usePaneStore } from '../stores/paneStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { StreamRefs } from '../hooks/useStreaming'

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
  const selected = usePaneStore((s) => s.selected)
  const currentPane = usePaneStore((s) => s.panes.find((p) => p.target === s.selected))
  const previewKey = useSettingsStore((s) => s.previewKey)

  const { streamActiveRef, paneViewerRef } = streamRefs

  const closePreview = (): void => {
    streamActiveRef.current = false
    setPaneContent(null)
    setStreaming(false)
    window.api.stopStream()
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.textarea')?.focus()
    })
  }

  if (paneContent === null) return null

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
        <div className="pane-popup-content-wrapper">
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
          {currentPane?.status === 'busy' && (
            <div className="raw-activity-indicator">
              <span className="busy-spinner" />
              <span className="busy-text">
                {currentPane.activityLine || 'Working...'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
