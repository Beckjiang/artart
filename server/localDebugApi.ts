import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { appendImageApiCallLogBestEffort } from './imageApiCallLogWriter'
import { readJsonBody, type NextHandleFunction } from './httpUtils'
import { getServerDataRoot } from './runtimeConfig'

type DebugImageItem = {
  label: string
  url?: string
  mimeType?: string | null
}

type DebugImagePayload = {
  runId?: string
  prompt?: string
  images?: DebugImageItem[]
}

const DEBUG_IMAGE_DIR = 'debug-image-io'
const DEBUG_ENDPOINT = '/api/local-debug/save-image-set'
const DEBUG_API_CALL_ENDPOINT = '/api/local-debug/save-image-api-call'

const getExtensionByMimeType = (mimeType: string): string => {
  const normalized = mimeType.toLowerCase().split(';')[0].trim()
  if (normalized === 'image/jpeg') return 'jpg'
  if (normalized === 'image/png') return 'png'
  if (normalized === 'image/webp') return 'webp'
  if (normalized === 'image/gif') return 'gif'
  if (normalized === 'image/svg+xml') return 'svg'
  if (normalized === 'image/avif') return 'avif'
  return 'bin'
}

const parseDataUrl = (
  dataUrl: string
): { buffer: Buffer; mimeType: string } | null => {
  const match = /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/i.exec(dataUrl)
  if (!match) return null

  const mimeType = match[1]
  const base64 = match[2]
  return {
    buffer: Buffer.from(base64, 'base64'),
    mimeType,
  }
}

const resolveImageItem = async (
  item: DebugImageItem
): Promise<{ buffer: Buffer; mimeType: string } | null> => {
  if (!item.url) return null

  if (item.url.startsWith('data:')) {
    const parsed = parseDataUrl(item.url)
    if (!parsed) throw new Error(`无法解析 data URL（${item.label}）`)
    return parsed
  }

  const response = await fetch(item.url, {
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`下载图片失败（${item.label}，${response.status}）`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim()
  const mimeType = contentType || item.mimeType || 'application/octet-stream'
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType,
  }
}

const sanitizeLabel = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'image'

const formatDateDir = (date: Date) => {
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

export const createLocalDebugHandler = (): NextHandleFunction => {
  return async (req, res, next) => {
    if (req.url !== DEBUG_ENDPOINT && req.url !== DEBUG_API_CALL_ENDPOINT) {
      await next()
      return
    }

    if (req.method !== 'POST') {
      res.statusCode = 405
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'Method Not Allowed' }))
      return
    }

    try {
      if (req.url === DEBUG_API_CALL_ENDPOINT) {
        const payload = (await readJsonBody(req)) as {
          runId?: string
          record?: unknown
        }
        const record = payload.record
        const runId =
          typeof payload.runId === 'string' && payload.runId.trim()
            ? payload.runId.trim()
            : randomUUID()
        if (!record || typeof record !== 'object') {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: 'record 不能为空' }))
          return
        }

        const persisted = await appendImageApiCallLogBestEffort({
          runId,
          record,
        })
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            runId,
            folder: persisted?.folder || '',
            file: persisted?.file || 'api-calls.json',
            appended: Boolean(persisted),
          })
        )
        return
      }

      const payload = (await readJsonBody(req)) as DebugImagePayload
      const images = Array.isArray(payload.images) ? payload.images : []

      if (images.length === 0) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'images 不能为空' }))
        return
      }

      const now = new Date()
      const runId =
        typeof payload.runId === 'string' && payload.runId.trim()
          ? payload.runId.trim()
          : randomUUID()
      const appDataRoot = getServerDataRoot()
      const runDir = path.resolve(
        appDataRoot,
        DEBUG_IMAGE_DIR,
        formatDateDir(now),
        runId
      )
      await mkdir(runDir, { recursive: true })

      const saved: Array<{
        label: string
        fileName: string
        mimeType: string
      }> = []
      const failed: Array<{
        label: string
        reason: string
      }> = []

      for (let index = 0; index < images.length; index += 1) {
        const item = images[index]
        const label = sanitizeLabel(item.label || `image-${index + 1}`)

        try {
          const resolved = await resolveImageItem(item)
          if (!resolved) {
            failed.push({
              label,
              reason: '缺少 url',
            })
            continue
          }

          const extension = getExtensionByMimeType(resolved.mimeType)
          const fileName = `${String(index + 1).padStart(2, '0')}-${label}.${extension}`
          const filePath = path.join(runDir, fileName)
          await writeFile(filePath, resolved.buffer)
          saved.push({
            label,
            fileName,
            mimeType: resolved.mimeType,
          })
        } catch (error) {
          failed.push({
            label,
            reason: error instanceof Error ? error.message : '保存失败',
          })
        }
      }

      const meta = {
        runId,
        prompt: payload.prompt || '',
        createdAt: now.toISOString(),
        saved,
        failed,
      }
      await writeFile(
        path.join(runDir, 'metadata.json'),
        JSON.stringify(meta, null, 2),
        'utf8'
      )

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          runId,
          folder: path.relative(appDataRoot, runDir),
          saved: saved.length,
          failed: failed.length,
        })
      )
    } catch (error) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : '保存图片失败',
        })
      )
    }
  }
}
