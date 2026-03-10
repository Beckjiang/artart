export type ImageApiProvider = 'gemini' | 'openai'

export type ImageApiCallLogRecord = {
  schemaVersion: 1
  runId: string
  createdAt: string
  source: 'browser' | 'server-agent' | 'modelGateway'
  provider: ImageApiProvider
  prompt: {
    input: string
    final: string
  }
  meta: {
    model?: string
    imageSize?: string
    width?: number
    height?: number
    aspectRatio?: string
    style?: string
    referenceImageCount?: number
  }
  request: {
    endpoint: string
    method: string
    headers: Record<string, string>
    body?: unknown
  }
  response?: {
    status: number
    ok: boolean
    headers: Record<string, string>
    body?: unknown
  }
  latencyMs: number
  error?: string
}

export const parseBooleanLike = (value: unknown): boolean | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (['1', 'true', 'yes', 'y', 'on', 'enable', 'enabled'].includes(normalized)) return true
  if (['0', 'false', 'no', 'n', 'off', 'disable', 'disabled'].includes(normalized)) return false
  return undefined
}

const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'x-goog-api-key',
  'api-key',
  'x-api-key',
  'x-rapidapi-key',
])

const toHeaderEntries = (headers: unknown): Array<[string, string]> => {
  if (!headers) return []

  if (Array.isArray(headers)) {
    return headers
      .map((pair) => (Array.isArray(pair) && pair.length >= 2 ? [String(pair[0]), String(pair[1])] : null))
      .filter((item): item is [string, string] => item !== null)
  }

  if (typeof headers === 'object') {
    const record = headers as Record<string, unknown>
    const maybeEntries = record.entries
    if (typeof maybeEntries === 'function') {
      try {
        const iterable = (maybeEntries as unknown as (this: unknown) => Iterable<[string, string]>).call(headers)
        return Array.from(iterable)
      } catch {
        return []
      }
    }

    return Object.entries(record)
      .map(([key, value]) => [key, typeof value === 'string' ? value : String(value ?? '')] as [string, string])
      .filter(([, value]) => value !== '')
  }

  return []
}

export const redactHeaders = (headers: unknown): Record<string, string> => {
  const entries = toHeaderEntries(headers)
  const output: Record<string, string> = {}

  for (const [rawKey, rawValue] of entries) {
    const key = String(rawKey)
    const normalizedKey = key.toLowerCase()
    const value = String(rawValue)
    output[key] = SENSITIVE_HEADER_KEYS.has(normalizedKey) ? '<redacted>' : value
  }

  return output
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toOmittedBase64Placeholder = (value: string): string => {
  const normalized = value.replace(/\s+/g, '')
  return `<omitted base64 length=${normalized.length}>`
}

const maybeRedactDataUrl = (value: string): string | null => {
  const trimmed = value.trim()
  if (!/^data:[^;,]+;base64,/i.test(trimmed)) return null
  const commaIndex = trimmed.indexOf(',')
  const base64 = commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : ''
  return toOmittedBase64Placeholder(base64)
}

const redactInlineDataObject = (value: Record<string, unknown>) => {
  const output: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value)) {
    if (key === 'data' && typeof inner === 'string') {
      output[key] = toOmittedBase64Placeholder(inner)
      continue
    }
    output[key] = redactImageApiPayload(inner)
  }
  return output
}

export const redactImageApiPayload = (payload: unknown): unknown => {
  if (typeof payload === 'string') {
    return maybeRedactDataUrl(payload) ?? payload
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => redactImageApiPayload(item))
  }

  if (!isRecord(payload)) return payload

  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if ((key === 'b64_json' || key === 'b64Json') && typeof value === 'string') {
      output[key] = toOmittedBase64Placeholder(value)
      continue
    }

    if (key === 'dataUrl' && typeof value === 'string') {
      output[key] = maybeRedactDataUrl(value) ?? value
      continue
    }

    if ((key === 'inlineData' || key === 'inline_data') && isRecord(value)) {
      output[key] = redactInlineDataObject(value)
      continue
    }

    output[key] = redactImageApiPayload(value)
  }

  return output
}
