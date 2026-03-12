import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { createLocalApiHandler } from './localApi'

const parsePort = (raw: string | undefined, fallback: number) => {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

const host = process.env.CANVAS_HOST?.trim() || '127.0.0.1'
const port = parsePort(process.env.CANVAS_PORT, 45123)
const dataRoot = process.env.CANVAS_DATA_ROOT?.trim() || path.resolve(process.cwd(), '.data')
const configFilePath =
  process.env.CANVAS_CONFIG_PATH?.trim() || path.join(dataRoot, 'config.json')
const staticDir = process.env.CANVAS_STATIC_DIR?.trim() || path.resolve(process.cwd(), 'dist')

mkdirSync(dataRoot, { recursive: true })

const handler = createLocalApiHandler({
  mode: 'pwa',
  dataRoot,
  envFileDir: process.cwd(),
  configFilePath,
  staticDir,
})

const server = createServer((req, res) => {
  void handler(req, res, () => {
    if (!res.writableEnded) {
      res.statusCode = 404
      res.end('Not Found')
    }
  })
})

server.listen(port, host, () => {
  console.log(`[pwa] server listening on http://${host}:${port}`)
  console.log(`[pwa] staticDir: ${staticDir}`)
  console.log(`[pwa] dataRoot: ${dataRoot}`)
})
