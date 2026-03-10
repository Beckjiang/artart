import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DEBUG_IMAGE_DIR = 'debug-image-io'

const sanitizeSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const sanitizeRunId = (runId: string) => {
  const sanitized = sanitizeSegment(runId)
  return sanitized || 'run'
}

const formatDateDir = (date: Date) => {
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

const readJsonArray = async (filePath: string): Promise<unknown[]> => {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeJsonPretty = async (filePath: string, payload: unknown) => {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export const appendImageApiCallLog = async (params: {
  runId: string
  record: unknown
}): Promise<{ folder: string; file: string }> => {
  const now = new Date()
  const runDir = path.resolve(
    process.cwd(),
    DEBUG_IMAGE_DIR,
    formatDateDir(now),
    sanitizeRunId(params.runId)
  )

  await mkdir(runDir, { recursive: true })

  const fileName = 'api-calls.json'
  const filePath = path.join(runDir, fileName)

  const list = await readJsonArray(filePath)
  list.push(params.record)
  await writeJsonPretty(filePath, list)

  return {
    folder: path.relative(process.cwd(), runDir),
    file: fileName,
  }
}

export const appendImageApiCallLogBestEffort = async (params: {
  runId: string
  record: unknown
}) => {
  try {
    return await appendImageApiCallLog(params)
  } catch (error) {
    console.warn(
      '[image-api] failed to persist api-calls log',
      error instanceof Error ? error.message : error
    )
    return null
  }
}

