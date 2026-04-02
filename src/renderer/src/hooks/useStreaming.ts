import { useEffect, useMemo, useRef } from 'react'
import { useUiStore } from '../stores/uiStore'

export interface StreamRefs {
  streamActiveRef: React.MutableRefObject<boolean>
  paneViewerRef: React.MutableRefObject<HTMLPreElement | null>
  isAtBottomRef: React.MutableRefObject<boolean>
}

export function useStreaming(): StreamRefs {
  const streamActiveRef = useRef(false)
  const paneViewerRef = useRef<HTMLPreElement | null>(null)
  const isAtBottomRef = useRef(true)

  useEffect(() => {
    const unsubRaw = window.api.onStreamData((content) => {
      if (!streamActiveRef.current) return
      const el = paneViewerRef.current
      if (el) {
        isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30
      }
      useUiStore.getState().setPaneContent(content)
      if (isAtBottomRef.current) {
        requestAnimationFrame(() => {
          paneViewerRef.current?.scrollTo(0, paneViewerRef.current.scrollHeight)
        })
      }
    })
    const unsubChat = window.api.onChatData((messages) => {
      if (!streamActiveRef.current) return
      const el = paneViewerRef.current
      if (el) {
        isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30
      }
      useUiStore.getState().setChatMessages(messages)
      if (isAtBottomRef.current) {
        requestAnimationFrame(() => {
          paneViewerRef.current?.scrollTo(0, paneViewerRef.current.scrollHeight)
        })
      }
    })
    return () => {
      unsubRaw()
      unsubChat()
    }
  }, [])

  return useMemo(() => ({ streamActiveRef, paneViewerRef, isAtBottomRef }), [])
}
