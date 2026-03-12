import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

type RuntimeFileConfig = Record<string, string>

type ServerRuntimeState = {
  dataRoot: string
  envFileDir: string
  configFilePath?: string
}

const DEFAULT_STATE = (): ServerRuntimeState => ({
  dataRoot: process.cwd(),
  envFileDir: process.cwd(),
  configFilePath: undefined,
})

let runtimeState: ServerRuntimeState = DEFAULT_STATE()
let envCache: {
  cacheKey: string
  values: RuntimeFileConfig
} | null = null
let configCache: {
  cacheKey: string
  values: RuntimeFileConfig
} | null = null

const parseEnvContent = (content: string): RuntimeFileConfig => {
  const map: RuntimeFileConfig = {}

  for (const line of content.split(/\r?\n/)) {
    const normalized = line.trim()
    if (!normalized || normalized.startsWith('#')) continue

    const separator = normalized.indexOf('=')
    if (separator <= 0) continue

    const key = normalized.slice(0, separator).trim()
    const value = normalized.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    map[key] = value
  }

  return map
}

const readEnvFile = (filePath: string): RuntimeFileConfig => {
  if (!existsSync(filePath)) return {}
  return parseEnvContent(readFileSync(filePath, 'utf8'))
}

const normalizeJsonConfig = (input: unknown): RuntimeFileConfig => {
  if (!input || typeof input !== 'object') return {}

  return Object.entries(input as Record<string, unknown>).reduce<RuntimeFileConfig>((acc, [key, value]) => {
    if (typeof value === 'string') {
      const normalized = value.trim()
      if (normalized) acc[key] = normalized
      return acc
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      acc[key] = String(value)
    }

    return acc
  }, {})
}

const loadEnvFiles = (): RuntimeFileConfig => {
  const envFileDir = runtimeState.envFileDir
  if (envCache?.cacheKey === envFileDir) return envCache.values

  const values = {
    ...readEnvFile(path.join(envFileDir, '.env')),
    ...readEnvFile(path.join(envFileDir, '.env.local')),
  }

  envCache = {
    cacheKey: envFileDir,
    values,
  }

  return values
}

const loadJsonConfig = (): RuntimeFileConfig => {
  const cacheKey = runtimeState.configFilePath || ''
  if (configCache?.cacheKey === cacheKey) return configCache.values

  if (!runtimeState.configFilePath || !existsSync(runtimeState.configFilePath)) {
    configCache = {
      cacheKey,
      values: {},
    }
    return configCache.values
  }

  try {
    const raw = readFileSync(runtimeState.configFilePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    configCache = {
      cacheKey,
      values: normalizeJsonConfig(parsed),
    }
    return configCache.values
  } catch {
    configCache = {
      cacheKey,
      values: {},
    }
    return configCache.values
  }
}

const clearCaches = () => {
  envCache = null
  configCache = null
}

export const configureServerRuntime = (options: {
  dataRoot?: string
  envFileDir?: string
  configFilePath?: string
}) => {
  const nextState: ServerRuntimeState = {
    dataRoot: options.dataRoot ? path.resolve(options.dataRoot) : runtimeState.dataRoot,
    envFileDir: options.envFileDir ? path.resolve(options.envFileDir) : runtimeState.envFileDir,
    configFilePath:
      options.configFilePath !== undefined
        ? path.resolve(options.configFilePath)
        : runtimeState.configFilePath,
  }

  const changed =
    nextState.dataRoot !== runtimeState.dataRoot ||
    nextState.envFileDir !== runtimeState.envFileDir ||
    nextState.configFilePath !== runtimeState.configFilePath

  runtimeState = nextState
  if (changed) clearCaches()
}

export const getServerDataRoot = () => runtimeState.dataRoot

export const getRuntimeConfigValue = (key: string): string | undefined => {
  const direct = process.env[key]?.trim()
  if (direct) return direct

  const configValue = loadJsonConfig()[key]?.trim()
  if (configValue) return configValue

  const envValue = loadEnvFiles()[key]?.trim()
  return envValue || undefined
}

export const resetServerRuntimeForTests = () => {
  runtimeState = DEFAULT_STATE()
  clearCaches()
}
