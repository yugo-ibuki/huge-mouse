import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

const source = (path: string): string => readFileSync(join(root, path), 'utf8')

function helpContainsShortcut(help: string, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\['${escaped}',`).test(help)
}

function containsStandaloneShortcut(doc: string, shortcut: string): boolean {
  const escaped = shortcut.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Za-z])${escaped}([^A-Za-z]|$)`).test(doc)
}

describe('keyboard shortcut contract', () => {
  it('keeps global keyboard actions documented in the help overlay', () => {
    const keyboard = source('src/renderer/src/hooks/useGlobalKeyboard.ts')
    const help = source('src/renderer/src/components/HelpOverlay.tsx')

    const implementedShortcuts = [
      ['Ctrl+H / Cmd+↑', /e\.ctrlKey && e\.key === 'h'|e\.metaKey && e\.key === 'ArrowUp'/],
      ['Ctrl+L / Cmd+↓', /e\.ctrlKey && e\.key === 'l'|e\.metaKey && e\.key === 'ArrowDown'/],
      ['Ctrl+Cmd+H', /e\.ctrlKey && e\.metaKey && e\.key === 'h'/],
      ['Ctrl+Cmd+L', /e\.ctrlKey && e\.metaKey && e\.key === 'l'/],
      ['Ctrl+B', /e\.ctrlKey && e\.key === 'b'/],
      ['Ctrl+,', /e\.ctrlKey && e\.key === ','/],
      ['Ctrl+Shift+N', /e\.ctrlKey && e\.shiftKey && \(e\.key === 'N' \|\| e\.key === 'n'\)/],
      ['Ctrl+N', /e\.ctrlKey && e\.key === 'n'/],
      ['Ctrl+C', /e\.ctrlKey && e\.key === 'c'/],
      ['Escape', /e\.key === 'Escape'/]
    ] as const

    for (const [label, implementationPattern] of implementedShortcuts) {
      expect(keyboard, `${label} should still be implemented`).toMatch(implementationPattern)
      expect(helpContainsShortcut(help, label), `${label} should be visible in help overlay`).toBe(
        true
      )
    }
  })

  it('keeps configurable shortcut defaults aligned with the global keyboard hook', () => {
    const settings = source('src/renderer/src/stores/settingsStore.ts')
    const keyboard = source('src/renderer/src/hooks/useGlobalKeyboard.ts')
    const help = source('src/renderer/src/components/HelpOverlay.tsx')

    const defaults = [
      ['previewKey', 'p'],
      ['detailKey', 'd'],
      ['gitKey', 'g'],
      ['diffKey', 'f'],
      ['compactKey', 'w']
    ] as const

    for (const [key, value] of defaults) {
      expect(settings).toContain(`loadSetting<string>('${key}', '${value}')`)
      expect(keyboard).toContain(key)
      expect(help).toContain(key)
    }

    expect(settings).toContain("loadSetting<ChoiceModifier>('choiceModifier', 'ctrl')")
    expect(settings).toContain("loadSetting<string>('focusKey', 'h')")
    expect(help).toContain('focusKey')
  })

  it('does not document a stop shortcut that the app no longer implements', () => {
    const readme = source('README.md')
    const readmeJa = source('README.ja.md')
    const gettingStarted = source('web/docs/guide/getting-started.md')
    const shortcuts = source('web/docs/guide/shortcuts.md')
    const settings = source('web/docs/guide/settings.md')

    for (const doc of [readme, readmeJa, gettingStarted, shortcuts, settings]) {
      expect(doc).not.toContain('Stop Key')
      expect(containsStandaloneShortcut(doc, 'Ctrl+S')).toBe(false)
      expect(doc).not.toContain('escape to interrupt')
    }
  })

  it('keeps platform requirements aligned across root and web docs', () => {
    const readme = source('README.md')
    const readmeJa = source('README.ja.md')
    const gettingStarted = source('web/docs/guide/getting-started.md')
    const images = source('web/docs/guide/images.md')

    expect(readme).toContain('- macOS or Linux')
    expect(readme).toContain('- Linux only: `zenity` for the image picker button')
    expect(readmeJa).toContain('- macOS または Linux')
    expect(readmeJa).toContain('- Linux のみ: 画像ピッカーボタンには `zenity` が必要')
    expect(gettingStarted).toContain('- macOS or Linux')
    expect(gettingStarted).toContain('- Linux only: `zenity` for the image picker button')
    expect(images).toContain('On Linux, the button uses `zenity`.')
  })

  it('keeps manual install instructions platform-specific', () => {
    const readme = source('README.md')
    const readmeJa = source('README.ja.md')
    const gettingStarted = source('web/docs/guide/getting-started.md')

    expect(readme).toContain('macOS: Download `unitmux-macos.dmg`')
    expect(readme).toContain('`unitmux-macos.dmg`')
    expect(readme).toContain('Linux: Download the `unitmux-linux` binary')
    expect(readmeJa).toContain('macOS:')
    expect(readmeJa).toContain('`unitmux-macos.dmg`')
    expect(readmeJa).toContain('`unitmux-macos.dmg`')
    expect(readmeJa).toContain('Linux:')
    expect(readmeJa).toContain('`unitmux-linux` バイナリ')
    expect(gettingStarted).toContain('macOS: Download `unitmux-macos.dmg`')
    expect(gettingStarted).toContain('`unitmux-macos.dmg`')
    expect(gettingStarted).toContain('Linux: Download the `unitmux-linux` binary')
  })

  it('keeps Homebrew cask install instructions scoped to macOS', () => {
    const readme = source('README.md')
    const readmeJa = source('README.ja.md')
    const gettingStarted = source('web/docs/guide/getting-started.md')

    expect(readme).toContain('### macOS Homebrew')
    expect(readme).not.toContain('### Homebrew (recommended)')
    expect(readmeJa).toContain('### macOS Homebrew')
    expect(readmeJa).not.toContain('### Homebrew（推奨）')
    expect(gettingStarted).toContain('### macOS Homebrew')
    expect(gettingStarted).not.toContain('### Homebrew (recommended)')
  })
})
