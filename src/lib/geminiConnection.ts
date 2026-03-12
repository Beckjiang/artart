export type GeminiConnectionOverride = {
  baseUrl?: string
  apiKey?: string
}

export const GEMINI_BASE_URL_OVERRIDE_HEADER = 'X-Canvas-Gemini-Base-Url'
export const GEMINI_API_KEY_OVERRIDE_HEADER = 'X-Canvas-Gemini-Api-Key'

const normalizeStringValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

const readHeaderValue = (headers: Headers | Record<string, unknown>, name: string): string | undefined => {
  if (headers instanceof Headers) {
    return normalizeStringValue(headers.get(name) ?? headers.get(name.toLowerCase()))
  }

  const exact = headers[name]
  if (Array.isArray(exact)) {
    return normalizeStringValue(exact[0])
  }
  const exactValue = normalizeStringValue(exact)
  if (exactValue) return exactValue

  const lowerValue = headers[name.toLowerCase()]
  if (Array.isArray(lowerValue)) {
    return normalizeStringValue(lowerValue[0])
  }

  return normalizeStringValue(lowerValue)
}

export const normalizeGeminiConnectionOverride = (
  override?: GeminiConnectionOverride | null
): GeminiConnectionOverride | null => {
  if (!override) return null

  const baseUrl = normalizeStringValue(override.baseUrl)
  const apiKey = normalizeStringValue(override.apiKey)
  if (!baseUrl && !apiKey) return null

  return {
    ...(baseUrl ? { baseUrl } : {}),
    ...(apiKey ? { apiKey } : {}),
  }
}

export const buildGeminiConnectionOverrideHeaders = (
  override?: GeminiConnectionOverride | null
): Record<string, string> => {
  const normalized = normalizeGeminiConnectionOverride(override)
  if (!normalized) return {}

  return {
    ...(normalized.baseUrl ? { [GEMINI_BASE_URL_OVERRIDE_HEADER]: normalized.baseUrl } : {}),
    ...(normalized.apiKey ? { [GEMINI_API_KEY_OVERRIDE_HEADER]: normalized.apiKey } : {}),
  }
}

export const readGeminiConnectionOverrideFromHeaders = (
  headers: Headers | Record<string, unknown>
): GeminiConnectionOverride | null => {
  return normalizeGeminiConnectionOverride({
    baseUrl: readHeaderValue(headers, GEMINI_BASE_URL_OVERRIDE_HEADER),
    apiKey: readHeaderValue(headers, GEMINI_API_KEY_OVERRIDE_HEADER),
  })
}
