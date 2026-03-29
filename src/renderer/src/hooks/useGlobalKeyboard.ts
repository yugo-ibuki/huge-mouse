import { useEffect } from 'react'
import type React from 'react'
import { useInputStore } from '../stores/inputStore'
import { usePaneStore } from '../stores/paneStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useUiStore } from '../stores/uiStore'
import type { StreamRefs } from './useStreaming'

export function useGlobalKeyboard(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  streamRefs: StreamRefs
): void {
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent): void => {
      const { panes, selected, setSelected } = usePaneStore.getState()
      const { choiceModifier, vimMode, compactKey, previewKey, detailKey, gitKey, stopKey } =
        useSettingsStore.getState()
      const {
        paneContent,
        setPaneContent,
        streaming,
        setStreaming,
        paneDetail,
        setPaneDetail,
        gitPopup,
        setGitPopup,
        setStatus,
        confirmKill,
        setConfirmKill,
        createDialog,
        setCreateDialog,
        setGitResult
      } = useUiStore.getState()

      const { streamActiveRef, paneViewerRef } = streamRefs

      // Pane navigation: Ctrl+Cmd+H/L → jump across session boundaries
      const isPrevSession = e.ctrlKey && e.metaKey && e.key === 'h'
      const isNextSession = e.ctrlKey && e.metaKey && e.key === 'l'
      if (isPrevSession || isNextSession) {
        e.preventDefault()
        if (panes.length > 0) {
          const sessionNames: string[] = []
          const sessionFirstIdx: number[] = []
          for (let i = 0; i < panes.length; i++) {
            const sess = panes[i].target.split(':')[0]
            if (sessionNames[sessionNames.length - 1] !== sess) {
              sessionNames.push(sess)
              sessionFirstIdx.push(i)
            }
          }
          const currentSess = selected ? selected.split(':')[0] : ''
          const currentSessionIdx = sessionNames.indexOf(currentSess)
          let nextSessionIdx: number
          if (isPrevSession) {
            nextSessionIdx = currentSessionIdx > 0 ? currentSessionIdx - 1 : sessionNames.length - 1
          } else {
            nextSessionIdx = currentSessionIdx < sessionNames.length - 1 ? currentSessionIdx + 1 : 0
          }
          setSelected(panes[sessionFirstIdx[nextSessionIdx]].target)
        }
        return
      }

      // Pane navigation: Cmd+Arrow or Ctrl+H/L
      const isPrevPane =
        (e.metaKey && e.key === 'ArrowUp') || (e.ctrlKey && e.key === 'h' && !e.metaKey)
      const isNextPane =
        (e.metaKey && e.key === 'ArrowDown') || (e.ctrlKey && e.key === 'l' && !e.metaKey)
      if (isPrevPane) {
        e.preventDefault()
        const idx = panes.findIndex((p) => p.target === selected)
        const next = idx > 0 ? idx - 1 : panes.length - 1
        if (panes[next]) setSelected(panes[next].target)
        return
      }
      if (isNextPane) {
        e.preventDefault()
        const idx = panes.findIndex((p) => p.target === selected)
        const next = idx < panes.length - 1 ? idx + 1 : 0
        if (panes[next]) setSelected(panes[next].target)
        return
      }

      // Choice modifier + digit (1-9) → send choice to selected pane
      const modPressed = choiceModifier === 'cmd' ? e.metaKey : e.ctrlKey
      const digitMatch = e.code.match(/^Digit([1-9])$/)
      if (modPressed && digitMatch) {
        const digitStr = digitMatch[1]
        const pane = panes.find((p) => p.target === selected)
        if (pane && pane.choices.length > 0) {
          const choice = pane.choices.find((c) => c.number === digitStr)
          if (choice) {
            e.preventDefault()
            window.api.sendInput(pane.target, choice.number, vimMode).then((result) => {
              if (result.success) {
                setStatus({ message: `Sent ${choice.number} → ${pane.target}`, ok: true })
              } else {
                setStatus({ message: result.error ?? 'Failed', ok: false })
              }
              setTimeout(() => setStatus(null), 2000)
            })
          }
        }
      }

      // Ctrl+[compactKey] → toggle compact mode
      if (e.ctrlKey && e.key === compactKey && !e.metaKey) {
        e.preventDefault()
        window.api.toggleCompact()
        return
      }

      // Ctrl+B → toggle shell mode
      if (e.ctrlKey && e.key === 'b' && !e.metaKey) {
        e.preventDefault()
        useUiStore.getState().toggleShellMode()
        return
      }

      // Ctrl+[stopKey] → send Escape to stop the running session
      if (e.ctrlKey && e.key === stopKey && !e.metaKey) {
        e.preventDefault()
        if (selected) {
          window.api.stopSession(selected).then((result) => {
            if (result.success) {
              setStatus({ message: `Stopped → ${selected}`, ok: true })
            } else {
              setStatus({ message: result.error ?? 'Failed to stop', ok: false })
            }
            setTimeout(() => setStatus(null), 2000)
          })
        }
        return
      }

      // Ctrl+[previewKey] → 1st press: static capture, 2nd press: start streaming
      if (e.ctrlKey && e.key === previewKey && !e.metaKey) {
        e.preventDefault()
        if (selected) {
          const { shellMode } = useUiStore.getState()

          const getTarget = async (): Promise<string | null> => {
            if (!shellMode) return selected
            const session = selected.split(':')[0]
            const detail = await window.api.getPaneDetail(selected)
            const cwd = detail?.cwd ?? ''
            const result = await window.api.ensureShellPane(session, cwd)
            return result.success && result.target ? result.target : null
          }

          if (paneContent === null) {
            getTarget().then((target) => {
              if (!target) return
              window.api.capturePane(target).then((content) => {
                useUiStore.getState().setPaneContent(content)
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    paneViewerRef.current?.scrollTo(0, paneViewerRef.current.scrollHeight)
                  })
                })
              })
            })
          } else if (!streaming) {
            getTarget().then((target) => {
              if (!target) return
              setStreaming(true)
              streamActiveRef.current = true
              window.api.startStream(target)
            })
          }
        }
        return
      }

      // Ctrl+[detailKey] → show session detail popup
      if (e.ctrlKey && e.key === detailKey && !e.metaKey) {
        e.preventDefault()
        if (selected) {
          window.api.getPaneDetail(selected).then((detail) => {
            useUiStore.getState().setPaneDetail(detail)
          })
        }
        return
      }

      // Ctrl+[gitKey] → show git operations popup
      if (e.ctrlKey && e.key === gitKey && !e.metaKey) {
        e.preventDefault()
        if (selected) {
          window.api.getPaneDetail(selected).then((detail) => {
            if (detail?.gitBranch) {
              useUiStore.getState().setGitPopup(detail)
            }
          })
        }
        return
      }

      // Git popup shortcuts: Ctrl+A (add), Ctrl+P (push)
      if (gitPopup && e.ctrlKey && !e.metaKey && (e.target as HTMLElement).tagName !== 'INPUT') {
        if (e.key === 'a') {
          e.preventDefault()
          window.api.gitAdd(gitPopup.cwd).then(async (r) => {
            setGitResult(
              r.success
                ? { message: 'Staged all', ok: true }
                : { message: r.error ?? 'Failed', ok: false }
            )
            const refreshed = await window.api.getPaneDetail(gitPopup.target)
            if (refreshed) useUiStore.getState().setGitPopup(refreshed)
            setTimeout(() => setGitResult(null), 2000)
          })
          return
        }
        if (e.key === 'p') {
          e.preventDefault()
          window.api.gitPush(gitPopup.cwd).then((r) => {
            setGitResult(
              r.success
                ? { message: 'Pushed', ok: true }
                : { message: r.error ?? 'Failed', ok: false }
            )
            setTimeout(() => setGitResult(null), 2000)
          })
          return
        }
      }

      // Ctrl+, → toggle help overlay
      if (e.ctrlKey && e.key === ',' && !e.metaKey) {
        e.preventDefault()
        const { helpOpen, setHelpOpen } = useUiStore.getState()
        setHelpOpen(!helpOpen)
        return
      }

      // Ctrl+N → create new claude session in current pane's session & cwd
      if (e.ctrlKey && e.key === 'n' && !e.metaKey) {
        e.preventDefault()
        const sessionName = selected ? selected.split(':')[0] : ''
        if (!sessionName) return
        const cwd = paneDetail?.cwd
        window.api.createSession(sessionName, 'claude', cwd).then((r) => {
          if (r.success) {
            useUiStore.getState().flashStatus(`Created claude in ${sessionName}`, true)
            window.api.listSessions().then((result) => {
              usePaneStore.getState().setPanes(result)
            })
          } else {
            useUiStore.getState().flashStatus(r.error ?? 'Failed', false)
          }
        })
        return
      }

      // Ctrl+T → toggle terminal mode (prefix ! on send)
      if (e.ctrlKey && e.key === 't' && !e.metaKey) {
        e.preventDefault()
        useInputStore.getState().toggleTerminalMode()
        const nowOn = useInputStore.getState().terminalMode
        useUiStore
          .getState()
          .flashStatus(nowOn ? 'Terminal mode ON' : 'Terminal mode OFF', true)
        return
      }

      // Ctrl+C → confirm kill when detail panel is open
      if (e.ctrlKey && e.key === 'c' && !e.metaKey && paneDetail !== null) {
        e.preventDefault()
        setConfirmKill(true)
        return
      }

      // Escape → close overlays in priority order
      if (e.key === 'Escape') {
        const { helpOpen, setHelpOpen: closeHelp } = useUiStore.getState()
        if (helpOpen) {
          e.preventDefault()
          closeHelp(false)
          requestAnimationFrame(() => textareaRef.current?.focus())
          return
        }
        if (confirmKill) {
          e.preventDefault()
          setConfirmKill(false)
          return
        }
        if (createDialog) {
          e.preventDefault()
          setCreateDialog(false)
          requestAnimationFrame(() => textareaRef.current?.focus())
          return
        }
        if (paneContent !== null) {
          e.preventDefault()
          // Close preview: stop streaming and clear content
          streamActiveRef.current = false
          setPaneContent(null)
          setStreaming(false)
          window.api.stopStream()
          requestAnimationFrame(() => textareaRef.current?.focus())
          return
        }
        if (paneDetail !== null) {
          e.preventDefault()
          setPaneDetail(null)
          requestAnimationFrame(() => textareaRef.current?.focus())
          return
        }
        if (gitPopup !== null) {
          e.preventDefault()
          setGitPopup(null)
          requestAnimationFrame(() => textareaRef.current?.focus())
          return
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [textareaRef, streamRefs])
}
