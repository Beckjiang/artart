import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { spawnChildProcess } from './spawn-utils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')
const devServerUrl = 'http://127.0.0.1:5173'

const children = []

const spawnChild = (command, args, extraEnv = {}) => {
  const child = spawnChildProcess(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  })
  children.push(child)
  return child
}

const assertPortAvailable = async (url) => {
  const parsed = new URL(url)
  const port = Number(parsed.port)
  const host = parsed.hostname || '127.0.0.1'

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid dev server URL (missing port): ${url}`)
  }

  await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()

    server.once('error', (error) => {
      // Ensure we don't keep a handle open if listen fails.
      try {
        server.close()
      } catch {
        // noop
      }

      if (error && typeof error === 'object' && error.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use on ${host}. Stop the existing dev server before running dev:desktop.`))
        return
      }

      reject(error)
    })

    server.listen(port, host, () => {
      server.close(() => resolve(undefined))
    })
  })
}

const waitForHttp = async (url, child, timeoutMs = 30000) => {
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    if (child?.exitCode !== null) {
      throw new Error(`Dev server process exited before ${url} became ready (exit code: ${child.exitCode}).`)
    }

    try {
      const response = await fetch(url)
      if (response.ok || response.status < 500) {
        return
      }
    } catch {
      // noop
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for ${url}`)
}

const waitForExit = (child, label) =>
  new Promise((resolve, reject) => {
    child.once('exit', (code) => {
      if (code === 0) {
        resolve(undefined)
        return
      }

      reject(new Error(`${label} exited with code ${code ?? 'null'}`))
    })
    child.once('error', reject)
  })

const cleanup = () => {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }
}

process.on('SIGINT', () => {
  cleanup()
  process.exit(130)
})

process.on('SIGTERM', () => {
  cleanup()
  process.exit(143)
})

const run = async () => {
  await assertPortAvailable(devServerUrl)

  const vite = spawnChild('npm', ['run', 'dev'])
  await waitForHttp(devServerUrl, vite)

  const buildElectron = spawnChild('npm', ['run', 'build:electron'])
  await waitForExit(buildElectron, 'build:electron')

  const electron = spawnChild(electronPath, ['dist-electron/main.cjs'], {
    CANVAS_DESKTOP_DEV_SERVER_URL: devServerUrl,
  })

  await waitForExit(electron, 'electron')
  vite.kill('SIGTERM')
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  cleanup()
  process.exit(1)
})
