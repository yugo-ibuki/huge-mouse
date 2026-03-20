import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import {
  listPanes,
  sendInput,
  capturePane,
  getPaneDetail,
  gitAdd,
  gitCommit,
  gitPush
} from './tmux.js'

const app = express()
app.use(express.json())

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Serve built frontend in production
app.use(express.static(join(__dirname, 'public')))

// --- API routes ---

app.get('/api/panes', async (_req, res) => {
  try {
    const panes = await listPanes()
    res.json(panes)
  } catch {
    res.json([])
  }
})

app.post('/api/send', async (req, res) => {
  const { target, text, vimMode } = req.body
  const result = await sendInput(target, text, vimMode)
  res.json(result)
})

app.get('/api/capture', async (req, res) => {
  const target = req.query.target as string
  if (!target) return res.status(400).json({ error: 'target required' })
  const content = await capturePane(target)
  res.json({ content })
})

app.get('/api/detail', async (req, res) => {
  const target = req.query.target as string
  if (!target) return res.status(400).json({ error: 'target required' })
  const detail = await getPaneDetail(target)
  res.json(detail)
})

app.post('/api/git/add', async (req, res) => {
  const result = await gitAdd(req.body.cwd)
  res.json(result)
})

app.post('/api/git/commit', async (req, res) => {
  const { cwd, message } = req.body
  const result = await gitCommit(cwd, message)
  res.json(result)
})

app.post('/api/git/push', async (req, res) => {
  const result = await gitPush(req.body.cwd)
  res.json(result)
})

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'))
})

const PORT = process.env.PORT ?? 3210
app.listen(PORT, () => {
  console.log(`huge-mouse web server running on http://localhost:${PORT}`)
})
