import { randomUUID } from 'node:crypto'

export const nowIso = () => new Date().toISOString()

export const createId = (prefix: string) => `${prefix}-${randomUUID()}`

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const chunkText = (text: string, size = 14) => {
  const trimmed = text.trim()
  if (!trimmed) return []

  const chunks: string[] = []
  for (let index = 0; index < trimmed.length; index += size) {
    chunks.push(trimmed.slice(index, index + size))
  }
  return chunks
}

export const safeJsonParse = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
