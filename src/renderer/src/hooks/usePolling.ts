import { useEffect, useRef } from 'react'
import type { SkillCommand } from '../types'
import { usePaneStore } from '../stores/paneStore'
import { useInputStore } from '../stores/inputStore'

const USER_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const PROJECT_CACHE_TTL = 30 * 1000 // 30 seconds
const USER_SKILLS_CACHE_KEY = 'unitmux:userSkillsCache'
const USER_SKILLS_CACHE_TIME_KEY = 'unitmux:userSkillsCacheTime'

export function usePolling(): void {
  const projectSkillCache = useRef<Map<string, { skills: SkillCommand[]; time: number }>>(new Map())

  // Pane polling: every 3 seconds
  useEffect(() => {
    const poll = async (): Promise<void> => {
      const result = await window.api.listSessions()
      const { selected, setSelected, setPanes, cleanupPrompts } = usePaneStore.getState()

      setPanes(result)

      if (result.length > 0 && !selected) {
        setSelected(result[0].target)
      }

      const activeTargets = result.map((p) => p.target)
      cleanupPrompts(activeTargets)
    }

    poll()
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [])

  // User skills polling: every 5 minutes with localStorage cache
  useEffect(() => {
    const loadUserSkills = async (force = false): Promise<void> => {
      const now = Date.now()
      const cachedTime = Number(localStorage.getItem(USER_SKILLS_CACHE_TIME_KEY) ?? '0')

      if (!force && now - cachedTime < USER_CACHE_TTL) {
        try {
          const cached = JSON.parse(
            localStorage.getItem(USER_SKILLS_CACHE_KEY) ?? '[]'
          ) as SkillCommand[]
          if (cached.length > 0) {
            useInputStore.getState().updateUserSkills(cached)
            return
          }
        } catch {
          // Fall through to re-fetch
        }
      }

      const result = await window.api.listSkills('')
      const userSkills: SkillCommand[] = result.user.map((s) => ({
        name: s.name,
        body: s.description || s.name,
        source: 'skill-user'
      }))
      localStorage.setItem(USER_SKILLS_CACHE_KEY, JSON.stringify(userSkills))
      localStorage.setItem(USER_SKILLS_CACHE_TIME_KEY, String(now))
      useInputStore.getState().updateUserSkills(userSkills)
    }

    loadUserSkills()
    const id = setInterval(() => loadUserSkills(true), USER_CACHE_TTL)
    return () => clearInterval(id)
  }, [])

  // Project skills polling: subscribe to selected pane changes, refresh every 30s
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null
    let lastCwd = ''

    const loadProjectSkills = async (cwd: string, force = false): Promise<void> => {
      if (!cwd) return
      const cache = projectSkillCache.current.get(cwd)
      if (!force && cache && Date.now() - cache.time < PROJECT_CACHE_TTL) {
        useInputStore.getState().updateProjectSkills(cache.skills)
        return
      }

      const result = await window.api.listSkills(cwd)
      const projectSkills: SkillCommand[] = result.project.map((s) => ({
        name: s.name,
        body: s.description || s.name,
        source: 'skill-project'
      }))
      projectSkillCache.current.set(cwd, { skills: projectSkills, time: Date.now() })
      useInputStore.getState().updateProjectSkills(projectSkills)
    }

    const startInterval = (cwd: string): void => {
      if (intervalId !== null) clearInterval(intervalId)
      intervalId = setInterval(() => loadProjectSkills(cwd, true), PROJECT_CACHE_TTL)
    }

    const handleSelectedChange = async (selected: string): Promise<void> => {
      if (!selected) return
      const detail = await window.api.getPaneDetail(selected)
      if (!detail?.cwd) return
      const cwd = detail.cwd
      await loadProjectSkills(cwd)
      if (cwd !== lastCwd) {
        lastCwd = cwd
        startInterval(cwd)
      }
    }

    // Run once for the current selected pane
    const { selected } = usePaneStore.getState()
    handleSelectedChange(selected)

    // Subscribe to selected pane changes
    let prevSelected = usePaneStore.getState().selected
    const unsubscribe = usePaneStore.subscribe((state) => {
      if (state.selected !== prevSelected) {
        prevSelected = state.selected
        handleSelectedChange(state.selected)
      }
    })

    return () => {
      unsubscribe()
      if (intervalId !== null) clearInterval(intervalId)
    }
  }, [])
}
