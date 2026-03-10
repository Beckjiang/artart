import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ImageApiCallLogRecord } from './src/lib/imageApiCallLog'
import {
  parseBooleanLike,
  redactHeaders,
  redactImageApiPayload,
} from './src/lib/imageApiCallLog'
import { appendImageApiCallLogBestEffort } from './server/imageApiCallLogWriter'

type ModelProviderType = 'llm' | 'image'
type GenerationJobType = 'topic' | 'copy' | 'image'
type GenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export interface MainModelProviderConfig {
  providerId: string
  providerType: ModelProviderType
  model: string
  enabled: boolean
  priority: number
}

export interface MainModelRunRecord {
  runId: string
  jobId: string
  providerId: string
  model: string
  latencyMs: number
  inputTokens?: number
  outputTokens?: number
  estimatedCost: number
  errorCode?: string
  status: Extract<GenerationJobStatus, 'succeeded' | 'failed'>
  createdAt: string
}

export interface MainTextGenerationRequest {
  jobId: string
  jobType: GenerationJobType
  campaignId: string
  planItemId?: string
  input: string
  temperature?: number
  maxOutputTokens?: number
  useFallback?: boolean
}

export interface MainImageGenerationRequest {
  jobId: string
  jobType: GenerationJobType
  campaignId: string
  planItemId?: string
  prompt: string
  size?: string
  n?: number
  useFallback?: boolean
}

export interface MainTextGenerationResult {
  text: string
  providerId: string
  model: string
  runId: string
  latencyMs: number
  usedFallback: boolean
}

export interface MainImageGenerationResult {
  images: Array<{
    b64Json: string
    previewUrl: string
  }>
  providerId: string
  model: string
  runId: string
  latencyMs: number
  usedFallback: boolean
}

const RUN_RECORD_LIMIT = 300
const DEFAULT_LLM_PRIMARY_MODEL = 'gemini-2.5-flash-nothinking'
const DEFAULT_LLM_FALLBACK_MODEL = 'gpt-4.1-mini'
const DEFAULT_IMAGE_PRIMARY_MODEL = 'gemini-nano-banana-2'
const DEFAULT_BASE_URL = 'https://api.uniapi.io/v1'

let envCache: Record<string, string> | null = null
const runRecords: MainModelRunRecord[] = []

const toRunId = (): string => `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const parseEnvFile = (): Record<string, string> => {
  if (envCache) {
    return envCache
  }

  const candidates = [join(process.cwd(), '.env'), join(process.cwd(), './.env')]
  const foundPath = candidates.find((filePath) => existsSync(filePath))
  if (!foundPath) {
    envCache = {}
    return envCache
  }

  const content = readFileSync(foundPath, 'utf8')
  const lines = content.split(/\r?\n/)
  const values: Record<string, string> = {}

  lines.forEach((line) => {
    const normalized = line.trim()
    if (!normalized || normalized.startsWith('#')) {
      return
    }
    const separator = normalized.indexOf('=')
    if (separator <= 0) {
      return
    }
    const key = normalized.slice(0, separator).trim()
    const value = normalized.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    values[key] = value
  })

  envCache = values
  return envCache
}

const getEnvValue = (key: string): string | undefined => {
  const direct = process.env[key]
  if (direct && direct.trim()) {
    return direct.trim()
  }
  const parsed = parseEnvFile()
  const value = parsed[key]
  return value && value.trim() ? value.trim() : undefined
}

const normalizeBaseUrl = (value: string | undefined): string => {
  const raw = value && value.trim() ? value.trim() : DEFAULT_BASE_URL
  return raw.endsWith('/') ? raw.slice(0, -1) : raw
}

const estimateCost = (inputTokens?: number, outputTokens?: number): number => {
  if (inputTokens === undefined && outputTokens === undefined) {
    return 0
  }
  const total = (inputTokens ?? 0) + (outputTokens ?? 0)
  return Number((total * 0.000001).toFixed(6))
}

const pushRunRecord = (record: MainModelRunRecord): void => {
  runRecords.unshift(record)
  if (runRecords.length > RUN_RECORD_LIMIT) {
    runRecords.length = RUN_RECORD_LIMIT
  }
}

const getProviders = (): MainModelProviderConfig[] => {
  const llmPrimary = getEnvValue('LLM_PRIMARY_MODEL') ?? getEnvValue('OPENAI_LLM_MODEL') ?? DEFAULT_LLM_PRIMARY_MODEL
  const llmFallback = getEnvValue('LLM_FALLBACK_MODEL') ?? DEFAULT_LLM_FALLBACK_MODEL
  const imagePrimary =
    getEnvValue('IMAGE_PRIMARY_MODEL') ?? getEnvValue('OPENAI_IMAGE_MODEL') ?? DEFAULT_IMAGE_PRIMARY_MODEL

  const providers: MainModelProviderConfig[] = [
    { providerId: 'llm-primary', providerType: 'llm', model: llmPrimary, enabled: true, priority: 1 },
    {
      providerId: 'llm-fallback',
      providerType: 'llm',
      model: llmFallback,
      enabled: llmFallback !== '',
      priority: 2
    },
    { providerId: 'image-primary', providerType: 'image', model: imagePrimary, enabled: true, priority: 1 }
  ]

  return providers
}

const extractOutputText = (payload: unknown): string => {
  if (typeof payload !== 'object' || payload === null) {
    return ''
  }
  const asRecord = payload as Record<string, unknown>
  const direct = asRecord.output_text
  if (typeof direct === 'string' && direct.trim()) {
    return direct
  }

  const output = asRecord.output
  if (!Array.isArray(output)) {
    return ''
  }

  const chunks: string[] = []
  output.forEach((item) => {
    if (typeof item !== 'object' || item === null) {
      return
    }
    const content = (item as Record<string, unknown>).content
    if (!Array.isArray(content)) {
      return
    }
    content.forEach((segment) => {
      if (typeof segment !== 'object' || segment === null) {
        return
      }
      const textValue = (segment as Record<string, unknown>).text
      if (typeof textValue === 'string' && textValue.trim()) {
        chunks.push(textValue)
      }
      const outputTextValue = (segment as Record<string, unknown>).output_text
      if (typeof outputTextValue === 'string' && outputTextValue.trim()) {
        chunks.push(outputTextValue)
      }
    })
  })

  return chunks.join('\n').trim()
}

const parseJsonSafely = async (response: Response): Promise<Record<string, unknown>> => {
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { raw: text }
  }
}

const buildHeaders = (): Record<string, string> => {
  const apiKey = getEnvValue('OPENAI_API_KEY')
  if (!apiKey) {
    throw new Error('missing_api_key')
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  }
}

const callResponsesApi = async (
  provider: MainModelProviderConfig,
  request: MainTextGenerationRequest
): Promise<{
  text: string
  inputTokens?: number
  outputTokens?: number
}> => {
  const baseUrl = normalizeBaseUrl(getEnvValue('OPENAI_BASE_URL'))
  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      model: provider.model,
      input: request.input,
      temperature: request.temperature,
      max_output_tokens: request.maxOutputTokens
    })
  })

  const payload = await parseJsonSafely(response)
  if (!response.ok) {
    const message = (payload.error as Record<string, unknown> | undefined)?.message
    throw new Error(typeof message === 'string' ? message : `http_${response.status}`)
  }

  const usage = payload.usage as Record<string, unknown> | undefined
  const inputTokens = typeof usage?.input_tokens === 'number' ? usage.input_tokens : undefined
  const outputTokens = typeof usage?.output_tokens === 'number' ? usage.output_tokens : undefined
  const text = extractOutputText(payload)

  return { text, inputTokens, outputTokens }
}

const callImageApi = async (
  provider: MainModelProviderConfig,
  request: MainImageGenerationRequest
): Promise<{
  images: Array<{
    b64Json: string
    previewUrl: string
  }>
}> => {
  const baseUrl = normalizeBaseUrl(getEnvValue('OPENAI_BASE_URL'))
  const size = request.size ?? '1024x1024'
  const sizeMatch = /^\s*(\d+)\s*x\s*(\d+)\s*$/i.exec(size)
  const width = sizeMatch ? Number(sizeMatch[1]) : undefined
  const height = sizeMatch ? Number(sizeMatch[2]) : undefined
  const aspectRatio = (() => {
    if (!width || !height) return undefined
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
    const divisor = gcd(width, height)
    return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`
  })()

  const endpoint = `${baseUrl}/images/generations`
  const requestHeaders = buildHeaders()
  const requestBody = {
    model: provider.model,
    prompt: request.prompt,
    n: request.n ?? 3,
    size,
    response_format: 'b64_json',
  }

  const envOverride = parseBooleanLike(getEnvValue('VITE_DEBUG_IMAGE_API_LOG'))
  const nodeEnv = process.env.NODE_ENV
  const logEnabled =
    envOverride ?? (nodeEnv === 'test' ? false : nodeEnv !== 'production')
  const runId = request.jobId
  const createdAt = new Date().toISOString()
  const started = Date.now()
  const redactedRequestHeaders = redactHeaders(requestHeaders)
  const redactedRequestBody = redactImageApiPayload(requestBody)

  if (logEnabled) {
    console.info('[image-api] request', {
      runId,
      provider: 'openai',
      endpoint,
      prompt: request.prompt,
      model: provider.model,
      size: request.size ?? '1024x1024',
      n: request.n ?? 3,
      request: {
        headers: redactedRequestHeaders,
        body: redactedRequestBody,
      },
    })
  }

  let response: Response | null = null
  let payload: Record<string, unknown> | undefined = undefined
  let errorMessage: string | undefined

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
    })

    payload = await parseJsonSafely(response)
    if (!response.ok) {
      const message = (payload.error as Record<string, unknown> | undefined)?.message
      throw new Error(typeof message === 'string' ? message : `http_${response.status}`)
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    const latencyMs = Date.now() - started
    if (logEnabled) {
      const record: ImageApiCallLogRecord = {
        schemaVersion: 1,
        runId,
        createdAt,
        source: 'modelGateway',
        provider: 'openai',
        prompt: {
          input: request.prompt,
          final: request.prompt,
        },
        meta: {
          model: provider.model,
          imageSize: size,
          width,
          height,
          aspectRatio,
        },
        request: {
          endpoint,
          method: 'POST',
          headers: redactedRequestHeaders,
          body: redactedRequestBody,
        },
        response: response
          ? {
              status: response.status,
              ok: response.ok,
              headers: redactHeaders(response.headers),
              body: payload ? redactImageApiPayload(payload) : undefined,
            }
          : undefined,
        latencyMs,
        ...(errorMessage ? { error: errorMessage } : {}),
      }

      console.info('[image-api] completed', record)
      void appendImageApiCallLogBestEffort({
        runId,
        record,
      })
    }
  }

  const dataRows = Array.isArray(payload?.data) ? payload.data : []
  const images = dataRows
    .map((item) => (typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => item !== null)
    .map((item) => {
      const b64 = typeof item.b64_json === 'string' ? item.b64_json : ''
      return {
        b64Json: b64,
        previewUrl: b64 ? `data:image/png;base64,${b64}` : ''
      }
    })
    .filter((item) => item.b64Json !== '')

  return { images }
}

const getProvidersForType = (type: ModelProviderType, useFallback: boolean): MainModelProviderConfig[] => {
  const providers = getProviders()
    .filter((provider) => provider.providerType === type && provider.enabled)
    .sort((a, b) => a.priority - b.priority)

  if (!useFallback) {
    return providers.slice(0, 1)
  }
  return providers
}

export const listModelProviders = async (): Promise<MainModelProviderConfig[]> => {
  return getProviders()
}

export const getModelRunRecords = async (limit = 50): Promise<MainModelRunRecord[]> => {
  return runRecords.slice(0, Math.max(1, Math.min(limit, RUN_RECORD_LIMIT)))
}

export const generateTextWithGateway = async (
  request: MainTextGenerationRequest
): Promise<MainTextGenerationResult> => {
  const providers = getProvidersForType('llm', request.useFallback !== false)
  if (providers.length === 0) {
    throw new Error('no_llm_provider')
  }

  let lastError: Error | null = null
  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index]
    const started = Date.now()
    try {
      const response = await callResponsesApi(provider, request)
      const latencyMs = Date.now() - started
      const runId = toRunId()
      pushRunRecord({
        runId,
        jobId: request.jobId,
        providerId: provider.providerId,
        model: provider.model,
        latencyMs,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        estimatedCost: estimateCost(response.inputTokens, response.outputTokens),
        status: 'succeeded',
        createdAt: new Date().toISOString()
      })
      return {
        text: response.text,
        providerId: provider.providerId,
        model: provider.model,
        runId,
        latencyMs,
        usedFallback: index > 0
      }
    } catch (error) {
      const latencyMs = Date.now() - started
      const runId = toRunId()
      const code = error instanceof Error ? error.message : 'unknown_error'
      pushRunRecord({
        runId,
        jobId: request.jobId,
        providerId: provider.providerId,
        model: provider.model,
        latencyMs,
        estimatedCost: 0,
        errorCode: code,
        status: 'failed',
        createdAt: new Date().toISOString()
      })
      lastError = error instanceof Error ? error : new Error('unknown_error')
      if (index < providers.length - 1) {
        continue
      }
    }
  }

  throw lastError ?? new Error('text_generation_failed')
}

export const generateImageWithGateway = async (
  request: MainImageGenerationRequest
): Promise<MainImageGenerationResult> => {
  const providers = getProvidersForType('image', request.useFallback !== false)
  if (providers.length === 0) {
    throw new Error('no_image_provider')
  }

  let lastError: Error | null = null
  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index]
    const started = Date.now()
    try {
      const response = await callImageApi(provider, request)
      const latencyMs = Date.now() - started
      const runId = toRunId()
      pushRunRecord({
        runId,
        jobId: request.jobId,
        providerId: provider.providerId,
        model: provider.model,
        latencyMs,
        estimatedCost: 0,
        status: 'succeeded',
        createdAt: new Date().toISOString()
      })
      return {
        images: response.images,
        providerId: provider.providerId,
        model: provider.model,
        runId,
        latencyMs,
        usedFallback: index > 0
      }
    } catch (error) {
      const latencyMs = Date.now() - started
      const runId = toRunId()
      const code = error instanceof Error ? error.message : 'unknown_error'
      pushRunRecord({
        runId,
        jobId: request.jobId,
        providerId: provider.providerId,
        model: provider.model,
        latencyMs,
        estimatedCost: 0,
        errorCode: code,
        status: 'failed',
        createdAt: new Date().toISOString()
      })
      lastError = error instanceof Error ? error : new Error('unknown_error')
      if (index < providers.length - 1) {
        continue
      }
    }
  }

  throw lastError ?? new Error('image_generation_failed')
}
