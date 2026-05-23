import { existsSync } from 'fs'
import { open, readdir, readFile, stat } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

export type TokenUsageSource = 'claude-jsonl' | 'codex-jsonl' | 'none'

export interface TokenUsageSlice {
  input: number
  cachedInput: number
  output: number
  reasoningOutput: number
  total: number
  cacheHitRate: number | null
}

export interface TokenUsage extends TokenUsageSlice {
  lastRequest?: TokenUsageSlice
  updatedAt?: string
  source: TokenUsageSource
}

export interface TokenUsageSummary {
  all: TokenUsage
  claude: TokenUsage
  codex: TokenUsage
  updatedAt?: string
}

interface CacheEntry {
  mtimeMs: number
  size: number
  usage: TokenUsage
}

const fileCache = new Map<string, CacheEntry>()
let summaryCache: { time: number; summary: TokenUsageSummary } | null = null
const SUMMARY_CACHE_TTL = 30 * 1000

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function cacheHitRate(input: number, cachedInput: number): number | null {
  if (input <= 0) return null
  return cachedInput / input
}

export function createEmptyTokenUsage(source: TokenUsageSource = 'none'): TokenUsage {
  return {
    input: 0,
    cachedInput: 0,
    output: 0,
    reasoningOutput: 0,
    total: 0,
    cacheHitRate: null,
    source
  }
}

function createSlice(
  input: number,
  cachedInput: number,
  output: number,
  reasoningOutput: number,
  total?: number
): TokenUsageSlice {
  return {
    input,
    cachedInput,
    output,
    reasoningOutput,
    total: total ?? input + output,
    cacheHitRate: cacheHitRate(input, cachedInput)
  }
}

function usageFromClaudeRecord(record: unknown): TokenUsageSlice | null {
  if (!record || typeof record !== 'object') return null
  const container = record as { message?: { usage?: Record<string, unknown> } }
  const usage = container.message?.usage
  if (!usage) return null

  const rawInput = toNumber(usage.input_tokens)
  const cacheCreated = toNumber(usage.cache_creation_input_tokens)
  const cachedInput = toNumber(usage.cache_read_input_tokens)
  const input = rawInput + cacheCreated + cachedInput
  const output = toNumber(usage.output_tokens)
  return createSlice(input, cachedInput, output, 0)
}

export function parseClaudeTokenUsageFromJsonl(raw: string): TokenUsage {
  const requests = new Map<string, { slice: TokenUsageSlice; timestamp?: string }>()
  let fallbackIndex = 0

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line)
      const slice = usageFromClaudeRecord(record)
      if (!slice) continue
      const requestId =
        typeof record.requestId === 'string' ? record.requestId : `line:${fallbackIndex++}`
      requests.set(requestId, {
        slice,
        timestamp: typeof record.timestamp === 'string' ? record.timestamp : undefined
      })
    } catch {
      // JSONL files can contain partial trailing writes while a CLI is running.
    }
  }

  const values = [...requests.values()]
  const usage = aggregateSlices(
    values.map((v) => v.slice),
    'claude-jsonl'
  )
  const last = values[values.length - 1]
  if (last) {
    usage.lastRequest = last.slice
    usage.updatedAt = last.timestamp
  }
  return usage
}

function usageFromCodexObject(value: unknown): TokenUsageSlice | null {
  if (!value || typeof value !== 'object') return null
  const usage = value as Record<string, unknown>
  const input = toNumber(usage.input_tokens)
  const cachedInput = toNumber(usage.cached_input_tokens)
  const output = toNumber(usage.output_tokens)
  const reasoningOutput = toNumber(usage.reasoning_output_tokens)
  const total = toNumber(usage.total_tokens)
  if (input === 0 && cachedInput === 0 && output === 0 && reasoningOutput === 0 && total === 0) {
    return null
  }
  return createSlice(input, cachedInput, output, reasoningOutput, total || undefined)
}

export function parseCodexTokenUsageFromJsonl(raw: string): TokenUsage {
  let totalUsage: TokenUsageSlice | null = null
  let lastRequest: TokenUsageSlice | null = null
  let updatedAt: string | undefined

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line)
      const payload = record.payload
      const nextTotal = usageFromCodexObject(payload?.total_token_usage)
      const nextLast = usageFromCodexObject(payload?.last_token_usage)
      if (nextTotal) {
        totalUsage = nextTotal
        updatedAt = typeof record.timestamp === 'string' ? record.timestamp : updatedAt
      }
      if (nextLast) lastRequest = nextLast
    } catch {
      // JSONL files can contain partial trailing writes while a CLI is running.
    }
  }

  return {
    ...(totalUsage ?? createEmptyTokenUsage('codex-jsonl')),
    lastRequest: lastRequest ?? undefined,
    updatedAt,
    source: 'codex-jsonl'
  }
}

function aggregateSlices(slices: TokenUsageSlice[], source: TokenUsageSource): TokenUsage {
  const result = slices.reduce(
    (acc, usage) => ({
      input: acc.input + usage.input,
      cachedInput: acc.cachedInput + usage.cachedInput,
      output: acc.output + usage.output,
      reasoningOutput: acc.reasoningOutput + usage.reasoningOutput,
      total: acc.total + usage.total
    }),
    { input: 0, cachedInput: 0, output: 0, reasoningOutput: 0, total: 0 }
  )

  return {
    ...result,
    cacheHitRate: cacheHitRate(result.input, result.cachedInput),
    source
  }
}

export function aggregateTokenUsage(usages: TokenUsage[]): TokenUsageSummary {
  const all = aggregateSlices(usages, 'none')
  const claude = aggregateSlices(
    usages.filter((usage) => usage.source === 'claude-jsonl'),
    'claude-jsonl'
  )
  const codex = aggregateSlices(
    usages.filter((usage) => usage.source === 'codex-jsonl'),
    'codex-jsonl'
  )
  const updatedAt = usages
    .map((usage) => usage.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)

  return { all, claude, codex, updatedAt }
}

async function readUsageFile(
  filePath: string,
  parser: (raw: string) => TokenUsage
): Promise<TokenUsage> {
  try {
    const info = await stat(filePath)
    const cached = fileCache.get(filePath)
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
      return cached.usage
    }

    const usage = parser(await readFile(filePath, 'utf-8'))
    fileCache.set(filePath, { mtimeMs: info.mtimeMs, size: info.size, usage })
    return usage
  } catch {
    return createEmptyTokenUsage('none')
  }
}

async function readFirstLine(filePath: string): Promise<string> {
  const file = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(8192)
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead).toString('utf-8').split('\n')[0]
  } finally {
    await file.close()
  }
}

export function getTokenUsageForClaudeJsonl(filePath: string): Promise<TokenUsage> {
  return readUsageFile(filePath, parseClaudeTokenUsageFromJsonl)
}

export function getTokenUsageForCodexJsonl(filePath: string): Promise<TokenUsage> {
  return readUsageFile(filePath, parseCodexTokenUsageFromJsonl)
}

export async function findCodexSessionJsonl(
  sessionId: string,
  cwd?: string
): Promise<string | null> {
  const archivedDir = join(homedir(), '.codex', 'archived_sessions')
  try {
    const files = await readdir(archivedDir)
    if (sessionId) {
      const file = files.find((entry) => entry.endsWith(`${sessionId}.jsonl`))
      if (file) return join(archivedDir, file)
    }

    if (!cwd) return null
    let best: { path: string; mtimeMs: number } | null = null
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue
      const filePath = join(archivedDir, file)
      try {
        const firstLine = await readFirstLine(filePath)
        const meta = JSON.parse(firstLine)
        if (meta.type !== 'session_meta' || meta.payload?.cwd !== cwd) continue
        const info = await stat(filePath)
        if (!best || info.mtimeMs > best.mtimeMs) {
          best = { path: filePath, mtimeMs: info.mtimeMs }
        }
      } catch {
        // Ignore session files whose metadata is unavailable or malformed.
      }
    }
    return best?.path ?? null
  } catch {
    return null
  }
}

async function listClaudeJsonlFiles(): Promise<string[]> {
  const projectsDir = join(homedir(), '.claude', 'projects')
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true })
    const result: string[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const projectDir = join(projectsDir, entry.name)
      try {
        const files = await readdir(projectDir)
        result.push(
          ...files.filter((file) => file.endsWith('.jsonl')).map((file) => join(projectDir, file))
        )
      } catch {
        // Ignore projects that disappear while we scan.
      }
    }
    return result
  } catch {
    return []
  }
}

async function listCodexJsonlFiles(): Promise<string[]> {
  const archivedDir = join(homedir(), '.codex', 'archived_sessions')
  if (!existsSync(archivedDir)) return []
  try {
    const files = await readdir(archivedDir)
    return files.filter((file) => file.endsWith('.jsonl')).map((file) => join(archivedDir, file))
  } catch {
    return []
  }
}

export async function getTokenUsageSummary(force = false): Promise<TokenUsageSummary> {
  if (!force && summaryCache && Date.now() - summaryCache.time < SUMMARY_CACHE_TTL) {
    return summaryCache.summary
  }

  const [claudeFiles, codexFiles] = await Promise.all([
    listClaudeJsonlFiles(),
    listCodexJsonlFiles()
  ])
  const usages = await Promise.all([
    ...claudeFiles.map((file) => getTokenUsageForClaudeJsonl(file)),
    ...codexFiles.map((file) => getTokenUsageForCodexJsonl(file))
  ])
  const summary = aggregateTokenUsage(usages)
  summaryCache = { time: Date.now(), summary }
  return summary
}
