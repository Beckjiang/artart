import type { TLBinding, TLImageShape, TLShape, TLTextShape } from 'tldraw'
import { IMAGE_ASPECT_RATIOS } from '../../lib/imageGeneration'
import type { ImageAspectRatio, ImageGenerationSize, ImageGeneratorModel } from '../../lib/imageGeneration'
import {
  DEFAULT_GENERATOR_ASPECT_RATIO,
  DEFAULT_GENERATOR_IMAGE_COUNT,
  DEFAULT_GENERATOR_IMAGE_MODEL,
  DEFAULT_GENERATOR_IMAGE_SIZE,
  DEFAULT_SIDEBAR_WIDTH,
  GENERATOR_ROLE,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MIN_WORKBENCH_CANVAS_WIDTH,
  SIDEBAR_OPEN_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
  TASK_TARGET_REMOVED,
} from './constants'
import type { GeneratorShapeMeta, PageBounds, ScreenBounds, TaskStatus } from './types'

export const getInitialViewportWidth = () =>
  typeof window === 'undefined' ? 1280 : window.innerWidth

export const WORKBENCH_TEXT_TOOL_FONT_SIZE = 16
export const TLDRAW_SMALL_TEXT_FONT_SIZE = 18
export const WORKBENCH_TEXT_TOOL_SCALE = WORKBENCH_TEXT_TOOL_FONT_SIZE / TLDRAW_SMALL_TEXT_FONT_SIZE

const DEFAULT_TEXT_TOOL_WIDTH = 20

const isEmptyRichTextDocument = (richText: TLTextShape['props']['richText']) => {
  if (richText.type !== 'doc' || richText.content.length !== 1) {
    return false
  }

  const [firstBlock] = richText.content
  if (!firstBlock || typeof firstBlock !== 'object') {
    return false
  }

  const paragraphBlock = firstBlock as { type?: unknown; content?: unknown }
  if (paragraphBlock.type !== 'paragraph') {
    return false
  }

  if (paragraphBlock.content == null) {
    return true
  }

  return Array.isArray(paragraphBlock.content) && paragraphBlock.content.length === 0
}

const isDefaultNewTextShape = (shape: TLShape): shape is TLTextShape => {
  if (shape.type !== 'text') {
    return false
  }

  return (
    shape.props.size === 'm' &&
    shape.props.scale === 1 &&
    shape.props.autoSize === true &&
    shape.props.w === DEFAULT_TEXT_TOOL_WIDTH &&
    isEmptyRichTextDocument(shape.props.richText)
  )
}

export const normalizeCreatedTextShapeForWorkbench = (
  shape: TLShape,
  source: 'remote' | 'user',
  currentToolId: string
): TLShape => {
  if (source !== 'user' || currentToolId !== 'text' || !isDefaultNewTextShape(shape)) {
    return shape
  }

  return {
    ...shape,
    props: {
      ...shape.props,
      size: 's',
      scale: WORKBENCH_TEXT_TOOL_SCALE,
    },
  }
}

export const shouldBringCreatedArrowToFrontInWorkbench = (
  shape: TLShape,
  source: 'remote' | 'user',
  currentToolId: string
) => source === 'user' && currentToolId === 'arrow' && shape.type === 'arrow'

export const shouldRemoveArrowImageBindingInWorkbench = (
  binding: TLBinding,
  source: 'remote' | 'user',
  fromShape: TLShape | null | undefined,
  toShape: TLShape | null | undefined
) =>
  source === 'user' &&
  binding.type === 'arrow' &&
  fromShape?.type === 'arrow' &&
  toShape?.type === 'image'

export const getMaxSidebarWidth = (viewportWidth: number) => {
  return Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(MAX_SIDEBAR_WIDTH, Math.round(viewportWidth - MIN_WORKBENCH_CANVAS_WIDTH))
  )
}

export const clampSidebarWidth = (width: number, viewportWidth = getInitialViewportWidth()) => {
  return Math.min(getMaxSidebarWidth(viewportWidth), Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)))
}

export const readStoredSidebarWidth = (viewportWidth = getInitialViewportWidth()) => {
  if (typeof window === 'undefined') {
    return clampSidebarWidth(DEFAULT_SIDEBAR_WIDTH, viewportWidth)
  }

  try {
    const rawValue = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    if (!rawValue) {
      return clampSidebarWidth(DEFAULT_SIDEBAR_WIDTH, viewportWidth)
    }

    const parsed = Number(rawValue)
    if (!Number.isFinite(parsed)) {
      return clampSidebarWidth(DEFAULT_SIDEBAR_WIDTH, viewportWidth)
    }

    return clampSidebarWidth(parsed, viewportWidth)
  } catch {
    return clampSidebarWidth(DEFAULT_SIDEBAR_WIDTH, viewportWidth)
  }
}

export const readStoredSidebarOpenPreference = (): boolean | null => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY)
    if (!rawValue) return null

    const normalized = rawValue.trim().toLowerCase()
    if (normalized === '1' || normalized === 'true') return true
    if (normalized === '0' || normalized === 'false') return false
    return null
  } catch {
    return null
  }
}

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

export const createTaskId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `task-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
}

export const createPlaceholderDataUrl = (label: string, width: number, height: number) => {
  const safeLabel = label.replace(/[<>&'"]/g, '')
  const iconScale = Math.max(0.4, Math.min(width, height) / 720)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f5f8ff" />
          <stop offset="100%" stop-color="#ecf1fb" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="url(#bg)" />
      <rect x="16" y="16" width="${Math.max(96, width - 32)}" height="${Math.max(
        24,
        height - 32
      )}" fill="none" stroke="#84a0d5" stroke-width="2" stroke-dasharray="8 6" rx="12" />
      <g transform="translate(${width / 2}, ${height / 2 - 16}) scale(${iconScale})" opacity="0.28">
        <path d="M-128 86c-10 0-18-8-18-18 0-3 1-7 3-9l94-132c4-6 11-9 18-9 7 0 14 3 18 9L18 0l26-35c4-5 10-8 16-8 7 0 13 3 17 9l67 92c6 8 4 20-4 25-3 2-7 3-10 3H-128Z" fill="#8f96a8"/>
        <circle cx="34" cy="-96" r="26" fill="#8f96a8" />
      </g>
      <text x="50%" y="${Math.max(42, height - 38)}" dominant-baseline="middle" text-anchor="middle"
        font-size="${Math.max(16, Math.round(18 * iconScale))}" font-family="Segoe UI, PingFang SC, sans-serif" fill="#3b4c71">
        ${safeLabel}
      </text>
    </svg>
  `
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const getSingleSelectedImage = (shape: unknown): TLImageShape | null => {
  if (!shape || typeof shape !== 'object') return null
  const candidate = shape as TLImageShape
  if (candidate.type !== 'image') return null
  return candidate
}

export const getScreenBounds = (bounds: unknown): ScreenBounds | null => {
  if (!bounds || typeof bounds !== 'object') return null

  const candidate = bounds as {
    x?: number
    y?: number
    w?: number
    h?: number
    minX?: number
    minY?: number
    maxX?: number
    maxY?: number
    midX?: number
  }

  const leftValue = candidate.minX ?? candidate.x
  const topValue = candidate.minY ?? candidate.y
  const widthValue = candidate.w
  const heightValue = candidate.h

  const left = Number(leftValue)
  const top = Number(topValue)
  const width = Number(widthValue)
  const height = Number(heightValue)

  if (
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null
  }

  return {
    left,
    top,
    right: Number.isFinite(candidate.maxX) ? Number(candidate.maxX) : left + width,
    bottom: Number.isFinite(candidate.maxY) ? Number(candidate.maxY) : top + height,
    midX: Number.isFinite(candidate.midX) ? Number(candidate.midX) : left + width / 2,
    width,
    height,
  }
}

export const getPageBounds = (bounds: unknown): PageBounds | null => {
  if (!bounds || typeof bounds !== 'object') return null

  const candidate = bounds as {
    x?: number
    y?: number
    w?: number
    h?: number
    minX?: number
    minY?: number
    maxX?: number
  }

  const xValue = candidate.minX ?? candidate.x
  const yValue = candidate.minY ?? candidate.y
  const widthValue = candidate.w
  const heightValue = candidate.h

  const x = Number(xValue)
  const y = Number(yValue)
  const w = Number(widthValue)
  const h = Number(heightValue)

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return null
  }

  return {
    x,
    y,
    w,
    h,
    minY: Number.isFinite(candidate.minY) ? Number(candidate.minY) : y,
    maxX: Number.isFinite(candidate.maxX) ? Number(candidate.maxX) : x + w,
  }
}

export const isGeneratorShape = (shape: TLImageShape | null | undefined): shape is TLImageShape => {
  if (!shape) return false
  return shape.meta?.canvasRole === GENERATOR_ROLE
}

const normalizeGeneratorImageCount = (value: unknown): number => {
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN

  if (!Number.isFinite(numeric)) {
    return DEFAULT_GENERATOR_IMAGE_COUNT
  }

  return Math.max(1, Math.min(4, Math.round(numeric)))
}

export const getGeneratorMeta = (shape: TLImageShape | null | undefined): GeneratorShapeMeta | null => {
  if (!isGeneratorShape(shape)) return null

  const aspectRatio = shape.meta?.aspectRatio
  const lastPrompt = shape.meta?.lastPrompt
  const normalizedAspectRatio =
    typeof aspectRatio === 'string' && IMAGE_ASPECT_RATIOS.includes(aspectRatio as ImageAspectRatio)
      ? (aspectRatio as ImageAspectRatio)
      : DEFAULT_GENERATOR_ASPECT_RATIO

  return {
    canvasRole: GENERATOR_ROLE,
    aspectRatio: normalizedAspectRatio,
    lastPrompt: typeof lastPrompt === 'string' ? lastPrompt : '',
    imageModel:
      typeof shape.meta?.imageModel === 'string'
        ? (shape.meta.imageModel as ImageGeneratorModel)
        : DEFAULT_GENERATOR_IMAGE_MODEL,
    imageSize:
      typeof shape.meta?.imageSize === 'string'
        ? (shape.meta.imageSize as ImageGenerationSize)
        : DEFAULT_GENERATOR_IMAGE_SIZE,
    imageCount: normalizeGeneratorImageCount(shape.meta?.imageCount),
  }
}

export const createGeneratorMeta = (
  aspectRatio: ImageAspectRatio,
  lastPrompt = '',
  imageModel?: ImageGeneratorModel,
  imageSize?: ImageGenerationSize,
  imageCount?: number
): GeneratorShapeMeta => ({
  canvasRole: GENERATOR_ROLE,
  aspectRatio,
  lastPrompt,
  imageModel: imageModel ?? DEFAULT_GENERATOR_IMAGE_MODEL,
  imageSize: imageSize ?? DEFAULT_GENERATOR_IMAGE_SIZE,
  imageCount: normalizeGeneratorImageCount(imageCount),
})

export const formatTaskStatus = (status: TaskStatus) => {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'succeeded':
      return 'Done'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}

export const isAbortError = (error: unknown) =>
  error instanceof DOMException
    ? error.name === 'AbortError'
    : Boolean(
        error &&
          typeof error === 'object' &&
          'name' in error &&
          (error as { name?: string }).name === 'AbortError'
      )

export const createTaskTargetRemovedError = () => {
  const error = new Error('目标生成卡片已被删除')
  error.name = TASK_TARGET_REMOVED
  return error
}

export const isTaskTargetRemovedError = (error: unknown) =>
  error instanceof Error && error.name === TASK_TARGET_REMOVED

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取参考图失败'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })

export const fetchImageBlob = async (source: string, signal?: AbortSignal): Promise<Blob> => {
  try {
    const response = await fetch(source, {
      signal,
      cache: 'no-store',
      mode: 'cors',
    })
    if (!response.ok) {
      throw new Error(`下载图片失败（${response.status}）`)
    }
    return response.blob()
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new Error('下载图片失败')
  }
}

export const getImageDimensions = (
  imageUrl: string,
  signal?: AbortSignal
): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new window.Image()
    let done = false

    const cleanup = () => {
      image.onload = null
      image.onerror = null
      if (signal) {
        signal.removeEventListener('abort', handleAbort)
      }
    }

    const finish = (result: { width: number; height: number }) => {
      if (done) return
      done = true
      cleanup()
      resolve(result)
    }

    const fail = (error: Error) => {
      if (done) return
      done = true
      cleanup()
      reject(error)
    }

    const handleAbort = () => {
      fail(new DOMException('The operation was aborted', 'AbortError'))
    }

    if (signal?.aborted) {
      handleAbort()
      return
    }

    image.onload = () => {
      finish({
        width: Math.max(1, image.naturalWidth || image.width || 1),
        height: Math.max(1, image.naturalHeight || image.height || 1),
      })
    }
    image.onerror = () => {
      fail(new Error('读取生成图片尺寸失败'))
    }

    if (signal) {
      signal.addEventListener('abort', handleAbort, { once: true })
    }

    image.decoding = 'async'
    image.src = imageUrl
  })

export const maybePadImageToTargetRatio = async (
  imageUrl: string,
  targetWidth: number,
  targetHeight: number,
  signal?: AbortSignal
): Promise<{ imageUrl: string; width: number; height: number; mimeType: string }> => {
  const sourceBlob = await fetchImageBlob(imageUrl, signal)
  const objectUrl = URL.createObjectURL(sourceBlob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image()
      let done = false

      const cleanup = () => {
        element.onload = null
        element.onerror = null
        signal?.removeEventListener('abort', handleAbort)
      }

      const finish = () => {
        if (done) return
        done = true
        cleanup()
        resolve(element)
      }

      const fail = (error: Error) => {
        if (done) return
        done = true
        cleanup()
        reject(error)
      }

      const handleAbort = () => {
        fail(new DOMException('The operation was aborted', 'AbortError'))
      }

      if (signal?.aborted) {
        handleAbort()
        return
      }

      element.onload = finish
      element.onerror = () => fail(new Error('读取生成图片失败'))
      signal?.addEventListener('abort', handleAbort, { once: true })
      element.decoding = 'async'
      element.src = objectUrl
    })

    const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1)
    const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1)
    const targetRatio = Math.max(1, targetWidth) / Math.max(1, targetHeight)
    const sourceRatio = sourceWidth / sourceHeight

    if (Math.abs(sourceRatio - targetRatio) <= 0.01) {
      return {
        imageUrl,
        width: sourceWidth,
        height: sourceHeight,
        mimeType: sourceBlob.type || 'image/png',
      }
    }

    let canvasWidth = sourceWidth
    let canvasHeight = sourceHeight

    if (targetRatio > sourceRatio) {
      canvasWidth = Math.max(1, Math.round(sourceHeight * targetRatio))
    } else {
      canvasHeight = Math.max(1, Math.round(sourceWidth / targetRatio))
    }

    const canvas = document.createElement('canvas')
    canvas.width = canvasWidth
    canvas.height = canvasHeight
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('无法创建画布上下文')
    }

    const drawX = Math.round((canvasWidth - sourceWidth) / 2)
    const drawY = Math.round((canvasHeight - sourceHeight) / 2)

    context.clearRect(0, 0, canvasWidth, canvasHeight)
    context.drawImage(image, drawX, drawY, sourceWidth, sourceHeight)

    const paddedBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    )

    if (!paddedBlob) {
      throw new Error('生成补边图片失败')
    }

    return {
      imageUrl: await blobToDataUrl(paddedBlob),
      width: canvasWidth,
      height: canvasHeight,
      mimeType: 'image/png',
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
