import { describe, it, expect } from 'vitest'
import { _testInternals } from './tmux'

const { parseChoices, detectStatus, detectStatusClaude, detectStatusCodex, trimCliFooter } =
  _testInternals

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

  it('ignores optional survey with (optional) marker', () => {
    const content = [
      'Some question (optional)',
      '  1: Good    2: Bad   3: Fine'
    ].join('\n')

    expect(parseChoices(content)).toEqual([])
  })

  it('ignores survey choices with feedback labels in marker format', () => {
    const content = [
      'Rate this response',
      ' ❯ 1. Bad',
      '   2. Fine',
      '   3. Good'
    ].join('\n')

    expect(parseChoices(content)).toEqual([])
  })

  it('does not filter actionable choices like Yes/No', () => {
    const content = ['Do you want to proceed?', ' ❯ 1. Yes', '   2. No'].join('\n')

    const choices = parseChoices(content)
    expect(choices).toEqual([
      { number: '1', label: 'Yes' },
      { number: '2', label: 'No' }
    ])
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

describe('detectStatusCodex', () => {
  it('returns waiting with choices for Codex permission prompts with a selected marker', () => {
    const content = [
      'Would you like to run the following command?',
      '',
      '  Reason: Codex ペインの実際の表示文字列を読み、選択肢パーサが外れる原因を確認してよいですか？',
      '',
      '  $ tmux capture-pane -t brew-tap:1.0 -p -S -120',
      '',
      '  1. Yes, proceed (y)',
      "› 2. Yes, and don't ask again for commands that start with `tmux capture-pane` (p)",
      '  3. No, and tell Codex what to do differently (esc)'
    ].join('\n')

    const result = detectStatusCodex(content)

    expect(result.status).toBe('waiting')
    expect(result.choices).toEqual([
      { number: '1', label: 'Yes, proceed (y)' },
      {
        number: '2',
        label: "Yes, and don't ask again for commands that start with `tmux capture-pane` (p)"
      },
      { number: '3', label: 'No, and tell Codex what to do differently (esc)' }
    ])
  })

  it('returns waiting with choices for Codex numbered option prompts', () => {
    const content = [
      'この設計で進めてよければ実装に入ります。',
      '',
      '  1. 左ペインはファイル一覧だけ',
      '     modified/path.ts +12 -3 のように表示し、j/k または n/N で移動、Enter/o で開閉、クリックでジャンプ。',
      '  2. ディレクトリツリー風に折りたたむ',
      '     src/renderer/... をツリー化します。',
      '  3. Git overlay と同じ行リストを差分内に再利用',
      '     見た目の統一はしやすいですが、責務が違います。',
      '',
      'おすすめは 1 です。'
    ].join('\n')

    const result = detectStatusCodex(content)

    expect(result.status).toBe('waiting')
    expect(result.choices).toEqual([
      { number: '1', label: '左ペインはファイル一覧だけ' },
      { number: '2', label: 'ディレクトリツリー風に折りたたむ' },
      { number: '3', label: 'Git overlay と同じ行リストを差分内に再利用' }
    ])
  })

  it('returns waiting with choices for Codex lettered option prompts', () => {
    const content = [
      '次の確認です。フェーズ1のルーム参加導線はどれにしますか？',
      '',
      '  - A 推奨: ルーム作成後に /rooms/$roomId のURL共有で参加',
      '  - B 6桁程度のルームコード入力で参加',
      '  - C 両方対応: URL共有とルームコード参加の両方',
      '',
      'おすすめは C です。'
    ].join('\n')

    const result = detectStatusCodex(content)

    expect(result.status).toBe('waiting')
    expect(result.choices).toEqual([
      { number: 'A', label: '推奨: ルーム作成後に /rooms/$roomId のURL共有で参加' },
      { number: 'B', label: '6桁程度のルームコード入力で参加' },
      { number: 'C', label: '両方対応: URL共有とルームコード参加の両方' }
    ])
  })

  it('does not treat ordinary Codex bullet lists as choices', () => {
    const content = [
      '実装内容です。',
      '',
      '  - 設定画面に Coming soon を表示',
      '  - 問題管理を一覧閲覧のみに制限',
      '',
      'Enter to send'
    ].join('\n')

    const result = detectStatusCodex(content)

    expect(result.status).toBe('idle')
    expect(result.choices).toEqual([])
  })

  it('does not treat numbered verification steps as choices', () => {
    const content = [
      '最低限この順で確認すると効率がいいです。',
      '',
      '  1. .env に Firebase 設定を入れる',
      '  2. aube seed で10件登録',
      '  3. aube dev で / と /play を確認',
      '  4. /results まで1周遊ぶ',
      '  5. /rooms/new でルーム作成',
      '  6. 別ブラウザまたはシークレットで /rooms/$roomId に参加',
      '  7. ホスト開始、参加者回答、スコア更新、次問題、終了を確認',
      '  8. /admin/questions で作成・編集・有効切替・削除を確認',
      '  9. Vercel Preview で /rooms/$roomId 直アクセスを確認',
      '',
      '特に rooms 周りは、通常ブラウザ + シークレットで見るのが重要です。'
    ].join('\n')

    const result = detectStatusCodex(content)

    expect(result.status).toBe('idle')
    expect(result.choices).toEqual([])
  })
})

describe('detectStatus', () => {
  it('routes Codex variant commands to Codex detection', () => {
    const content = [
      'Would you like to run the following command?',
      '',
      '  1. Yes, proceed (y)',
      "› 2. Yes, and don't ask again for commands that start with `tmux capture-pane` (p)",
      '  3. No, and tell Codex what to do differently (esc)'
    ].join('\n')

    const result = detectStatus('unitmux', content, 'codex-aarch64-a')

    expect(result.status).toBe('waiting')
    expect(result.choices.map((choice) => choice.number)).toEqual(['1', '2', '3'])
  })
})

describe('trimCliFooter', () => {
  it('strips CLI footer lines (separator, session info, prompt cursor)', () => {
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
    expect(result).toBe('⏺ Some response text')
  })

  it('preserves content when no footer is present', () => {
    const content = '⏺ Some response text\nMore text here'
    expect(trimCliFooter(content)).toBe(content)
  })

  it('strips FLICK mode footer patterns (token counts, cost)', () => {
    const content = [
      '⏺ Response',
      '',
      '─────────────────────────────────────',
      '  Session abc | Model opus',
      '500 tokens',
      ''
    ].join('\n')

    expect(trimCliFooter(content)).toBe('⏺ Response')
  })
})
