import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PreviewServer, ViteDevServer } from 'vite'
import { createAgentApiHandler } from './agent/api'
import { createGeminiProxyHandler } from './geminiProxy'
import { createLocalDebugHandler } from './localDebugApi'
import { configureServerRuntime } from './runtimeConfig'
import type { NextHandleFunction } from './httpUtils'

type LocalApiMode = 'vite' | 'desktop' | 'pwa'

type CreateLocalApiHandlerOptions = {
  mode: LocalApiMode
  dataRoot?: string
  envFileDir?: string
  configFilePath?: string
  staticDir?: string
  enableLocalDebug?: boolean
}

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

const toSafeStaticFilePath = (staticDir: string, pathname: string) => {
  const decoded = decodeURIComponent(pathname)
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\//, '')
  const candidate = path.resolve(staticDir, relative)
  const normalizedStaticDir = path.resolve(staticDir)

  if (!candidate.startsWith(`${normalizedStaticDir}${path.sep}`) && candidate !== normalizedStaticDir) {
    return null
  }

  return candidate
}

const maybeServeStatic = async (
  req: IncomingMessage,
  res: ServerResponse,
  staticDir: string
) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false

  const requestUrl = new URL(req.url || '/', 'http://localhost')
  if (requestUrl.pathname.startsWith('/api/')) return false

  const directFilePath = toSafeStaticFilePath(staticDir, requestUrl.pathname)
  const fallbackPath = path.resolve(staticDir, 'index.html')

  const filePath = (() => {
    if (!directFilePath) return fallbackPath

    if (existsSync(directFilePath)) {
      return directFilePath
    }

    const extension = path.extname(directFilePath)
    return extension ? null : fallbackPath
  })()

  if (!filePath) return false

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) return false

    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    res.statusCode = 200
    res.setHeader('Content-Type', contentType)

    if (req.method === 'HEAD') {
      res.end()
      return true
    }

    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath)
      stream.on('error', reject)
      stream.on('end', resolve)
      stream.pipe(res)
    })
    return true
  } catch {
    return false
  }
}

export const createLocalApiHandler = (
  options: CreateLocalApiHandlerOptions
): NextHandleFunction => {
  configureServerRuntime({
    dataRoot: options.dataRoot,
    envFileDir: options.envFileDir,
    configFilePath: options.configFilePath,
  })

  const enableLocalDebug = (() => {
    if (options.enableLocalDebug !== undefined) {
      return options.enableLocalDebug
    }

    if (options.mode === 'vite' || options.mode === 'desktop') {
      return true
    }

    const override = process.env.CANVAS_ENABLE_LOCAL_DEBUG?.trim().toLowerCase()
    if (override === '1' || override === 'true') return true
    if (override === '0' || override === 'false') return false

    return process.env.NODE_ENV !== 'production'
  })()

  const handlers: NextHandleFunction[] = [
    createGeminiProxyHandler(),
    createAgentApiHandler(),
  ]

  if (enableLocalDebug) {
    handlers.unshift(createLocalDebugHandler())
  }

  return async (req, res, next) => {
    for (const handler of handlers) {
      let advanced = false
      await handler(req, res, () => {
        advanced = true
      })

      if (res.writableEnded) {
        return
      }

      if (!advanced) {
        return
      }
    }

    if (options.staticDir) {
      const served = await maybeServeStatic(req, res, options.staticDir)
      if (served) return
    }

    if (next) {
      await next()
      return
    }

    res.statusCode = 404
    res.end('Not Found')
  }
}

export const createLocalApiVitePlugin = () => {
  const handler = createLocalApiHandler({
    mode: 'vite',
  })

  return {
    name: 'local-api-runtime',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        void handler(req, res, next)
      })
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use((req, res, next) => {
        void handler(req, res, next)
      })
    },
  }
}
