import { describe, expect, it } from 'vitest'
import {
  aggregateTokenUsage,
  createEmptyTokenUsage,
  parseClaudeTokenUsageFromJsonl,
  parseCodexTokenUsageFromJsonl
} from './tokenUsage'

describe('parseClaudeTokenUsageFromJsonl', () => {
  it('sums unique Claude request usage and calculates cache hit rate', () => {
    const jsonl = [
      JSON.stringify({
        requestId: 'req-1',
        timestamp: '2026-05-23T00:00:00.000Z',
        message: {
          usage: {
            input_tokens: 10,
            cache_creation_input_tokens: 20,
            cache_read_input_tokens: 70,
            output_tokens: 5
          }
        }
      }),
      JSON.stringify({
        requestId: 'req-1',
        timestamp: '2026-05-23T00:00:01.000Z',
        message: {
          usage: {
            input_tokens: 10,
            cache_creation_input_tokens: 20,
            cache_read_input_tokens: 70,
            output_tokens: 5
          }
        }
      }),
      JSON.stringify({
        requestId: 'req-2',
        timestamp: '2026-05-23T00:00:02.000Z',
        message: {
          usage: {
            input_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 45,
            output_tokens: 10
          }
        }
      })
    ].join('\n')

    expect(parseClaudeTokenUsageFromJsonl(jsonl)).toEqual({
      input: 150,
      cachedInput: 115,
      output: 15,
      reasoningOutput: 0,
      total: 165,
      cacheHitRate: 115 / 150,
      lastRequest: {
        input: 50,
        cachedInput: 45,
        output: 10,
        reasoningOutput: 0,
        total: 60,
        cacheHitRate: 45 / 50
      },
      updatedAt: '2026-05-23T00:00:02.000Z',
      source: 'claude-jsonl'
    })
  })
})

describe('parseCodexTokenUsageFromJsonl', () => {
  it('uses the latest Codex total and last request usage', () => {
    const jsonl = [
      JSON.stringify({
        timestamp: '2026-05-23T00:00:00.000Z',
        type: 'turn_context',
        payload: {
          total_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 60,
            output_tokens: 10,
            reasoning_output_tokens: 2,
            total_tokens: 110
          },
          last_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 60,
            output_tokens: 10,
            reasoning_output_tokens: 2,
            total_tokens: 110
          }
        }
      }),
      JSON.stringify({
        timestamp: '2026-05-23T00:00:05.000Z',
        type: 'turn_context',
        payload: {
          total_token_usage: {
            input_tokens: 250,
            cached_input_tokens: 200,
            output_tokens: 30,
            reasoning_output_tokens: 7,
            total_tokens: 280
          },
          last_token_usage: {
            input_tokens: 150,
            cached_input_tokens: 140,
            output_tokens: 20,
            reasoning_output_tokens: 5,
            total_tokens: 170
          }
        }
      })
    ].join('\n')

    expect(parseCodexTokenUsageFromJsonl(jsonl)).toEqual({
      input: 250,
      cachedInput: 200,
      output: 30,
      reasoningOutput: 7,
      total: 280,
      cacheHitRate: 0.8,
      lastRequest: {
        input: 150,
        cachedInput: 140,
        output: 20,
        reasoningOutput: 5,
        total: 170,
        cacheHitRate: 140 / 150
      },
      updatedAt: '2026-05-23T00:00:05.000Z',
      source: 'codex-jsonl'
    })
  })
})

describe('aggregateTokenUsage', () => {
  it('returns all, Claude, and Codex totals with weighted cache hit rates', () => {
    const summary = aggregateTokenUsage([
      {
        input: 100,
        cachedInput: 80,
        output: 10,
        reasoningOutput: 0,
        total: 110,
        cacheHitRate: 0.8,
        source: 'claude-jsonl'
      },
      {
        input: 300,
        cachedInput: 150,
        output: 40,
        reasoningOutput: 5,
        total: 340,
        cacheHitRate: 0.5,
        source: 'codex-jsonl'
      },
      createEmptyTokenUsage('none')
    ])

    expect(summary.all.cacheHitRate).toBe(230 / 400)
    expect(summary.all.total).toBe(450)
    expect(summary.claude.total).toBe(110)
    expect(summary.codex.total).toBe(340)
  })
})
