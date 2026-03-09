import { generateImageWithGateway } from '../../modelGateway'
import type { CanvasInsertHint } from '../../src/lib/agentChatTypes'
import { getEnvValue, hasGeminiImageConfig } from './env'

type GeminiImageResult = {
  dataUrl: string
  mimeType: string
}

type RunImageToolParams = {
  prompt: string
  insertHint?: CanvasInsertHint | null
  referenceDataUrls?: string[]
}

const IMAGE_MODEL_FALLBACK = 'gemini-3.1-flash-image-preview'
const IMAGE_SIZE_FALLBACK = '2K'
const GEMINI_API_VERSION_PATH = '/v1beta'
const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '')

const ensureGeminiApiBaseUrl = (value: string) => {
  const normalized = normalizeBaseUrl(value)
  if (!/^https?:\/\//i.test(normalized)) return normalized

  try {
    const parsed = new URL(normalized)
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = GEMINI_API_VERSION_PATH
    }
    return normalizeBaseUrl(parsed.toString())
  } catch {
    return normalized
  }
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
  referenceDataUrls: string[] = []
): Promise<GeminiImageResult> => {
  const apiKey = getEnvValue('VITE_GEMINI_API_KEY') || getEnvValue('VITE_UNIAPI_API_KEY')
  if (!apiKey) {
    throw new Error('missing_gemini_api_key')
  }

  const baseUrl = ensureGeminiApiBaseUrl(
    getEnvValue('VITE_GEMINI_BASE_URL') || getEnvValue('VITE_UNIAPI_BASE_URL') || GEMINI_DEFAULT_BASE_URL
  )
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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: prompt.trim() || (referenceParts.length > 0 ? 'Edit this image.' : 'Generate an image.'),
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
    }),
  })

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>
    error?: { message?: string }
  }

  if (!response.ok) {
    throw new Error(payload.error?.message || `gemini_http_${response.status}`)
  }

  const imagePart = payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .find((part) => part.inlineData?.data)

  const mimeType = imagePart?.inlineData?.mimeType || 'image/png'
  const data = imagePart?.inlineData?.data
  if (!data) {
    throw new Error('gemini_image_missing')
  }

  return {
    dataUrl: `data:${mimeType};base64,${data}`,
    mimeType,
  }
}

export const runTextToImageTool = async ({
  prompt,
  insertHint,
}: RunImageToolParams): Promise<GeminiImageResult & { width: number; height: number }> => {
  const dimensions = resolveDimensions(insertHint)

  if (hasGeminiImageConfig()) {
    const result = await requestGeminiImage(prompt, insertHint)
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
  prompt,
  insertHint,
  referenceDataUrls = [],
}: RunImageToolParams): Promise<GeminiImageResult & { width: number; height: number }> => {
  if (referenceDataUrls.length === 0) {
    throw new Error('missing_reference_image')
  }

  if (!hasGeminiImageConfig()) {
    throw new Error('image_to_image_requires_gemini')
  }

  const dimensions = resolveDimensions(insertHint)
  const result = await requestGeminiImage(prompt, insertHint, referenceDataUrls)
  return {
    ...result,
    ...dimensions,
  }
}
