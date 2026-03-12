import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const devServerUrl = 'http://127.0.0.1:5173'

const children = []

const spawnChild = (command, args, extraEnv = {}) => {
  const child = spawn(command, args, {
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

const waitForHttp = async (url, timeoutMs = 30000) => {
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
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
  const vite = spawnChild(npmCommand, ['run', 'dev'])
  await waitForHttp(devServerUrl)

  const buildElectron = spawnChild(npmCommand, ['run', 'build:electron'])
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
