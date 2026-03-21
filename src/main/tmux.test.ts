import { describe, it, expect } from 'vitest'
import { _testInternals } from './tmux'

const { parseChoices, detectStatusClaude, trimCliFooter } = _testInternals

describe('parseChoices', () => {
  it('detects marker-style choices (❯ 1. Yes / 2. No)', () => {
    const content = ['Do you want to proceed?', ' ❯ 1. Yes', '   2. No'].join('\n')

    const choices = parseChoices(content)
    expect(choices).toEqual([
      { number: '1', label: 'Yes' },
      { number: '2', label: 'No' }
    ])
  })

  it('detects colon-separated inline choices', () => {
    const content = ['Pick a deployment target:', '  1: staging    2: production   3: dev'].join(
      '\n'
    )

    const choices = parseChoices(content)
    expect(choices).toEqual([
      { number: '1', label: 'staging' },
      { number: '2', label: 'production' },
      { number: '3', label: 'dev' }
    ])
  })

  it('ignores session rating feedback prompt', () => {
    const content = [
      '● How is Claude doing this session? (optional)',
      '  1: Bad    2: Fine   3: Good   0: Dismiss'
    ].join('\n')

    expect(parseChoices(content)).toEqual([])
  })

  it('detects dot-separated choices with ● marker', () => {
    const content = ['Some prompt text', ' ● 1. Option A', '   2. Option B', '   3. Option C'].join(
      '\n'
    )

    const choices = parseChoices(content)
    expect(choices).toEqual([
      { number: '1', label: 'Option A' },
      { number: '2', label: 'Option B' },
      { number: '3', label: 'Option C' }
    ])
  })

  it('returns empty for content without choices', () => {
    const content = ['⏺ Here is a normal response.', '', 'Some more text.'].join('\n')

    expect(parseChoices(content)).toEqual([])
  })

  it('only looks at the last 20 lines', () => {
    const filler = Array(25).fill('filler line').join('\n')
    const content = filler + '\n ❯ 1. Yes\n   2. No'

    const choices = parseChoices(content)
    expect(choices).toEqual([
      { number: '1', label: 'Yes' },
      { number: '2', label: 'No' }
    ])
  })

  it('detects choices when option 2 label spans many lines (long command)', () => {
    const commandLines = Array(25).fill('    $RG -n "\\bfoo\\b" $BASE --glob "**/*.{ts,tsx}"')
    const content = [
      'Do you want to proceed?',
      ' ❯ 1. Yes',
      '   2. Yes, and don\'t ask again for: BASE=/some/path',
      '               RG=/opt/homebrew/bin/rg',
      '',
      ...commandLines,
      '   3. No',
      '',
      'Esc to cancel'
    ].join('\n')

    const choices = parseChoices(content)
    expect(choices.map((c) => c.number)).toEqual(['1', '2', '3'])
  })

  it('detects choices even with TUI padding and CLI footer below', () => {
    const content = [
      'Do you want to proceed?',
      ' ❯ 1. Yes',
      "   2. Yes, and don't ask again for: brew upgrade:*",
      '   3. No',
      '',
      'Esc to cancel · Tab to amend · ctrl+e to explain',
      // TUI padding (35 blank lines)
      ...Array(35).fill(''),
      // CLI footer
      '──────────────────────────────────────────',
      '❯ ',
      '──────────────────────────────────────────',
      '  Session ID: abc123 | main | Ctx: 83.5k',
      '  Model: Opus 4.6 (1M context)',
      ''
    ].join('\n')

    const choices = parseChoices(content)
    expect(choices).toEqual([
      { number: '1', label: 'Yes' },
      { number: '2', label: "Yes, and don't ask again for: brew upgrade:*" },
      { number: '3', label: 'No' }
    ])
  })

  it('handles Bash tool permission prompt format', () => {
    const content = [
      ' Bash command',
      '',
      '   node -e "some code"',
      '',
      ' Command contains consecutive quote characters',
      '',
      ' Do you want to proceed?',
      ' ❯ 1. Yes',
      '   2. No'
    ].join('\n')

    const choices = parseChoices(content)
    expect(choices).toEqual([
      { number: '1', label: 'Yes' },
      { number: '2', label: 'No' }
    ])
  })
})

describe('detectStatusClaude', () => {
  it('returns waiting with choices when ✳ title and choices present', () => {
    const content = ['Some question?', ' ❯ 1. Yes', '   2. No'].join('\n')

    const result = detectStatusClaude('✳ Claude Code', content)
    expect(result.status).toBe('waiting')
    expect(result.choices).toHaveLength(2)
  })

  it('detects choices even when title shows busy (⠂)', () => {
    // Permission prompts appear while title is still ⠂
    const content = [' Do you want to proceed?', ' ❯ 1. Yes', '   2. No'].join('\n')

    const result = detectStatusClaude('⠂ Claude Code', content)
    expect(result.status).toBe('waiting')
    expect(result.choices).toEqual([
      { number: '1', label: 'Yes' },
      { number: '2', label: 'No' }
    ])
  })

  it('returns busy when title is ⠂ and no choices', () => {
    const content = '⏺ Working on something...\n'

    const result = detectStatusClaude('⠂ Claude Code', content)
    expect(result.status).toBe('busy')
    expect(result.choices).toEqual([])
  })

  it('returns idle when ✳ title, no choices, no waiting patterns', () => {
    const content = 'Some past output\n'

    const result = detectStatusClaude('✳ Claude Code', content)
    expect(result.status).toBe('idle')
    expect(result.choices).toEqual([])
  })

  it('returns waiting for y/n prompts with ✳ title', () => {
    const content = 'Do you want to continue? (y/n)\n'

    const result = detectStatusClaude('✳ Claude Code', content)
    expect(result.status).toBe('waiting')
  })
})

describe('trimCliFooter', () => {
  it('passes content through unchanged', () => {
    const content = [
      '⏺ Some response text',
      '',
      '─────────────────────────────────────',
      '❯ ',
      '─────────────────────────────────────',
      '  Session ID: abc123 | ⎇ main',
      ''
    ].join('\n')

    const result = trimCliFooter(content)
    expect(result).toBe(content)
  })
})
