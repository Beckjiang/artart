export const IMAGE_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
] as const

export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number]

export const IMAGE_GENERATOR_MODELS = [
  'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image-preview',
] as const

export type ImageGeneratorModel = (typeof IMAGE_GENERATOR_MODELS)[number]

export const IMAGE_GENERATION_SIZES = ['1K', '2K', '4K'] as const

export type ImageGenerationSize = (typeof IMAGE_GENERATION_SIZES)[number]

export const DEFAULT_IMAGE_GENERATOR_MODEL: ImageGeneratorModel =
  'gemini-3.1-flash-image-preview'

export const DEFAULT_IMAGE_GENERATION_SIZE: ImageGenerationSize = '2K'

export const normalizeImageGeneratorModel = (imageModel?: unknown): ImageGeneratorModel => {
  const normalized = typeof imageModel === 'string' ? imageModel.trim() : ''

  if (IMAGE_GENERATOR_MODELS.includes(normalized as ImageGeneratorModel)) {
    return normalized as ImageGeneratorModel
  }

  return DEFAULT_IMAGE_GENERATOR_MODEL
}

export const normalizeImageGenerationSize = (imageSize?: unknown): ImageGenerationSize => {
  const normalized = typeof imageSize === 'string' ? imageSize.trim().toUpperCase() : ''

  if (IMAGE_GENERATION_SIZES.includes(normalized as ImageGenerationSize)) {
    return normalized as ImageGenerationSize
  }

  return DEFAULT_IMAGE_GENERATION_SIZE
}

export type GenerateImageParams = {
  prompt: string
  width: number
  height: number
  aspectRatio?: ImageAspectRatio
  imageModel?: ImageGeneratorModel
  imageSize?: ImageGenerationSize
  referenceImageUrl?: string
  referenceImageUrls?: string[]
  referenceImageMimeType?: string | null
  referenceImageMimeTypes?: Array<string | null>
  signal?: AbortSignal
}

export type GenerateImageResult = {
  imageUrl: string
  mimeType: string | null
  route: 'gemini-generate-content'
}

type GeminiInlineData = {
  mimeType?: string
  mime_type?: string
  data?: string
}

export type GeminiPart = {
  text?: string
  inlineData?: GeminiInlineData
  inline_data?: GeminiInlineData
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[]
    }
  }>
  error?: {
    message?: string
    code?: number
    status?: string
  }
}

export type GeminiConfig = {
  baseUrl: string
  apiKey: string
  imageModel: ImageGeneratorModel
  imageSize: ImageGenerationSize
}

export type GeminiRequestStyle = 'camel' | 'snake'

type GeminiEnvValue = boolean | string | undefined

type GeminiEnv = {
  DEV?: GeminiEnvValue
  VITE_GEMINI_API_KEY?: GeminiEnvValue
  VITE_GEMINI_BASE_URL?: GeminiEnvValue
  VITE_GEMINI_IMAGE_MODEL?: GeminiEnvValue
  VITE_GEMINI_IMAGE_SIZE?: GeminiEnvValue
  VITE_UNIAPI_API_KEY?: GeminiEnvValue
  VITE_UNIAPI_BASE_URL?: GeminiEnvValue
  VITE_UNIAPI_IMAGE_MODEL?: GeminiEnvValue
  VITE_UNIAPI_GEMINI_IMAGE_SIZE?: GeminiEnvValue
}

export type BuildGeminiRequestOptions = {
  prompt: string
  aspectRatio: ImageAspectRatio
  imageSize: ImageGenerationSize
  style: GeminiRequestStyle
  referenceParts?: GeminiPart[]
}

const DIRECT_GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DIRECT_GEMINI_DEFAULT_ORIGIN = 'https://generativelanguage.googleapis.com'
const DEV_PROXY_BASE_URL = '/api/gemini'
const LEGACY_DEV_PROXY_BASE_URL = '/api/uniapi'
const LEGACY_UNIAPI_BASE_URL = 'https://api.uniapi.io'
const GEMINI_API_VERSION_PATH = '/v1beta'

const toDataUrl = (base64: string, mimeType: string) => {
  const normalizedBase64 = base64.replace(/\s+/g, '')
  return normalizedBase64.startsWith('data:')
    ? normalizedBase64
    : `data:${mimeType};base64,${normalizedBase64}`
}

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '')

const isAbsoluteHttpUrl = (value: string) => /^https?:\/\//i.test(value)

export const ensureGeminiApiBaseUrl = (baseUrl: string) => {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!isAbsoluteHttpUrl(normalized)) return normalized

  try {
    const parsed = new URL(normalized)
    const pathname = parsed.pathname.replace(/\/+$/, '')

    if (!pathname) {
      parsed.pathname = GEMINI_API_VERSION_PATH
      return normalizeBaseUrl(parsed.toString())
    }

    if (
      parsed.origin === DIRECT_GEMINI_DEFAULT_ORIGIN &&
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

const readStringEnv = (value: GeminiEnvValue): string | undefined =>
  typeof value === 'string' ? value.trim() || undefined : undefined

const normalizeLegacyBaseUrl = (baseUrl?: string): string | null => {
  const trimmed = baseUrl?.trim()
  if (!trimmed) return null

  const normalized = normalizeBaseUrl(trimmed)
  if (normalized === LEGACY_DEV_PROXY_BASE_URL) return DEV_PROXY_BASE_URL
  if (normalized === LEGACY_UNIAPI_BASE_URL) return DIRECT_GEMINI_DEFAULT_BASE_URL

  return normalized
}

export const resolveGeminiImageDefaults = (env: GeminiEnv) => ({
  imageModel: normalizeImageGeneratorModel(
    readStringEnv(env.VITE_GEMINI_IMAGE_MODEL) || readStringEnv(env.VITE_UNIAPI_IMAGE_MODEL)
  ),
  imageSize: normalizeImageGenerationSize(
    readStringEnv(env.VITE_GEMINI_IMAGE_SIZE) || readStringEnv(env.VITE_UNIAPI_GEMINI_IMAGE_SIZE)
  ),
})

export const resolveGeminiConfig = (env: GeminiEnv, isDev: boolean): GeminiConfig => {
  const apiKey = readStringEnv(env.VITE_GEMINI_API_KEY) || readStringEnv(env.VITE_UNIAPI_API_KEY)
  if (!apiKey) {
    throw new Error('未配置 `VITE_GEMINI_API_KEY`，无法调用 Gemini 生图接口')
  }

  const defaultBaseUrl = isDev ? DEV_PROXY_BASE_URL : DIRECT_GEMINI_DEFAULT_BASE_URL
  const configuredBaseUrl =
    readStringEnv(env.VITE_GEMINI_BASE_URL) ||
    normalizeLegacyBaseUrl(readStringEnv(env.VITE_UNIAPI_BASE_URL)) ||
    defaultBaseUrl

  const { imageModel, imageSize } = resolveGeminiImageDefaults(env)

  return {
    apiKey,
    baseUrl: ensureGeminiApiBaseUrl(configuredBaseUrl),
    imageModel,
    imageSize,
  }
}

const getConfig = (): GeminiConfig => resolveGeminiConfig(import.meta.env, import.meta.env.DEV)

const getInlineData = (part: GeminiPart): GeminiInlineData | null =>
  part.inlineData || part.inline_data || null

const parseGeminiImage = (payload: GeminiResponse): GenerateImageResult => {
  const candidates = payload.candidates ?? []
  const allParts = candidates.flatMap((candidate) => candidate.content?.parts ?? [])
  const imagePart = allParts.find((part) => !!getInlineData(part)?.data)
  const inlineData = imagePart ? getInlineData(imagePart) : null

  if (!inlineData?.data) {
    const textMessage = allParts.map((part) => part.text?.trim()).find(Boolean)
    throw new Error(payload.error?.message || textMessage || 'Gemini 未返回图片数据')
  }

  const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png'

  return {
    imageUrl: toDataUrl(inlineData.data, mimeType),
    mimeType,
    route: 'gemini-generate-content',
  }
}

const toRatioNumber = (ratio: ImageAspectRatio): number => {
  const [widthToken, heightToken] = ratio.split(':')
  const width = Number(widthToken)
  const height = Number(heightToken)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 1
  }
  return width / height
}

export const pickNearestImageAspectRatio = (
  width: number,
  height: number
): ImageAspectRatio => {
  const safeWidth = Math.max(1, Math.round(width))
  const safeHeight = Math.max(1, Math.round(height))
  const target = safeWidth / safeHeight

  let nearest: ImageAspectRatio = IMAGE_ASPECT_RATIOS[0]
  let minDiff = Number.POSITIVE_INFINITY

  for (const candidate of IMAGE_ASPECT_RATIOS) {
    const diff = Math.abs(Math.log(target / toRatioNumber(candidate)))
    if (diff < minDiff) {
      minDiff = diff
      nearest = candidate
    }
  }

  return nearest
}

const ensureResponseOk = async (response: Response): Promise<void> => {
  if (response.ok) return

  let message = `请求失败（${response.status}）`
  try {
    const errorPayload = (await response.json()) as GeminiResponse
    if (errorPayload.error?.message) {
      message = errorPayload.error.message
    }
  } catch {
    // noop
  }
  throw new Error(message)
}

const isAbortError = (error: unknown) =>
  error instanceof DOMException
    ? error.name === 'AbortError'
    : typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError'

const resolveRequestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

export const buildNetworkErrorMessage = (requestUrl: string, error: unknown) => {
  const hints: string[] = []
  const usesLocalProxy =
    requestUrl.startsWith(`${DEV_PROXY_BASE_URL}/`) ||
    requestUrl === DEV_PROXY_BASE_URL ||
    requestUrl.startsWith(`${LEGACY_DEV_PROXY_BASE_URL}/`) ||
    requestUrl === LEGACY_DEV_PROXY_BASE_URL

  try {
    const pageOrigin = typeof window !== 'undefined' ? window.location.origin : undefined
    const pageProtocol = typeof window !== 'undefined' ? window.location.protocol : undefined
    const parsedUrl = new URL(requestUrl, pageOrigin)

    if (pageProtocol === 'https:' && parsedUrl.protocol === 'http:') {
      hints.push('当前页面是 HTTPS，但接口是 HTTP，浏览器会拦截该请求（Mixed Content）')
    }

    if (usesLocalProxy) {
      hints.push('当前请求仍在走 Vite 代理 `/api/gemini`')
      hints.push('如果你刚修改了 `.env.local`，需要重启 `npm run dev`，否则 Vite 仍会使用旧环境变量')
      hints.push('若终端里出现 `http proxy error` / `ETIMEDOUT`，说明本地代理连不上上游 Gemini 服务')
    } else if (pageOrigin && parsedUrl.origin !== pageOrigin) {
      hints.push('这是跨域直连请求，请确认服务端已允许当前页面来源的 CORS')
      hints.push('如果只是本地开发，也可以把 `VITE_GEMINI_BASE_URL` 设为 `/api/gemini` 改走 Vite 代理')
    }
  } catch {
    // noop
  }

  const segments = [
    '网络请求失败（Failed to fetch）',
    requestUrl ? `请求地址：${requestUrl}` : '',
    hints.length > 0 ? `可能原因：${hints.join('；')}` : '',
    error instanceof Error && error.message ? `原始错误：${error.message}` : '',
  ].filter(Boolean)

  return segments.join('。')
}

const fetchWithNetworkHint = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const requestUrl = resolveRequestUrl(input)

  try {
    return await fetch(input, init)
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new Error(buildNetworkErrorMessage(requestUrl, error))
  }
}

const fetchImageBlob = async (source: string, signal?: AbortSignal): Promise<Blob> => {
  const response = await fetchWithNetworkHint(source, {
    signal,
    cache: 'no-store',
    mode: 'cors',
  })
  await ensureResponseOk(response)
  return response.blob()
}

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取参考图失败'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const dataUrl = await blobToDataUrl(blob)
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) {
    throw new Error('参考图转 Base64 失败')
  }
  return dataUrl.slice(commaIndex + 1)
}

const ensurePngBlob = async (input: Blob): Promise<Blob> => {
  if (input.type === 'image/png') return input

  if (typeof createImageBitmap !== 'undefined') {
    const bitmap = await createImageBitmap(input)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      throw new Error('无法创建画布上下文，不能转换图片格式')
    }
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    )
    if (!pngBlob) throw new Error('图片转换 PNG 失败')
    return pngBlob
  }

  return input
}

const toReferenceImageSources = (params: GenerateImageParams): string[] => {
  const list = (params.referenceImageUrls ?? [])
    .map((url) => url.trim())
    .filter((url) => url.length > 0)

  if (list.length > 0) return list
  if (!params.referenceImageUrl) return []

  const single = params.referenceImageUrl.trim()
  return single ? [single] : []
}

const toGeminiImagePart = async (
  source: string,
  signal: AbortSignal | undefined,
  style: GeminiRequestStyle
): Promise<GeminiPart> => {
  const trimmed = source.trim()
  if (!trimmed) {
    throw new Error('参考图地址为空，无法执行图生图')
  }

  const sourceBlob = trimmed.startsWith('data:image/')
    ? await (async () => {
        const response = await fetchWithNetworkHint(trimmed, { signal })
        await ensureResponseOk(response)
        return response.blob()
      })()
    : await fetchImageBlob(trimmed, signal)
  const pngBlob = await ensurePngBlob(sourceBlob)
  const base64 = await blobToBase64(pngBlob)
  const mimeType = pngBlob.type || sourceBlob.type || 'image/png'

  if (style === 'snake') {
    return {
      inline_data: {
        mime_type: mimeType,
        data: base64,
      },
    }
  }

  return {
    inlineData: {
      mimeType,
      data: base64,
    },
  }
}

const getPromptText = (prompt: string, hasReferenceImages: boolean) => {
  const normalizedPrompt = prompt.trim()
  if (normalizedPrompt) return normalizedPrompt
  return hasReferenceImages ? 'Edit this image.' : 'Generate an image.'
}

export const buildGeminiGenerateContentRequest = ({
  prompt,
  aspectRatio,
  imageSize,
  style,
  referenceParts = [],
}: BuildGeminiRequestOptions) => {
  const normalizedPrompt = getPromptText(prompt, referenceParts.length > 0)
  const parts: GeminiPart[] = [{ text: normalizedPrompt }, ...referenceParts]

  if (style === 'snake') {
    return {
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
      generation_config: {
        response_modalities: ['TEXT', 'IMAGE'],
        image_config: {
          aspect_ratio: aspectRatio,
          image_size: imageSize,
        },
      },
    }
  }

  return {
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio,
        imageSize,
      },
    },
  }
}

const buildGeminiRequestBody = async (
  params: GenerateImageParams,
  config: GeminiConfig,
  style: GeminiRequestStyle
) => {
  const referenceSources = toReferenceImageSources(params)
  const referenceParts = await Promise.all(
    referenceSources.map((source) => toGeminiImagePart(source, params.signal, style))
  )
  const aspectRatio =
    params.aspectRatio || pickNearestImageAspectRatio(params.width, params.height)

  return buildGeminiGenerateContentRequest({
    aspectRatio,
    imageSize: params.imageSize ?? config.imageSize,
    prompt: params.prompt,
    referenceParts,
    style,
  })
}

const isLikelyGeminiPayloadError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (!message) return false

  return (
    message.includes('unknown name') ||
    message.includes('invalid json payload') ||
    message.includes('cannot find field') ||
    message.includes('responsemodalities') ||
    message.includes('response_modalities') ||
    message.includes('imageconfig') ||
    message.includes('image_config') ||
    message.includes('inlinedata') ||
    message.includes('inline_data') ||
    message.includes('mimetype') ||
    message.includes('mime_type') ||
    message.includes('aspectratio') ||
    message.includes('aspect_ratio') ||
    message.includes('imagesize') ||
    message.includes('image_size')
  )
}

export const readGeminiResponse = async (response: Response): Promise<GeminiResponse> => {
  const contentType = response.headers.get('content-type')?.toLowerCase() || ''

  if (contentType.includes('application/json')) {
    return (await response.json()) as GeminiResponse
  }

  const rawText = await response.text()
  const preview = rawText.trim().slice(0, 120).toLowerCase()

  if (preview.startsWith('<!doctype html') || preview.startsWith('<html')) {
    throw new Error(
      '接口返回了 HTML 页面而不是 JSON。当前 `VITE_GEMINI_BASE_URL` 很可能指向了站点首页；如果你只配置了域名，请确认服务端在该域名下暴露 `/v1beta/models/...` 接口。'
    )
  }

  if (!rawText.trim()) {
    throw new Error(`接口返回为空响应（Content-Type: ${contentType || 'unknown'}）`)
  }

  try {
    return JSON.parse(rawText) as GeminiResponse
  } catch {
    throw new Error(`接口返回了非 JSON 响应（Content-Type: ${contentType || 'unknown'}）`)
  }
}

export const buildGeminiGenerateContentEndpoint = (baseUrl: string, imageModel: string) =>
  `${ensureGeminiApiBaseUrl(baseUrl)}/models/${imageModel}:generateContent`

const isProxyBaseUrl = (baseUrl: string) => {
  const normalized = normalizeBaseUrl(baseUrl)
  return normalized === DEV_PROXY_BASE_URL || normalized === LEGACY_DEV_PROXY_BASE_URL
}

const isOfficialGeminiBaseUrl = (baseUrl: string) => {
  if (isProxyBaseUrl(baseUrl)) return true

  try {
    const parsed = new URL(ensureGeminiApiBaseUrl(baseUrl))
    return parsed.origin === DIRECT_GEMINI_DEFAULT_ORIGIN
  } catch {
    return false
  }
}

export const getGeminiRequestStyleOrder = (baseUrl: string): GeminiRequestStyle[] =>
  isOfficialGeminiBaseUrl(baseUrl) ? ['camel'] : ['camel']

const buildGeminiRequestHeaders = (baseUrl: string, apiKey: string): Record<string, string> => {
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

const normalizeGeminiError = (
  error: unknown,
  params: GenerateImageParams,
  config: GeminiConfig
) => {
  if (!(error instanceof Error)) return error

  const hasReferenceImages = toReferenceImageSources(params).length > 0
  if (!hasReferenceImages) return error

  const message = error.message
  const lowerMessage = message.toLowerCase()
  if (
    message.includes('图生图服务调用失败') ||
    lowerMessage.includes('upstream_error') ||
    lowerMessage.includes('task failed')
  ) {
    return new Error(
      `当前 Gemini 网关返回“图生图服务调用失败”，说明 ${config.baseUrl} 上的该模型暂不支持参考图编辑。文生图可用，但图生图需要更换支持该能力的网关或模型。原始错误：${message}`
    )
  }

  return error
}

const requestGeminiImage = async (
  config: GeminiConfig,
  params: GenerateImageParams,
  style: GeminiRequestStyle
): Promise<GenerateImageResult> => {
  const imageModel = params.imageModel ?? config.imageModel
  const imageSize = params.imageSize ?? config.imageSize
  const endpoint = buildGeminiGenerateContentEndpoint(config.baseUrl, imageModel)
  const requestBody = await buildGeminiRequestBody(params, config, style)

  if (import.meta.env.DEV) {
    const referenceImageCount = toReferenceImageSources(params).length
    console.info('[imageGeneration] request', {
      endpoint,
      baseUrl: config.baseUrl,
      model: imageModel,
      imageSize,
      style,
      aspectRatio: params.aspectRatio || pickNearestImageAspectRatio(params.width, params.height),
      authMode: isOfficialGeminiBaseUrl(config.baseUrl) ? 'x-goog-api-key' : 'bearer',
      hasReferenceImage: referenceImageCount > 0,
      referenceImageCount,
    })
  }

  const response = await fetchWithNetworkHint(endpoint, {
    method: 'POST',
    headers: buildGeminiRequestHeaders(config.baseUrl, config.apiKey),
    signal: params.signal,
    body: JSON.stringify(requestBody),
  })

  const payload = await readGeminiResponse(response)
  if (!response.ok) {
    throw new Error(payload.error?.message || `Gemini 生图请求失败（${response.status}）`)
  }

  return parseGeminiImage(payload)
}

export async function generateImageFromPrompt(
  params: GenerateImageParams
): Promise<GenerateImageResult> {
  const config = getConfig()
  const styles = getGeminiRequestStyleOrder(config.baseUrl)

  let lastError: unknown = new Error('Gemini 生图请求失败')
  for (const style of styles) {
    try {
      return await requestGeminiImage(config, params, style)
    } catch (error) {
      if (isAbortError(error)) throw error

      lastError = normalizeGeminiError(error, params, config)
      if (!isLikelyGeminiPayloadError(error)) {
        throw lastError
      }
    }
  }

  throw lastError
}
