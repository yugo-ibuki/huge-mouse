import { spawn, spawnSync } from 'node:child_process'

const devServerUrl = 'http://127.0.0.1:5173'
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
let renderer
let cargo
let shuttingDown = false

renderer = spawn(npmCommand, ['run', 'dev:renderer'], {
  stdio: 'inherit',
  detached: process.platform !== 'win32'
})

renderer.once('exit', (code, signal) => {
  if (!shuttingDown && !cargo) {
    console.error(`renderer dev server exited before Tauri started: ${signal ?? code}`)
    process.exit(code ?? 1)
  }
  if (!shuttingDown && cargo) {
    console.error(`renderer dev server exited while Tauri was running: ${signal ?? code}`)
    shutdown()
    process.exit(code ?? 1)
  }
})

try {
  await waitForDevServer(devServerUrl)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  shutdown()
  process.exit(1)
}

cargo = spawn('cargo', ['run', '-p', 'unitmux'], {
  stdio: 'inherit',
  detached: process.platform !== 'win32'
})
cargo.once('exit', (code, signal) => {
  shutdown()
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})

process.once('SIGINT', () => {
  shutdown()
  process.exit(130)
})
process.once('SIGTERM', () => {
  shutdown()
  process.exit(143)
})

async function waitForDevServer(url) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`renderer dev server did not become ready at ${url}`)
}

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  killProcessTree(cargo)
  killProcessTree(renderer)
}

function killProcessTree(child) {
  if (!child?.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}
