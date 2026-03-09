import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

type EnvMap = Record<string, string>

let envCache: EnvMap | null = null

const parseEnvContent = (content: string): EnvMap => {
  const map: EnvMap = {}

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

const readEnvFile = (filePath: string) => {
  if (!existsSync(filePath)) return {}
  return parseEnvContent(readFileSync(filePath, 'utf8'))
}

const loadEnv = (): EnvMap => {
  if (envCache) return envCache

  const cwd = process.cwd()
  envCache = {
    ...readEnvFile(path.join(cwd, '.env')),
    ...readEnvFile(path.join(cwd, '.env.local')),
  }

  return envCache
}

export const getEnvValue = (key: string): string | undefined => {
  const direct = process.env[key]?.trim()
  if (direct) return direct

  const loaded = loadEnv()[key]?.trim()
  return loaded || undefined
}

export const hasGeminiImageConfig = () =>
  Boolean(getEnvValue('VITE_GEMINI_API_KEY') || getEnvValue('VITE_UNIAPI_API_KEY'))
