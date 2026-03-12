import { generateImageWithGateway } from '../../modelGateway'
import type { ImageApiCallLogRecord } from '../../src/lib/imageApiCallLog'
import {
  parseBooleanLike,
  redactHeaders,
  redactImageApiPayload,
} from '../../src/lib/imageApiCallLog'
import { appendImageApiCallLogBestEffort } from '../imageApiCallLogWriter'
import type { CanvasInsertHint } from '../../src/lib/agentChatTypes'
import type { GeminiConnectionOverride } from '../../src/lib/geminiConnection'
import {
  buildGeminiRequestHeaders,
  resolveServerGeminiConnection,
} from '../geminiConfig'
import { getEnvValue } from './env'

type GeminiImageResult = {
  dataUrl: string
  mimeType: string
}

type RunImageToolParams = {
  runId?: string
  prompt: string
  insertHint?: CanvasInsertHint | null
  referenceDataUrls?: string[]
  geminiConnectionOverride?: GeminiConnectionOverride | null
}

type GeminiInlineData = {
  mimeType?: string
  mime_type?: string
  data?: string
}

type GeminiPart = {
  text?: string
  inlineData?: GeminiInlineData
  inline_data?: GeminiInlineData
}

type GeminiResponsePayload = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>
  error?: {
    message?: string
    type?: string
    code?: number
  }
}

const IMAGE_MODEL_FALLBACK = 'gemini-3.1-flash-image-preview'
const IMAGE_SIZE_FALLBACK = '2K'
const IMAGE_TO_IMAGE_FAILURE_MESSAGE = '\u56fe\u751f\u56fe\u670d\u52a1\u8c03\u7528\u5931\u8d25'

const isLikelyImageEditingUnsupported = (message: string) => {
  const normalized = message.toLowerCase()
  return (
    message.includes(IMAGE_TO_IMAGE_FAILURE_MESSAGE) ||
    normalized.includes('upstream_error') ||
    normalized.includes('task failed')
  )
}

const getInlineData = (part?: GeminiPart | null): GeminiInlineData | null =>
  part?.inlineData || part?.inline_data || null

const buildGeminiHttpError = (details: {
  endpoint: string
  status: number
  requestId?: string | null
  upstreamMessage?: string
  rawPreview?: string
}) => {
  const segments = [
    `Gemini image request failed (HTTP ${details.status})`,
    details.endpoint ? `endpoint=${details.endpoint}` : '',
    details.requestId ? `requestId=${details.requestId}` : '',
    details.upstreamMessage ? `error=${details.upstreamMessage}` : '',
    details.rawPreview ? `response=${details.rawPreview}` : '',
  ].filter(Boolean)

  return segments.join('. ')
}

const getHintWidth = (hint?: CanvasInsertHint | null) => {
  if (!hint) return null
  if (hint.mode === 'generator-card') return hint.width
  return hint.outputWidth ?? null
}

const getHintHeight = (hint?: CanvasInsertHint | null) => {
  if (!hint) return null
  if (hint.mode === 'generator-card') return hint.height
  return hint.outputHeight ?? null
}

const getAspectRatioValue = (hint?: CanvasInsertHint | null) => {
  if (!hint) return '1:1'
  if ('aspectRatio' in hint && hint.aspectRatio) return hint.aspectRatio

  const width = Number(getHintWidth(hint) ?? 0)
  const height = Number(getHintHeight(hint) ?? 0)

  if (width > 0 && height > 0) {
    return width >= height ? '4:3' : '3:4'
  }

  if (hint.mode === 'image-edit') return '4:3'
  return '1:1'
}

const resolveDimensions = (hint?: CanvasInsertHint | null) => {
  const width = getHintWidth(hint)
  const height = getHintHeight(hint)

  if (width && height) {
    return {
      width: Math.max(128, Math.round(width)),
      height: Math.max(128, Math.round(height)),
    }
  }

  const aspectRatio = getAspectRatioValue(hint)
  switch (aspectRatio) {
    case '16:9':
      return { width: 1280, height: 720 }
    case '9:16':
      return { width: 720, height: 1280 }
    case '4:3':
      return { width: 1200, height: 900 }
    case '3:4':
      return { width: 900, height: 1200 }
    default:
      return { width: 1024, height: 1024 }
  }
}

const parseDataUrl = (input: string) => {
  const match = /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/i.exec(input)
  if (!match) {
    throw new Error('invalid_data_url')
  }

  return {
    mimeType: match[1] || 'image/png',
    data: match[2].replace(/\s+/g, ''),
  }
}

const fetchAsDataPart = async (input: string) => {
  if (input.startsWith('data:')) {
    return parseDataUrl(input)
  }

  const response = await fetch(input, {
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`image_fetch_failed:${response.status}`)
  }

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png'
  const buffer = Buffer.from(await response.arrayBuffer())
  return {
    mimeType: contentType,
    data: buffer.toString('base64'),
  }
}

const requestGeminiImage = async (
  prompt: string,
  insertHint?: CanvasInsertHint | null,
  referenceDataUrls: string[] = [],
  runId?: string,
  geminiConnectionOverride?: GeminiConnectionOverride | null
): Promise<GeminiImageResult> => {
  const { apiKey, baseUrl } = resolveServerGeminiConnection(geminiConnectionOverride)
  if (!apiKey) {
    throw new Error('missing_gemini_api_key')
  }

  const imageModel = getEnvValue('VITE_GEMINI_IMAGE_MODEL') || IMAGE_MODEL_FALLBACK
  const imageSize = getEnvValue('VITE_GEMINI_IMAGE_SIZE') || IMAGE_SIZE_FALLBACK
  const aspectRatio = getAspectRatioValue(insertHint)
  const endpoint = `${baseUrl}/models/${imageModel}:generateContent`
  const referenceParts = await Promise.all(
    referenceDataUrls.filter(Boolean).map(async (referenceDataUrl) => {
      const part = await fetchAsDataPart(referenceDataUrl)
      return {
        inlineData: {
          mimeType: part.mimeType,
          data: part.data,
        },
      }
    })
  )

  const envOverride = parseBooleanLike(getEnvValue('VITE_DEBUG_IMAGE_API_LOG'))
  const nodeEnv = process.env.NODE_ENV
  const logEnabled =
    envOverride ?? (nodeEnv === 'test' ? false : nodeEnv !== 'production')
  const resolvedRunId = runId?.trim() || `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const createdAt = new Date().toISOString()
  const started = Date.now()

  const requestHeaders = buildGeminiRequestHeaders(baseUrl, apiKey)
  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              prompt.trim() ||
              (referenceParts.length > 0 ? 'Edit this image.' : 'Generate an image.'),
          },
          ...referenceParts,
        ],
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

  const finalPrompt = (() => {
    const parts = requestBody.contents?.[0]?.parts ?? []
    for (const part of parts) {
      const text = (part as { text?: unknown }).text
      if (typeof text === 'string' && text.trim()) {
        return text
      }
    }

    return prompt
  })()

  const redactedRequestHeaders = redactHeaders(requestHeaders)
  const redactedRequestBody = redactImageApiPayload(requestBody)

  if (logEnabled) {
    console.info('[image-api] request', {
      runId: resolvedRunId,
      provider: 'gemini',
      endpoint,
      prompt: finalPrompt,
      model: imageModel,
      imageSize,
      aspectRatio,
      referenceImageCount: referenceParts.length,
      request: {
        headers: redactedRequestHeaders,
        body: redactedRequestBody,
      },
    })
  }

  let response: Response | null = null
  let rawText: string | undefined
  let payload: GeminiResponsePayload = {}
  let errorMessage: string | undefined

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...requestHeaders,
      },
      body: JSON.stringify(requestBody),
    })

    rawText = await response.text()
    const requestId = response.headers.get('x-oneapi-request-id')

    if (rawText.trim()) {
      try {
        payload = JSON.parse(rawText) as GeminiResponsePayload
      } catch {
        payload = {}
      }
    }

    if (!response.ok) {
      const upstreamMessage = payload.error?.message?.trim() || ''
      const rawPreview = rawText.trim().slice(0, 200)
      const baseErrorMessage = upstreamMessage || rawPreview
      const detailedMessage = buildGeminiHttpError({
        endpoint,
        status: response.status,
        requestId,
        upstreamMessage: upstreamMessage || undefined,
        rawPreview: upstreamMessage ? undefined : rawPreview,
      })

      if (referenceParts.length > 0 && isLikelyImageEditingUnsupported(baseErrorMessage)) {
        throw new Error(
          `The gateway returned "${IMAGE_TO_IMAGE_FAILURE_MESSAGE}" for image-to-image. ` +
            `This usually means ${baseUrl} (model: ${imageModel}) does not support reference-image editing. ` +
            'Text-to-image can still work; switch to a gateway/model that supports image editing. ' +
            `Original error: ${baseErrorMessage || `HTTP ${response.status}`}. ${detailedMessage}`
        )
      }

      throw new Error(detailedMessage)
    }

  const allParts = payload.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? []
  const imagePart = allParts.find((part) => Boolean(getInlineData(part)?.data))
  const inlineData = getInlineData(imagePart)

  const mimeType = inlineData?.mimeType || inlineData?.mime_type || 'image/png'
  const data = inlineData?.data
  if (!data) {
    const textMessage = payload.error?.message?.trim() || ''
    const baseMessage = textMessage || 'gemini_image_missing'
    throw new Error(
      buildGeminiHttpError({
        endpoint,
        status: response.status,
        requestId,
        upstreamMessage: baseMessage,
      })
    )
  }

  return {
    dataUrl: `data:${mimeType};base64,${data}`,
    mimeType,
  }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    const latencyMs = Date.now() - started
    if (logEnabled) {
      const record: ImageApiCallLogRecord = {
        schemaVersion: 1,
        runId: resolvedRunId,
        createdAt,
        source: 'server-agent',
        provider: 'gemini',
        prompt: {
          input: prompt,
          final: finalPrompt,
        },
        meta: {
          model: imageModel,
          imageSize,
          aspectRatio,
          referenceImageCount: referenceParts.length,
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
              body: redactImageApiPayload(
                rawText && rawText.trim()
                  ? (() => {
                      try {
                        return JSON.parse(rawText) as unknown
                      } catch {
                        return { raw: rawText.trim().slice(0, 400) }
                      }
                    })()
                  : payload
              ),
            }
          : undefined,
        latencyMs,
        ...(errorMessage ? { error: errorMessage } : {}),
      }

      console.info('[image-api] completed', record)
      void appendImageApiCallLogBestEffort({
        runId: resolvedRunId,
        record,
      })
    }
  }
}

export const runTextToImageTool = async ({
  runId,
  prompt,
  insertHint,
  geminiConnectionOverride,
}: RunImageToolParams): Promise<GeminiImageResult & { width: number; height: number }> => {
  const dimensions = resolveDimensions(insertHint)
  const { apiKey } = resolveServerGeminiConnection(geminiConnectionOverride)

  if (apiKey) {
    const result = await requestGeminiImage(
      prompt,
      insertHint,
      [],
      runId,
      geminiConnectionOverride
    )
    return {
      ...result,
      ...dimensions,
    }
  }

  const gateway = await generateImageWithGateway({
    jobId: `agent-${Date.now()}`,
    jobType: 'image',
    campaignId: 'agent-chat',
    prompt,
    n: 1,
    size: `${dimensions.width}x${dimensions.height}`,
  })

  const first = gateway.images[0]
  if (!first) {
    throw new Error('gateway_image_missing')
  }

  return {
    dataUrl: first.previewUrl,
    mimeType: 'image/png',
    width: dimensions.width,
    height: dimensions.height,
  }
}

export const runImageToImageTool = async ({
  runId,
  prompt,
  insertHint,
  referenceDataUrls = [],
  geminiConnectionOverride,
}: RunImageToolParams): Promise<GeminiImageResult & { width: number; height: number }> => {
  if (referenceDataUrls.length === 0) {
    throw new Error('missing_reference_image')
  }

  if (!resolveServerGeminiConnection(geminiConnectionOverride).apiKey) {
    throw new Error('image_to_image_requires_gemini')
  }

  const dimensions = resolveDimensions(insertHint)
  const result = await requestGeminiImage(
    prompt,
    insertHint,
    referenceDataUrls,
    runId,
    geminiConnectionOverride
  )
  return {
    ...result,
    ...dimensions,
  }
}
