import { describe, expect, it } from 'vitest'
import type { DiffFile } from './parseDiff'
import { COLLAPSE_THRESHOLD, getDiffSidebarItems } from './diffSidebar'

function diffFile(path: string, additions: number, deletions: number): DiffFile {
  return {
    path,
    additions,
    deletions,
    lines: []
  }
}

describe('getDiffSidebarItems', () => {
  it('marks small files as open by default and large files as collapsed', () => {
    const items = getDiffSidebarItems([
      diffFile('src/small.ts', 2, 3),
      diffFile('src/large.ts', COLLAPSE_THRESHOLD, 1)
    ])

    expect(items).toEqual([
      {
        index: 0,
        path: 'src/small.ts',
        additions: 2,
        deletions: 3,
        totalChanges: 5,
        open: true
      },
      {
        index: 1,
        path: 'src/large.ts',
        additions: COLLAPSE_THRESHOLD,
        deletions: 1,
        totalChanges: COLLAPSE_THRESHOLD + 1,
        open: false
      }
    ])
  })

  it('uses explicit open state over the default collapse threshold', () => {
    const items = getDiffSidebarItems(
      [
        diffFile('src/forced-closed.ts', 1, 1),
        diffFile('src/forced-open.ts', COLLAPSE_THRESHOLD + 10, 0)
      ],
      {
        0: false,
        1: true
      }
    )

    expect(items.map((item) => item.open)).toEqual([false, true])
  })
})
