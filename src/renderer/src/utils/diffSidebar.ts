import type { DiffFile } from './parseDiff'

export const COLLAPSE_THRESHOLD = 50

export interface DiffSidebarItem {
  index: number
  path: string
  additions: number
  deletions: number
  totalChanges: number
  open: boolean
}

export function getDiffSidebarItems(
  files: DiffFile[],
  openFiles: Record<number, boolean> = {}
): DiffSidebarItem[] {
  return files.map((file, index) => {
    const totalChanges = file.additions + file.deletions

    return {
      index,
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      totalChanges,
      open: openFiles[index] ?? totalChanges < COLLAPSE_THRESHOLD
    }
  })
}
