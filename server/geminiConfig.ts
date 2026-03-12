import { getRuntimeConfigValue } from './runtimeConfig'

export const GEMINI_API_VERSION_PATH = '/v1beta'
export const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
export const GEMINI_DEFAULT_ORIGIN = 'https://generativelanguage.googleapis.com'

const DEV_PROXY_BASE_URL = '/api/gemini'
const LEGACY_DEV_PROXY_BASE_URL = '/api/uniapi'
const LEGACY_UNIAPI_BASE_URL = 'https://api.uniapi.io'

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '')

const isAbsoluteHttpUrl = (value: string) => /^https?:\/\//i.test(value)

export const ensureGeminiApiBaseUrl = (value: string) => {
  const normalized = normalizeBaseUrl(value)
  if (!isAbsoluteHttpUrl(normalized)) return normalized

  try {
    const parsed = new URL(normalized)
    const pathname = parsed.pathname.replace(/\/+$/, '')

    if (!pathname) {
      parsed.pathname = GEMINI_API_VERSION_PATH
      return normalizeBaseUrl(parsed.toString())
    }

    if (
      parsed.origin === GEMINI_DEFAULT_ORIGIN &&
      !pathname.startsWith(GEMINI_API_VERSION_PATH)
    ) {
      parsed.pathname = `${GEMINI_API_VERSION_PATH}${pathname.startsWith('/') ? pathname : `/${pathname}`}`
      return normalizeBaseUrl(parsed.toString())
    }

    return normalizeBaseUrl(parsed.toString())
  } catch {
    return normalized
  }
}

export const isGeminiProxyBaseUrl = (baseUrl: string) => {
  const normalized = normalizeBaseUrl(baseUrl)
  return normalized === DEV_PROXY_BASE_URL || normalized === LEGACY_DEV_PROXY_BASE_URL
}

export const normalizeGeminiServerBaseUrl = (baseUrl?: string) => {
  const trimmed = baseUrl?.trim()
  if (!trimmed) return GEMINI_DEFAULT_BASE_URL

  const normalized = normalizeBaseUrl(trimmed)
  if (
    normalized === LEGACY_UNIAPI_BASE_URL ||
    normalized === DEV_PROXY_BASE_URL ||
    normalized === LEGACY_DEV_PROXY_BASE_URL
  ) {
    return GEMINI_DEFAULT_BASE_URL
  }

  return ensureGeminiApiBaseUrl(normalized)
}

export const isOfficialGeminiBaseUrl = (baseUrl: string) => {
  if (isGeminiProxyBaseUrl(baseUrl)) return true

  try {
    const parsed = new URL(ensureGeminiApiBaseUrl(baseUrl))
    return parsed.origin === GEMINI_DEFAULT_ORIGIN
  } catch {
    return false
  }
}

export const buildGeminiRequestHeaders = (baseUrl: string, apiKey: string) => {
  if (isOfficialGeminiBaseUrl(baseUrl)) {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    }
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
}

export const getServerGeminiApiKey = () =>
  getRuntimeConfigValue('VITE_GEMINI_API_KEY') ||
  getRuntimeConfigValue('GEMINI_API_KEY') ||
  getRuntimeConfigValue('VITE_UNIAPI_API_KEY')

export const getServerGeminiBaseUrl = () =>
  normalizeGeminiServerBaseUrl(
    getRuntimeConfigValue('VITE_GEMINI_BASE_URL') || getRuntimeConfigValue('VITE_UNIAPI_BASE_URL')
  )
