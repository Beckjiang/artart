import {
  normalizeGeminiConnectionOverride,
  type GeminiConnectionOverride,
} from './geminiConnection'

export const GEMINI_CONNECTION_SETTINGS_STORAGE_KEY = 'canvas:mvp:gemini-settings'

export type GeminiConnectionSettings = GeminiConnectionOverride & {
  hasLocalApiKey: boolean
}

type SaveGeminiConnectionSettingsInput = {
  baseUrl?: string | null
  apiKey?: string | null
  preserveExistingApiKey?: boolean
}

const getStorage = (): Storage | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }

  if ('localStorage' in globalThis && globalThis.localStorage) {
    return globalThis.localStorage
  }

  return null
}

const readStoredGeminiConnection = (): GeminiConnectionOverride | null => {
  const storage = getStorage()
  if (!storage) return null

  const raw = storage.getItem(GEMINI_CONNECTION_SETTINGS_STORAGE_KEY)
  if (!raw) return null

  try {
    return normalizeGeminiConnectionOverride(JSON.parse(raw) as GeminiConnectionOverride)
  } catch {
    return null
  }
}

const writeStoredGeminiConnection = (override?: GeminiConnectionOverride | null) => {
  const storage = getStorage()
  if (!storage) return

  const normalized = normalizeGeminiConnectionOverride(override)
  if (!normalized) {
    storage.removeItem(GEMINI_CONNECTION_SETTINGS_STORAGE_KEY)
    return
  }

  storage.setItem(GEMINI_CONNECTION_SETTINGS_STORAGE_KEY, JSON.stringify(normalized))
}

export const readGeminiConnectionSettings = (): GeminiConnectionSettings => {
  const current = readStoredGeminiConnection()
  return {
    ...(current?.baseUrl ? { baseUrl: current.baseUrl } : {}),
    ...(current?.apiKey ? { apiKey: current.apiKey } : {}),
    hasLocalApiKey: Boolean(current?.apiKey),
  }
}

export const readLocalGeminiConnectionOverride = (): GeminiConnectionOverride | null => {
  const settings = readGeminiConnectionSettings()
  return normalizeGeminiConnectionOverride({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
  })
}

export const saveGeminiConnectionSettings = ({
  baseUrl,
  apiKey,
  preserveExistingApiKey = true,
}: SaveGeminiConnectionSettingsInput): GeminiConnectionSettings => {
  const current = readGeminiConnectionSettings()
  const normalizedOverride = normalizeGeminiConnectionOverride({
    baseUrl: baseUrl ?? current.baseUrl,
    apiKey:
      apiKey && apiKey.trim()
        ? apiKey
        : preserveExistingApiKey
          ? current.apiKey
          : undefined,
  })

  writeStoredGeminiConnection(normalizedOverride)
  return readGeminiConnectionSettings()
}

export const clearLocalGeminiApiKey = (): GeminiConnectionSettings => {
  const current = readGeminiConnectionSettings()
  writeStoredGeminiConnection({
    baseUrl: current.baseUrl,
  })
  return readGeminiConnectionSettings()
}

export const resetGeminiConnectionSettings = (): GeminiConnectionSettings => {
  writeStoredGeminiConnection(null)
  return readGeminiConnectionSettings()
}
