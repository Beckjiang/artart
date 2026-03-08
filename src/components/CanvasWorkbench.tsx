import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AssetRecordType,
  GeoShapeGeoStyle,
  createShapeId,
  useEditor,
  useTools,
  useValue,
} from 'tldraw'
import type { TLImageShape, TLImageShapeProps } from 'tldraw'
import { archiveDebugImages } from '../lib/debugImageArchive'
import { deleteBoard, renameBoard, touchBoard } from '../lib/boards'
import type { BoardMeta } from '../lib/boards'
import {
  generateImageFromPrompt,
  IMAGE_ASPECT_RATIOS,
  IMAGE_GENERATION_SIZES,
  IMAGE_GENERATOR_MODELS,
  pickNearestImageAspectRatio,
  resolveGeminiImageDefaults,
} from '../lib/imageGeneration'
import type {
  ImageAspectRatio,
  ImageGenerationSize,
  ImageGeneratorModel,
} from '../lib/imageGeneration'
import {
  getSelectionImagineSourceImage,
  getGeneratorCardPlacement,
  getGeneratorCardSize,
  getInsertPlacement,
  resolveAssistantMode,
  shouldRecreateTaskTarget,
} from '../lib/workbenchGeneration'
import type { AssistantMode, GenerationTaskOrigin } from '../lib/workbenchGeneration'
import { CameraAngleDialog } from './CameraAngleDialog'
import { DEFAULT_CAMERA_VIEW, buildCameraAnglePrompt } from '../lib/cameraAngle'
import type { CameraRunState, CameraViewDraft } from '../lib/cameraAngle'
import {
  DEFAULT_MASK_FEATHER_PX,
  buildSemanticMaskPrompt,
  compositeMaskedEditResult,
  drawMaskStrokes,
  prepareMaskedEditAssets,
} from '../lib/maskedImageEdit'
import type {
  MaskBounds,
  MaskStrokeMode,
  NormalizedMaskStroke,
} from '../lib/maskedImageEdit'

const INSERT_GAP = 40
const MAX_TASKS = 16
const SIDEBAR_WIDTH = 360
const BOARD_TOUCH_DEBOUNCE = 1200
const DEFAULT_GENERATOR_ASPECT_RATIO: ImageAspectRatio = '1:1'
const {
  imageModel: DEFAULT_GENERATOR_IMAGE_MODEL,
  imageSize: DEFAULT_GENERATOR_IMAGE_SIZE,
} = resolveGeminiImageDefaults(import.meta.env)
const GENERATOR_ROLE = 'image-generator'
const GENERATOR_PLACEHOLDER_LABEL = 'Image Generator'
const GENERATED_IMAGE_ROLE = 'generated-image'
const TASK_TARGET_REMOVED = 'TASK_TARGET_REMOVED'
const SELECTION_IMAGINE_PROMPT = '根据图片标注信息生成图片'
const MASK_BRUSH_SIZES = [8, 16, 24, 32] as const

const IMAGE_GENERATOR_MODEL_LABELS: Record<ImageGeneratorModel, string> = {
  'gemini-3-pro-image-preview': 'Gemini 3 Pro',
  'gemini-3.1-flash-image-preview': 'Gemini 3.1 Flash',
}

type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
type GenerationTaskMaskMode = 'semantic-crop'

type ToolId = 'select' | 'frame' | 'rectangle' | 'text' | 'draw' | 'asset'
type ToolIconId = ToolId | 'generator'

type ScreenBounds = {
  left: number
  top: number
  right: number
  bottom: number
  midX: number
  width: number
  height: number
}

type PageBounds = {
  x: number
  y: number
  w: number
  h: number
  minY: number
  maxX: number
}

type ShapeMetaValue = string | number | boolean | null

type ShapeMeta = Record<string, ShapeMetaValue>

type GeneratorShapeMeta = {
  canvasRole: typeof GENERATOR_ROLE
  aspectRatio: ImageAspectRatio
  lastPrompt: string
  imageModel: ImageGeneratorModel
  imageSize: ImageGenerationSize
}

type CameraSourceSize = {
  width: number
  height: number
}

export type AssistantActionPreset =
  | 'text-to-image'
  | 'imagine-selection'
  | 'quick-edit'
  | 'remove-bg'
  | 'remove-object'
  | 'edit-elements'
  | 'edit-text'

type ImageEditActionPreset = Exclude<AssistantActionPreset, 'text-to-image' | 'imagine-selection'>

type GenerationTask = {
  id: string
  mode: Extract<AssistantMode, 'image-edit' | 'image-generator' | 'selection-imagine'>
  origin: GenerationTaskOrigin
  prompt: string
  aspectRatio: ImageAspectRatio
  imageModel?: ImageGeneratorModel
  imageSize?: ImageGenerationSize
  status: TaskStatus
  error?: string
  width: number
  height: number
  insertX: number
  insertY: number
  targetShapeId: TLImageShape['id']
  referenceImageUrl?: string
  referenceImageUrls?: string[]
  referenceImageMimeType?: string | null
  referenceImageMimeTypes?: Array<string | null>
  sourceShapeId?: TLImageShape['id']
  sourceAction: AssistantActionPreset
  maskMode?: GenerationTaskMaskMode
  maskBounds?: MaskBounds
  maskImageUrl?: string
  sourceSnapshotUrl?: string
  sourceSnapshotWidth?: number
  sourceSnapshotHeight?: number
  compositeFeatherPx?: number
  resultShapeId?: TLImageShape['id']
  retries: number
  createdAt: number
  updatedAt: number
  abortController?: AbortController
}

type CanvasWorkbenchProps = {
  board: BoardMeta
  onBoardMetaChange?: () => void
}

type PresetDefinition = {
  label: string
  helper: string
  defaultPrompt: string
  placeholder: string
}

type ToolItem = {
  id: ToolId
  label: string
  icon: ToolIconId
}

const ACTION_PRESETS: Record<AssistantActionPreset, PresetDefinition> = {
  'text-to-image': {
    label: 'Text to image',
    helper: '不使用参考图，直接根据提示词生成并插入一张新图片。',
    defaultPrompt: '',
    placeholder: 'Describe what you want to create today',
  },
  'imagine-selection': {
    label: 'Imagine',
    helper: '将当前多选元素合成为一张参考图，再生成新的融合结果。',
    defaultPrompt: SELECTION_IMAGINE_PROMPT,
    placeholder: SELECTION_IMAGINE_PROMPT,
  },
  'quick-edit': {
    label: 'Quick Edit',
    helper: '自由描述想修改的内容，保持现有图像作为参考。',
    defaultPrompt: '',
    placeholder: '描述想如何编辑这张图片，例如：增强立体感、调整配色、让 logo 更适合面试封面。',
  },
  'remove-bg': {
    label: 'Remove bg',
    helper: '去除背景并保留主体，适合快速做纯底或透明感素材。',
    defaultPrompt: '请去除这张图片的背景并保留主体，保持主体边缘自然清晰，输出干净简洁的背景效果。',
    placeholder: '补充你的背景处理要求，例如：纯白背景、透明背景、电商主图风格。',
  },
  'remove-object': {
    label: 'Remove object',
    helper: '移除干扰元素并自动补全背景。',
    defaultPrompt: '请移除图片中的指定对象或干扰元素，并自然补全背景与纹理，保持整体风格一致。需要移除的对象：',
    placeholder: '说明要移除什么，例如：右上角文字、水印、多余人物、背景杂物。',
  },
  'edit-elements': {
    label: 'Edit elements',
    helper: '保持风格不变，替换或修改局部元素。',
    defaultPrompt: '请保持整体风格和构图，按以下要求修改或替换局部元素，使结果自然协调：',
    placeholder: '说明要替换或新增的元素，例如：把背景改成极简灰色、把图标换成几何风。',
  },
  'edit-text': {
    label: 'Edit text',
    helper: '保持版式和视觉风格，修改图片中的文字内容。',
    defaultPrompt: '请保持原有版式与视觉风格，按以下要求修改图片中的文字内容，并保证字体和排版自然统一：',
    placeholder: '输入新的文案要求，例如：将主标题改成“Realtime Copilot”。',
  },
}

const IMAGE_EDIT_PRESETS: ImageEditActionPreset[] = [
  'quick-edit',
  'remove-bg',
  'remove-object',
  'edit-elements',
  'edit-text',
]

const TOOL_ITEMS: ToolItem[] = [
  { id: 'select', label: '选择', icon: 'select' },
  { id: 'frame', label: '画框', icon: 'frame' },
  { id: 'rectangle', label: '矩形', icon: 'rectangle' },
  { id: 'text', label: '文本', icon: 'text' },
  { id: 'draw', label: '画笔', icon: 'draw' },
  { id: 'asset', label: '媒体', icon: 'asset' },
]

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const createTaskId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `task-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
}

const createPlaceholderDataUrl = (label: string, width: number, height: number) => {
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

const getSingleSelectedImage = (shape: unknown): TLImageShape | null => {
  if (!shape || typeof shape !== 'object') return null
  const candidate = shape as TLImageShape
  if (candidate.type !== 'image') return null
  return candidate
}

const getScreenBounds = (bounds: unknown): ScreenBounds | null => {
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

const getPageBounds = (bounds: unknown): PageBounds | null => {
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

const isGeneratorShape = (shape: TLImageShape | null | undefined): shape is TLImageShape => {
  if (!shape) return false
  return shape.meta?.canvasRole === GENERATOR_ROLE
}

const getGeneratorMeta = (shape: TLImageShape | null | undefined): GeneratorShapeMeta | null => {
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
      typeof shape.meta?.imageModel === 'string' &&
      IMAGE_GENERATOR_MODELS.includes(shape.meta.imageModel as ImageGeneratorModel)
        ? (shape.meta.imageModel as ImageGeneratorModel)
        : DEFAULT_GENERATOR_IMAGE_MODEL,
    imageSize:
      typeof shape.meta?.imageSize === 'string' &&
      IMAGE_GENERATION_SIZES.includes(shape.meta.imageSize as ImageGenerationSize)
        ? (shape.meta.imageSize as ImageGenerationSize)
        : DEFAULT_GENERATOR_IMAGE_SIZE,
  }
}

const createGeneratorMeta = (
  aspectRatio: ImageAspectRatio,
  lastPrompt = '',
  imageModel: ImageGeneratorModel = DEFAULT_GENERATOR_IMAGE_MODEL,
  imageSize: ImageGenerationSize = DEFAULT_GENERATOR_IMAGE_SIZE
): GeneratorShapeMeta => ({
  canvasRole: GENERATOR_ROLE,
  aspectRatio,
  lastPrompt,
  imageModel,
  imageSize,
})

const formatTaskStatus = (status: TaskStatus) => {
  switch (status) {
    case 'queued':
      return '排队中'
    case 'running':
      return '生成中'
    case 'succeeded':
      return '成功'
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
    default:
      return status
  }
}

const isAbortError = (error: unknown) =>
  error instanceof DOMException
    ? error.name === 'AbortError'
    : typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name?: string }).name === 'AbortError'

const createTaskTargetRemovedError = () => {
  const error = new Error('目标生成卡片已被删除')
  error.name = TASK_TARGET_REMOVED
  return error
}

const isTaskTargetRemovedError = (error: unknown) =>
  error instanceof Error && error.name === TASK_TARGET_REMOVED

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取参考图失败'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })

const fetchImageBlob = async (source: string, signal?: AbortSignal): Promise<Blob> => {
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

const getImageDimensions = (
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

const maybePadImageToTargetRatio = async (
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

function ToolbarIcon({ icon }: { icon: ToolIconId }) {
  const commonProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (icon) {
    case 'select':
      return (
        <svg {...commonProps}>
          <path d="M5 4L10.8 18.2L13.8 11.8L20 8.8L5 4Z" />
        </svg>
      )
    case 'frame':
      return (
        <svg {...commonProps}>
          <path d="M8 4H10" />
          <path d="M14 4H16" />
          <path d="M8 20H10" />
          <path d="M14 20H16" />
          <path d="M4 8V10" />
          <path d="M4 14V16" />
          <path d="M20 8V10" />
          <path d="M20 14V16" />
          <rect x="7" y="7" width="10" height="10" rx="1.5" />
        </svg>
      )
    case 'rectangle':
      return (
        <svg {...commonProps}>
          <rect x="4.5" y="5.5" width="15" height="13" rx="3" />
        </svg>
      )
    case 'text':
      return (
        <svg {...commonProps}>
          <path d="M5 6H19" />
          <path d="M12 6V18" />
          <path d="M8 18H16" />
        </svg>
      )
    case 'draw':
      return (
        <svg {...commonProps}>
          <path d="M4 17.5L14.2 7.3C15.4 6.1 17.3 6.1 18.5 7.3C19.7 8.5 19.7 10.4 18.5 11.6L8.2 21H4V17.5Z" />
          <path d="M13 8.5L17.5 13" />
        </svg>
      )
    case 'asset':
      return (
        <svg {...commonProps}>
          <rect x="4" y="5" width="16" height="14" rx="2.5" />
          <path d="M7.5 14L10.7 10.8L13.6 13.7L15.6 11.7L18.5 14.6" />
          <circle cx="15.8" cy="9" r="1.4" />
        </svg>
      )
    case 'generator':
      return (
        <svg {...commonProps}>
          <rect x="4" y="5" width="14" height="12" rx="2.5" />
          <path d="M7.5 13L10.4 10.1L13.1 12.8L15.3 10.6L18 13.3" />
          <path d="M18.5 5.5L19.2 7.1L20.8 7.8L19.2 8.5L18.5 10.1L17.8 8.5L16.2 7.8L17.8 7.1L18.5 5.5Z" />
        </svg>
      )
    default:
      return null
  }
}

export function CanvasWorkbench({ board, onBoardMetaChange }: CanvasWorkbenchProps) {
  const editor = useEditor()
  const tools = useTools()
  const navigate = useNavigate()

  const [sidebarPrompt, setSidebarPrompt] = useState('')
  const [sidebarError, setSidebarError] = useState('')
  const [generatorPrompt, setGeneratorPrompt] = useState('')
  const [generatorError, setGeneratorError] = useState('')
  const [selectionImagineError, setSelectionImagineError] = useState('')
  const [selectionImaginePending, setSelectionImaginePending] = useState(false)
  const [tasks, setTasks] = useState<GenerationTask[]>([])
  const [selectedPreviewSrc, setSelectedPreviewSrc] = useState('')
  const [activePreset, setActivePreset] = useState<ImageEditActionPreset>('quick-edit')
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(() => board.title)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [sidebarAspectRatioOverride, setSidebarAspectRatioOverride] = useState<{
    shapeId: TLImageShape['id'] | null
    ratio: ImageAspectRatio
  } | null>(null)
  const [isCameraAngleOpen, setIsCameraAngleOpen] = useState(false)
  const [cameraSourceShapeId, setCameraSourceShapeId] = useState<TLImageShape['id'] | null>(null)
  const [cameraSourcePreviewUrl, setCameraSourcePreviewUrl] = useState('')
  const [cameraReferenceImageUrl, setCameraReferenceImageUrl] = useState('')
  const [cameraReferenceImageMimeType, setCameraReferenceImageMimeType] = useState<string | null>(null)
  const [cameraSourceLoading, setCameraSourceLoading] = useState(false)
  const [cameraSourceSize, setCameraSourceSize] = useState<CameraSourceSize>({ width: 0, height: 0 })
  const [cameraRunStatus, setCameraRunStatus] = useState<CameraRunState>('idle')
  const [cameraDraftView, setCameraDraftView] = useState<CameraViewDraft>(DEFAULT_CAMERA_VIEW)
  const [cameraGeneratedPreviewUrl, setCameraGeneratedPreviewUrl] = useState('')
  const [cameraGeneratedMimeType, setCameraGeneratedMimeType] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState('')
  const [cameraAbortController, setCameraAbortController] = useState<AbortController | null>(null)
  const [maskEnabled, setMaskEnabled] = useState(false)
  const [showMaskOverlay, setShowMaskOverlay] = useState(true)
  const [maskTool, setMaskTool] = useState<MaskStrokeMode>('paint')
  const [maskBrushSize, setMaskBrushSize] = useState<number>(24)
  const [maskStrokes, setMaskStrokes] = useState<NormalizedMaskStroke[]>([])
  const [maskStageSize, setMaskStageSize] = useState({ width: 0, height: 0 })

  const titleInputRef = useRef<HTMLInputElement>(null)
  const sidebarPromptInputRef = useRef<HTMLTextAreaElement>(null)
  const generatorPromptInputRef = useRef<HTMLTextAreaElement>(null)
  const maskPreviewStageRef = useRef<HTMLDivElement>(null)
  const maskPreviewCanvasRef = useRef<HTMLCanvasElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const boardTouchTimerRef = useRef<number | null>(null)
  const tasksRef = useRef<GenerationTask[]>(tasks)
  const cameraAbortControllerRef = useRef<AbortController | null>(null)
  const cameraAngleSessionRef = useRef(0)
  const activeMaskPointerRef = useRef<number | null>(null)

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  useEffect(() => {
    cameraAbortControllerRef.current = cameraAbortController
  }, [cameraAbortController])

  useEffect(() => {
    return () => {
      cameraAngleSessionRef.current += 1
      cameraAbortControllerRef.current?.abort()
    }
  }, [])

  const currentToolId = useValue(
    'workbench-current-tool',
    () => String(editor.getCurrentToolId()).split('.')[0],
    [editor]
  )

  const currentGeo = useValue(
    'workbench-current-geo',
    () => editor.getSharedStyles().getAsKnownValue(GeoShapeGeoStyle),
    [editor]
  )

  const zoomPercent = useValue(
    'workbench-zoom-percent',
    () => Math.max(1, Math.round(editor.getZoomLevel() * 100)),
    [editor]
  )

  const selectionState = useValue(
    'workbench-selection-state',
    () => {
      const selectedShapes = editor.getSelectedShapes()
      const selectedShapeIds = editor.getSelectedShapeIds()
      const onlySelectedShape = editor.getOnlySelectedShape()
      const selectedImage = getSingleSelectedImage(onlySelectedShape)
      const selectedCount = selectedShapeIds.length
      const hasAnySelectedImage = selectedShapes.some((shape) => shape.type === 'image')
      const firstSelectedImage = getSelectionImagineSourceImage(
        selectedShapes.flatMap((shape) => {
          if (shape.type !== 'image') return []

          const imageShape = shape as TLImageShape
          return [
            {
              shapeId: imageShape.id,
              width: imageShape.props.w,
              height: imageShape.props.h,
              isGenerator: isGeneratorShape(imageShape),
            },
          ]
        })
      )
      const hasSelectedGeneratorCard = selectedShapes.some(
        (shape) => shape.type === 'image' && isGeneratorShape(shape as TLImageShape)
      )
      const isLocked = Boolean(selectedImage?.isLocked)
      const isGeneratorCard = isGeneratorShape(selectedImage)
      const assistantMode = resolveAssistantMode({
        selectedCount,
        hasAnySelectedImage,
        singleSelectedImageIsLocked: isLocked,
        singleSelectedImageIsGenerator: isGeneratorCard,
      })
      const canEditSingleImage = assistantMode === 'image-edit' && Boolean(selectedImage)
      const canShowFloatingActions =
        canEditSingleImage && editor.isInAny('select.idle', 'select.pointing_shape')
      const canImagineSelection =
        assistantMode === 'selection-imagine' &&
        Boolean(firstSelectedImage) &&
        !hasSelectedGeneratorCard &&
        editor.isInAny('select.idle', 'select.pointing_shape')
      const selectionBounds =
        selectedCount > 0 ? getScreenBounds(editor.getSelectionScreenBounds()) : null
      const selectionPageBounds =
        selectedCount > 0 ? getPageBounds(editor.getSelectionPageBounds()) : null

      return {
        selectedShapeIds,
        selectedCount,
        hasAnySelectedImage,
        firstSelectedImage,
        hasSelectedGeneratorCard,
        selectedImage,
        isLocked,
        isGeneratorCard,
        assistantMode,
        canEditSingleImage,
        canShowFloatingActions,
        canImagineSelection,
        selectionBounds,
        selectionPageBounds,
      }
    },
    [editor]
  )

  const selectedImage = selectionState.selectedImage
  const assistantMode = selectionState.assistantMode
  const selectedShapeIdsKey = useMemo(
    () => selectionState.selectedShapeIds.join(','),
    [selectionState.selectedShapeIds]
  )
  const selectedGeneratorImage = assistantMode === 'image-generator' ? selectedImage : null
  const showSidebar = assistantMode === 'image-edit' || assistantMode === 'disabled'
  const selectedSidebarImage = showSidebar ? selectedImage : null
  const selectionNeedsImagineImage =
    assistantMode === 'disabled' &&
    selectionState.selectedCount > 1 &&
    !selectionState.hasAnySelectedImage

  const runningCount = useMemo(
    () => tasks.filter((task) => task.status === 'running').length,
    [tasks]
  )
  const queueCount = useMemo(
    () => tasks.filter((task) => task.status === 'queued').length,
    [tasks]
  )
  const successCount = useMemo(
    () => tasks.filter((task) => task.status === 'succeeded').length,
    [tasks]
  )

  const sidebarAspectRatio = useMemo(() => {
    if (!selectedSidebarImage) {
      return sidebarAspectRatioOverride?.ratio ?? DEFAULT_GENERATOR_ASPECT_RATIO
    }

    if (sidebarAspectRatioOverride?.shapeId === selectedSidebarImage.id) {
      return sidebarAspectRatioOverride.ratio
    }

    return pickNearestImageAspectRatio(selectedSidebarImage.props.w, selectedSidebarImage.props.h)
  }, [sidebarAspectRatioOverride, selectedSidebarImage])

  const generatorMeta = useMemo(() => getGeneratorMeta(selectedGeneratorImage), [selectedGeneratorImage])
  const selectedGeneratorTask = useMemo(
    () =>
      selectedGeneratorImage
        ? tasks.find(
            (task) =>
              task.origin === 'image-generator-card' &&
              task.targetShapeId === selectedGeneratorImage.id
          )
        : undefined,
    [selectedGeneratorImage, tasks]
  )
  const resolvedGeneratorMeta = useMemo(() => {
    if (generatorMeta) return generatorMeta
    if (!selectedGeneratorTask) return null
    return createGeneratorMeta(
      selectedGeneratorTask.aspectRatio,
      selectedGeneratorTask.prompt,
      selectedGeneratorTask.imageModel,
      selectedGeneratorTask.imageSize
    )
  }, [generatorMeta, selectedGeneratorTask])
  const generatorAspectRatio = resolvedGeneratorMeta?.aspectRatio ?? DEFAULT_GENERATOR_ASPECT_RATIO
  const generatorImageModel = resolvedGeneratorMeta?.imageModel ?? DEFAULT_GENERATOR_IMAGE_MODEL
  const generatorImageSize = resolvedGeneratorMeta?.imageSize ?? DEFAULT_GENERATOR_IMAGE_SIZE
  const activePresetDefinition = ACTION_PRESETS[activePreset]
  const canSubmitSidebarPrompt = assistantMode === 'image-edit'
  const canGenerateSidebar = canSubmitSidebarPrompt && !!sidebarPrompt.trim()
  const generatorBusy =
    selectedGeneratorTask?.status === 'queued' || selectedGeneratorTask?.status === 'running'
  const canGenerateFromCard = Boolean(selectedGeneratorImage && generatorPrompt.trim() && !generatorBusy)
  const cameraCanRun =
    isCameraAngleOpen &&
    !cameraSourceLoading &&
    Boolean(cameraReferenceImageUrl) &&
    cameraRunStatus !== 'running'
  const cameraCanConfirm = isCameraAngleOpen && Boolean(cameraGeneratedPreviewUrl)

  const scheduleBoardTouch = useCallback(() => {
    if (boardTouchTimerRef.current !== null) return

    boardTouchTimerRef.current = window.setTimeout(() => {
      boardTouchTimerRef.current = null
      const updated = touchBoard(board.id)
      if (updated) {
        onBoardMetaChange?.()
      }
    }, BOARD_TOUCH_DEBOUNCE)
  }, [board.id, onBoardMetaChange])

  useEffect(() => {
    return () => {
      if (boardTouchTimerRef.current !== null) {
        window.clearTimeout(boardTouchTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    return editor.store.listen(
      () => {
        scheduleBoardTouch()
      },
      { source: 'user', scope: 'document' }
    )
  }, [editor, scheduleBoardTouch])

  useEffect(() => {
    if (!isRenaming) return
    titleInputRef.current?.focus()
    titleInputRef.current?.select()
  }, [isRenaming])

  useEffect(() => {
    if (!isMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isMenuOpen])

  useEffect(() => {
    setGeneratorPrompt(resolvedGeneratorMeta?.lastPrompt ?? '')
    setGeneratorError('')
  }, [resolvedGeneratorMeta?.lastPrompt, selectedGeneratorImage?.id])

  useEffect(() => {
    setSelectionImagineError('')
  }, [assistantMode, selectedShapeIdsKey])

  const exportSelectedImagePreview = useCallback(
    async (shape: TLImageShape): Promise<string> => {
      const exported = await editor.toImage([shape.id], { format: 'png' })
      return blobToDataUrl(exported.blob)
    },
    [editor]
  )

  const exportSelectedImageSnapshot = useCallback(
    async (shape: TLImageShape) => {
      const exported = await editor.toImage([shape.id], { format: 'png' })
      const imageUrl = await blobToDataUrl(exported.blob)
      const dimensions = await getImageDimensions(imageUrl)

      return {
        imageUrl,
        mimeType: 'image/png' as const,
        width: dimensions.width,
        height: dimensions.height,
      }
    },
    [editor]
  )

  useEffect(() => {
    let disposed = false

    const syncPreview = async () => {
      if (!selectedSidebarImage) {
        setSelectedPreviewSrc('')
        return
      }

      const selectedAsset =
        selectedSidebarImage.props.assetId && editor.getAsset(selectedSidebarImage.props.assetId)

      if (selectedAsset && selectedAsset.type === 'image') {
        const assetWidth = Math.max(1, selectedAsset.props.w || selectedSidebarImage.props.w || 48)
        const previewScale = Math.min(1, 96 / assetWidth)

        try {
          const resolvedUrl = await editor.resolveAssetUrl(selectedAsset.id, {
            screenScale: previewScale,
            shouldResolveToOriginal: false,
          })
          if (!disposed && resolvedUrl) {
            setSelectedPreviewSrc(resolvedUrl)
            return
          }
        } catch {
          // noop
        }

        if (selectedAsset.props.src && !selectedAsset.props.src.startsWith('asset:')) {
          setSelectedPreviewSrc(selectedAsset.props.src)
          return
        }
      }

      try {
        const exportedUrl = await exportSelectedImagePreview(selectedSidebarImage)
        if (!disposed) {
          setSelectedPreviewSrc(exportedUrl)
        }
      } catch {
        if (!disposed) {
          setSelectedPreviewSrc('')
        }
      }
    }

    void syncPreview()

    return () => {
      disposed = true
    }
  }, [editor, exportSelectedImagePreview, selectedSidebarImage])

  const handlePreviewImageError = useCallback(() => {
    if (!selectedSidebarImage) return
    void exportSelectedImagePreview(selectedSidebarImage)
      .then((url) => setSelectedPreviewSrc(url))
      .catch(() => {})
  }, [exportSelectedImagePreview, selectedSidebarImage])

  const resetCameraAngleDialog = useCallback(() => {
    cameraAngleSessionRef.current += 1
    cameraAbortControllerRef.current?.abort()
    setCameraAbortController(null)
    setIsCameraAngleOpen(false)
    setCameraSourceShapeId(null)
    setCameraSourcePreviewUrl('')
    setCameraReferenceImageUrl('')
    setCameraReferenceImageMimeType(null)
    setCameraSourceLoading(false)
    setCameraSourceSize({ width: 0, height: 0 })
    setCameraRunStatus('idle')
    setCameraDraftView(DEFAULT_CAMERA_VIEW)
    setCameraGeneratedPreviewUrl('')
    setCameraGeneratedMimeType(null)
    setCameraError('')
  }, [])

  const selectedImagePreview = useMemo(() => {
    if (!selectedSidebarImage || !selectedPreviewSrc) return null
    return {
      src: selectedPreviewSrc,
      width: Math.max(1, Math.round(selectedSidebarImage.props.w)),
      height: Math.max(1, Math.round(selectedSidebarImage.props.h)),
    }
  }, [selectedPreviewSrc, selectedSidebarImage])

  useEffect(() => {
    activeMaskPointerRef.current = null
    setMaskEnabled(false)
    setShowMaskOverlay(true)
    setMaskTool('paint')
    setMaskBrushSize(24)
    setMaskStrokes([])
    setMaskStageSize({ width: 0, height: 0 })
  }, [selectedImage?.id])

  useEffect(() => {
    const element = maskPreviewStageRef.current
    if (!element || !selectedImagePreview) {
      setMaskStageSize({ width: 0, height: 0 })
      return
    }

    const updateSize = (width: number, height: number) => {
      setMaskStageSize({
        width: Math.max(0, Math.round(width)),
        height: Math.max(0, Math.round(height)),
      })
    }

    updateSize(element.clientWidth, element.clientHeight)

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      updateSize(entry.contentRect.width, entry.contentRect.height)
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [selectedImagePreview])

  useEffect(() => {
    const canvas = maskPreviewCanvasRef.current
    if (!canvas) return

    const width = Math.max(0, maskStageSize.width)
    const height = Math.max(0, maskStageSize.height)
    const context = canvas.getContext('2d')
    if (!context) return

    if (width === 0 || height === 0) {
      canvas.width = 1
      canvas.height = 1
      context.clearRect(0, 0, 1, 1)
      return
    }

    const devicePixelRatio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(width * devicePixelRatio))
    canvas.height = Math.max(1, Math.round(height * devicePixelRatio))
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    if (!maskEnabled || !showMaskOverlay) {
      context.clearRect(0, 0, width, height)
      return
    }

    drawMaskStrokes(context, maskStrokes, width, height, {
      paintColor: 'rgba(217, 70, 239, 0.45)',
    })
  }, [maskEnabled, maskStageSize.height, maskStageSize.width, maskStrokes, showMaskOverlay])

  const getNormalizedMaskPoint = useCallback(
    (clientX: number, clientY: number) => {
      const element = maskPreviewStageRef.current
      if (!element) return null

      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null

      return {
        point: {
          x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
          y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
        },
        sizeRatio: maskBrushSize / Math.max(1, Math.min(rect.width, rect.height)),
      }
    },
    [maskBrushSize]
  )

  const handleMaskPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!maskEnabled || !showMaskOverlay || !selectedImagePreview) return

      const payload = getNormalizedMaskPoint(event.clientX, event.clientY)
      if (!payload) return

      event.preventDefault()
      event.stopPropagation()
      activeMaskPointerRef.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      setSidebarError('')
      setMaskStrokes((previous) => [
        ...previous,
        {
          mode: maskTool,
          sizeRatio: payload.sizeRatio,
          points: [payload.point],
        },
      ])
    },
    [getNormalizedMaskPoint, maskEnabled, maskTool, selectedImagePreview, showMaskOverlay]
  )

  const handleMaskPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (activeMaskPointerRef.current !== event.pointerId) return

      const payload = getNormalizedMaskPoint(event.clientX, event.clientY)
      if (!payload) return

      event.preventDefault()
      event.stopPropagation()

      setMaskStrokes((previous) => {
        if (previous.length === 0) return previous

        const next = [...previous]
        const lastStroke = next[next.length - 1]
        if (!lastStroke) return previous

        const lastPoint = lastStroke.points[lastStroke.points.length - 1]
        if (
          lastPoint &&
          Math.abs(lastPoint.x - payload.point.x) < 0.002 &&
          Math.abs(lastPoint.y - payload.point.y) < 0.002
        ) {
          return previous
        }

        next[next.length - 1] = {
          ...lastStroke,
          points: [...lastStroke.points, payload.point],
        }

        return next
      })
    },
    [getNormalizedMaskPoint]
  )

  const handleMaskPointerEnd = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activeMaskPointerRef.current !== event.pointerId) return

    activeMaskPointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const floatingActionStyle = useMemo<CSSProperties | null>(() => {
    const bounds = selectionState.selectionBounds
    if (isCameraAngleOpen || !selectionState.canShowFloatingActions || !bounds) return null

    const sidebarOffset = showSidebar ? SIDEBAR_WIDTH : 0
    const left = Math.min(bounds.midX, Math.max(120, window.innerWidth - sidebarOffset - 48))

    return {
      left,
      top: Math.max(88, bounds.top - 20),
    }
  }, [isCameraAngleOpen, selectionState.canShowFloatingActions, selectionState.selectionBounds, showSidebar])

  const selectionImagineStyle = useMemo<CSSProperties | null>(() => {
    const bounds = selectionState.selectionBounds
    if (!selectionState.canImagineSelection || !bounds) return null

    const sidebarOffset = showSidebar ? SIDEBAR_WIDTH : 0
    const left = Math.min(bounds.midX, Math.max(120, window.innerWidth - sidebarOffset - 48))

    return {
      left,
      top: Math.min(window.innerHeight - 96, bounds.bottom + 18),
    }
  }, [selectionState.canImagineSelection, selectionState.selectionBounds, showSidebar])

  const generatorOverlayLayout = useMemo(() => {
    const bounds = selectionState.selectionBounds
    if (assistantMode !== 'image-generator' || !bounds) return null

    const viewportPadding = 24
    const promptWidth = Math.min(720, Math.max(420, Math.round(bounds.width * 0.82)))
    const promptHalfWidth = promptWidth / 2
    const minPromptCenter = viewportPadding + promptHalfWidth
    const maxPromptCenter = window.innerWidth - viewportPadding - promptHalfWidth

    return {
      headerTop: Math.max(92, bounds.top - 28),
      headerLeft: bounds.left,
      headerWidth: bounds.width,
      promptTop: Math.min(window.innerHeight - 248, bounds.bottom + 20),
      promptLeft: Math.min(maxPromptCenter, Math.max(minPromptCenter, bounds.midX)),
      promptWidth,
    }
  }, [assistantMode, selectionState.selectionBounds])

  const focusSidebarPromptInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      const element = sidebarPromptInputRef.current
      if (!element) return
      element.focus()
      const length = element.value.length
      element.setSelectionRange(length, length)
    })
  }, [])

  const focusGeneratorPromptInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      const element = generatorPromptInputRef.current
      if (!element) return
      element.focus()
      const length = element.value.length
      element.setSelectionRange(length, length)
    })
  }, [])

  const handleSelectPreset = useCallback(
    (preset: ImageEditActionPreset) => {
      setActivePreset(preset)
      setSidebarPrompt(ACTION_PRESETS[preset].defaultPrompt)
      setSidebarError('')
      focusSidebarPromptInput()
    },
    [focusSidebarPromptInput]
  )

  const handleRenameStart = useCallback(() => {
    setDraftTitle(board.title)
    setIsRenaming(true)
    setIsMenuOpen(false)
  }, [board.title])

  const handleRenameCommit = useCallback(() => {
    const nextTitle = draftTitle.trim()

    if (!nextTitle) {
      setDraftTitle(board.title)
      setIsRenaming(false)
      return
    }

    if (nextTitle === board.title) {
      setIsRenaming(false)
      return
    }

    const updated = renameBoard(board.id, nextTitle)
    if (updated) {
      setDraftTitle(updated.title)
      onBoardMetaChange?.()
    } else {
      setDraftTitle(board.title)
    }
    setIsRenaming(false)
  }, [board.id, board.title, draftTitle, onBoardMetaChange])

  const handleTitleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        handleRenameCommit()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        setDraftTitle(board.title)
        setIsRenaming(false)
      }
    },
    [board.title, handleRenameCommit]
  )

  const handleDeleteBoard = useCallback(() => {
    const shouldDelete = window.confirm(`删除画布 “${board.title}”？该操作不可恢复。`)
    if (!shouldDelete) return

    deleteBoard(board.id)
    navigate('/', { replace: true })
  }, [board.id, board.title, navigate])

  const createPlaceholderShape = useCallback(
    (
      label: string,
      width: number,
      height: number,
      x: number,
      y: number,
      meta?: ShapeMeta
    ): TLImageShape['id'] => {
      const placeholderAsset = AssetRecordType.create({
        id: AssetRecordType.createId(),
        type: 'image',
        props: {
          name: `placeholder-${label}`,
          src: createPlaceholderDataUrl(label, width, height),
          w: width,
          h: height,
          mimeType: 'image/svg+xml',
          isAnimated: false,
        },
      })

      const shapeId = createShapeId()
      const normalizedMeta: ShapeMeta = meta ?? {}

      editor.run(() => {
        editor.createAssets([placeholderAsset])
        editor.createShape<TLImageShape>({
          id: shapeId,
          type: 'image',
          x,
          y,
          meta: normalizedMeta,
          props: {
            assetId: placeholderAsset.id,
            w: width,
            h: height,
          },
        })
      })
      return shapeId
    },
    [editor]
  )

  const createImageShape = useCallback(
    ({
      name,
      imageUrl,
      mimeType,
      width,
      height,
      x,
      y,
      altText,
      meta,
    }: {
      name: string
      imageUrl: string
      mimeType?: string | null
      width: number
      height: number
      x: number
      y: number
      altText?: string
      meta?: ShapeMeta
    }): TLImageShape['id'] => {
      const imageAsset = AssetRecordType.create({
        id: AssetRecordType.createId(),
        type: 'image',
        props: {
          name,
          src: imageUrl,
          w: width,
          h: height,
          mimeType: mimeType || 'image/png',
          isAnimated: false,
        },
      })

      const shapeId = createShapeId()

      editor.run(() => {
        editor.createAssets([imageAsset])
        editor.createShape<TLImageShape>({
          id: shapeId,
          type: 'image',
          x,
          y,
          meta: meta ?? {},
          props: {
            assetId: imageAsset.id,
            w: width,
            h: height,
            altText,
          },
        })
      })

      return shapeId
    },
    [editor]
  )

  const updateTaskStatusPlaceholder = useCallback(
    (
      shapeId: TLImageShape['id'],
      label: string,
      width: number,
      height: number,
      metaPatch?: ShapeMeta
    ) => {
      if (!editor.getShape(shapeId)) return

      const statusAsset = AssetRecordType.create({
        id: AssetRecordType.createId(),
        type: 'image',
        props: {
          name: `status-${label}`,
          src: createPlaceholderDataUrl(label, width, height),
          w: width,
          h: height,
          mimeType: 'image/svg+xml',
          isAnimated: false,
        },
      })

      editor.run(() => {
        editor.createAssets([statusAsset])
        editor.updateShapes<TLImageShape>([
          {
            id: shapeId,
            type: 'image',
            ...(metaPatch ? { meta: metaPatch } : {}),
            props: {
              assetId: statusAsset.id,
              w: width,
              h: height,
            },
          },
        ])
      })
    },
    [editor]
  )

  const updateGeneratorShapeMeta = useCallback(
    (shapeId: TLImageShape['id'], patch: Partial<GeneratorShapeMeta>) => {
      const shape = editor.getShape<TLImageShape>(shapeId)
      if (!shape || !isGeneratorShape(shape)) return

      const currentMeta = getGeneratorMeta(shape) ?? createGeneratorMeta(DEFAULT_GENERATOR_ASPECT_RATIO)
      editor.updateShapes([
        {
          id: shapeId,
          type: 'image',
          meta: {
            ...currentMeta,
            ...patch,
          },
        } as {
          id: TLImageShape['id']
          type: 'image'
          meta: ShapeMeta
        },
      ])
    },
    [editor]
  )

  const upsertTask = useCallback(
    (taskId: string, updater: (task: GenerationTask) => GenerationTask) => {
      setTasks((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)))
    },
    []
  )

  const selectAndRevealShape = useCallback(
    (shapeId: TLImageShape['id']) => {
      if (!editor.getShape(shapeId)) return

      editor.setSelectedShapes([shapeId])
      editor.zoomToSelectionIfOffscreen(256, {
        animation: {
          duration: editor.options.animationMediumMs,
        },
        inset: 0,
      })
    },
    [editor]
  )

  const openCameraAngleDialog = useCallback(async () => {
    if (assistantMode !== 'image-edit' || !selectedImage) return

    const sessionId = cameraAngleSessionRef.current + 1
    cameraAngleSessionRef.current = sessionId

    const nextSize = {
      width: Math.max(1, Math.round(selectedImage.props.w)),
      height: Math.max(1, Math.round(selectedImage.props.h)),
    }

    const selectedAsset = selectedImage.props.assetId ? editor.getAsset(selectedImage.props.assetId) : null
    const fallbackAssetUrl =
      selectedAsset &&
      selectedAsset.type === 'image' &&
      selectedAsset.props.src &&
      !selectedAsset.props.src.startsWith('asset:')
        ? selectedAsset.props.src
        : ''
    const fallbackPreviewUrl = selectedPreviewSrc || fallbackAssetUrl

    setIsCameraAngleOpen(true)
    setCameraSourceShapeId(selectedImage.id)
    setCameraSourceSize(nextSize)
    setCameraSourcePreviewUrl(fallbackPreviewUrl)
    setCameraReferenceImageUrl(fallbackAssetUrl)
    setCameraReferenceImageMimeType(
      selectedAsset && selectedAsset.type === 'image' ? selectedAsset.props.mimeType || 'image/png' : 'image/png'
    )
    setCameraSourceLoading(true)
    setCameraRunStatus('idle')
    setCameraDraftView(DEFAULT_CAMERA_VIEW)
    setCameraGeneratedPreviewUrl('')
    setCameraGeneratedMimeType(null)
    setCameraError('')

    try {
      const exported = await editor.toImage([selectedImage.id], { format: 'png' })
      const exportedUrl = await blobToDataUrl(exported.blob)
      if (cameraAngleSessionRef.current !== sessionId) return

      setCameraSourcePreviewUrl(exportedUrl)
      setCameraReferenceImageUrl(exportedUrl)
      setCameraReferenceImageMimeType('image/png')
    } catch (error) {
      if (cameraAngleSessionRef.current !== sessionId) return
      if (!fallbackPreviewUrl && !fallbackAssetUrl) {
        setCameraError(error instanceof Error ? error.message : '准备参考图失败')
      }
    } finally {
      if (cameraAngleSessionRef.current === sessionId) {
        setCameraSourceLoading(false)
      }
    }
  }, [assistantMode, editor, selectedImage, selectedPreviewSrc])

  const closeCameraAngleDialog = useCallback(() => {
    resetCameraAngleDialog()
  }, [resetCameraAngleDialog])

  const runCameraAngleGeneration = useCallback(async () => {
    if (!cameraCanRun || !cameraReferenceImageUrl) return

    const sessionId = cameraAngleSessionRef.current
    const controller = new AbortController()
    const prompt = buildCameraAnglePrompt(cameraDraftView, cameraSourceSize)

    setCameraAbortController(controller)
    setCameraRunStatus('running')
    setCameraError('')

    try {
      const generated = await generateImageFromPrompt({
        prompt,
        width: cameraSourceSize.width,
        height: cameraSourceSize.height,
        aspectRatio: pickNearestImageAspectRatio(cameraSourceSize.width, cameraSourceSize.height),
        referenceImageUrl: cameraReferenceImageUrl,
        referenceImageMimeType: cameraReferenceImageMimeType,
        signal: controller.signal,
      })

      let nextImageUrl = generated.imageUrl
      let nextMimeType = generated.mimeType || 'image/png'

      try {
        const normalized = await maybePadImageToTargetRatio(
          generated.imageUrl,
          cameraSourceSize.width,
          cameraSourceSize.height,
          controller.signal
        )
        nextImageUrl = normalized.imageUrl
        nextMimeType = normalized.mimeType
      } catch (error) {
        if (isAbortError(error)) throw error
      }

      if (cameraAngleSessionRef.current !== sessionId) return

      setCameraGeneratedPreviewUrl(nextImageUrl)
      setCameraGeneratedMimeType(nextMimeType)
      setCameraRunStatus('succeeded')
      setCameraError('')
    } catch (error) {
      if (cameraAngleSessionRef.current !== sessionId) return
      if (controller.signal.aborted || isAbortError(error)) {
        setCameraRunStatus(cameraGeneratedPreviewUrl ? 'succeeded' : 'idle')
        setCameraError('')
        return
      }

      setCameraRunStatus('failed')
      setCameraError(error instanceof Error ? error.message : '视角调节生成失败，请稍后重试')
    } finally {
      if (cameraAngleSessionRef.current === sessionId) {
        setCameraAbortController(null)
      }
    }
  }, [
    cameraCanRun,
    cameraDraftView,
    cameraGeneratedPreviewUrl,
    cameraReferenceImageMimeType,
    cameraReferenceImageUrl,
    cameraSourceSize,
  ])

  const completeCameraAngleDialog = useCallback(() => {
    if (!cameraSourceShapeId || !cameraGeneratedPreviewUrl) return

    const liveShape = editor.getShape<TLImageShape>(cameraSourceShapeId)
    if (!liveShape || liveShape.type !== 'image') {
      setCameraRunStatus('failed')
      setCameraError('原图已不存在，无法插入结果。')
      return
    }

    const selectedBounds = editor.getShapePageBounds(liveShape)
    const placement = getInsertPlacement('image-edit', {
      viewportBounds: editor.getViewportPageBounds(),
      selectedImage: {
        shapeId: liveShape.id,
        x: liveShape.x,
        y: liveShape.y,
        width: liveShape.props.w,
        height: liveShape.props.h,
        bounds: selectedBounds
          ? {
              minY: selectedBounds.minY,
              maxX: selectedBounds.maxX,
            }
          : undefined,
      },
      insertGap: INSERT_GAP,
    })

    const insertedShapeId = createImageShape({
      name: 'camera-angle-result',
      imageUrl: cameraGeneratedPreviewUrl,
      mimeType: cameraGeneratedMimeType || 'image/png',
      width: placement.width,
      height: placement.height,
      x: placement.insertX,
      y: placement.insertY,
      altText: buildCameraAnglePrompt(cameraDraftView, cameraSourceSize),
    })

    selectAndRevealShape(insertedShapeId)

    const updated = touchBoard(board.id)
    if (updated) {
      onBoardMetaChange?.()
    }

    resetCameraAngleDialog()
  }, [
    board.id,
    cameraDraftView,
    cameraGeneratedMimeType,
    cameraGeneratedPreviewUrl,
    cameraSourceShapeId,
    cameraSourceSize,
    createImageShape,
    editor,
    onBoardMetaChange,
    resetCameraAngleDialog,
    selectAndRevealShape,
  ])

  const handleSelectTaskResult = useCallback(
    (task: GenerationTask) => {
      if (task.status !== 'succeeded' || !task.resultShapeId) return
      selectAndRevealShape(task.resultShapeId)
    },
    [selectAndRevealShape]
  )

  const createGeneratorCard = useCallback(
    (aspectRatio: ImageAspectRatio = DEFAULT_GENERATOR_ASPECT_RATIO) => {
      const placement = getGeneratorCardPlacement(editor.getViewportPageBounds(), aspectRatio)
      const shapeId = createPlaceholderShape(
        GENERATOR_PLACEHOLDER_LABEL,
        placement.width,
        placement.height,
        placement.insertX,
        placement.insertY,
        createGeneratorMeta(aspectRatio)
      )
      tools.select.onSelect('toolbar')
      selectAndRevealShape(shapeId)
      setGeneratorError('')
      focusGeneratorPromptInput()
    },
    [createPlaceholderShape, editor, focusGeneratorPromptInput, selectAndRevealShape, tools]
  )

  const resizeGeneratorCard = useCallback(
    (shape: TLImageShape, nextRatio: ImageAspectRatio) => {
      const bounds = editor.getShapePageBounds(shape)
      const centerX = bounds?.center.x ?? shape.x + shape.props.w / 2
      const centerY = bounds?.center.y ?? shape.y + shape.props.h / 2
      const nextSize = getGeneratorCardSize(nextRatio)

      editor.updateShapes([
        {
          id: shape.id,
          type: 'image',
          x: Math.round(centerX - nextSize.width / 2),
          y: Math.round(centerY - nextSize.height / 2),
          meta: {
            ...(getGeneratorMeta(shape) ?? createGeneratorMeta(nextRatio)),
            aspectRatio: nextRatio,
          },
          props: {
            w: nextSize.width,
            h: nextSize.height,
          },
        } as {
          id: TLImageShape['id']
          type: 'image'
          x: number
          y: number
          meta: ShapeMeta
          props: Partial<TLImageShapeProps>
        },
      ])
      setGeneratorError('')
    },
    [editor]
  )

  const persistGeneratorPrompt = useCallback(
    (shapeId: TLImageShape['id'], promptText: string) => {
      updateGeneratorShapeMeta(shapeId, { lastPrompt: promptText })
    },
    [updateGeneratorShapeMeta]
  )

  const handleGeneratorModelChange = useCallback(
    (imageModel: ImageGeneratorModel) => {
      if (!selectedGeneratorImage || generatorBusy) return

      updateGeneratorShapeMeta(selectedGeneratorImage.id, { imageModel })
      setGeneratorError('')
    },
    [generatorBusy, selectedGeneratorImage, updateGeneratorShapeMeta]
  )

  const handleGeneratorSizeChange = useCallback(
    (imageSize: ImageGenerationSize) => {
      if (!selectedGeneratorImage || generatorBusy) return

      updateGeneratorShapeMeta(selectedGeneratorImage.id, { imageSize })
      setGeneratorError('')
    },
    [generatorBusy, selectedGeneratorImage, updateGeneratorShapeMeta]
  )

  const ensureTaskTargetShape = useCallback(
    (taskId: string, task: GenerationTask) => {
      if (editor.getShape(task.targetShapeId)) {
        return task.targetShapeId
      }

      if (!shouldRecreateTaskTarget(task.origin)) {
        throw createTaskTargetRemovedError()
      }

      const recreatedShapeId = createPlaceholderShape(
        'Queued',
        task.width,
        task.height,
        task.insertX,
        task.insertY
      )

      upsertTask(taskId, (current) => ({
        ...current,
        targetShapeId: recreatedShapeId,
      }))

      return recreatedShapeId
    },
    [createPlaceholderShape, editor, upsertTask]
  )

  const runTask = useCallback(
    async (taskId: string, controller: AbortController) => {
      const task = tasksRef.current.find((item) => item.id === taskId)
      if (!task) return

      let shapeId: TLImageShape['id']

      try {
        shapeId = ensureTaskTargetShape(taskId, task)
      } catch {
        upsertTask(taskId, (current) => ({
          ...current,
          status: 'cancelled',
          updatedAt: Date.now(),
          abortController: undefined,
          error:
            current.origin === 'image-generator-card'
              ? '生成卡片已删除，请重新插入 Image Generator。'
              : '任务已取消',
        }))
        return
      }

      const generatorMetaPatch =
        task.origin === 'image-generator-card'
          ? createGeneratorMeta(task.aspectRatio, task.prompt, task.imageModel, task.imageSize)
          : undefined

      updateTaskStatusPlaceholder(
        shapeId,
        'Generating...',
        task.width,
        task.height,
        generatorMetaPatch
      )

      try {
        const generated = await generateImageFromPrompt({
          prompt: task.prompt,
          width: task.width,
          height: task.height,
          aspectRatio: task.aspectRatio,
          imageModel: task.imageModel,
          imageSize: task.imageSize,
          referenceImageUrl: task.referenceImageUrl,
          referenceImageUrls: task.referenceImageUrls,
          referenceImageMimeType: task.referenceImageMimeType,
          referenceImageMimeTypes: task.referenceImageMimeTypes,
          signal: controller.signal,
        })

        let generatedImageWidth = task.width
        let generatedImageHeight = task.height
        let generatedImageUrl = generated.imageUrl
        let generatedImageMimeType = generated.mimeType || 'image/png'

        if (
          task.maskMode === 'semantic-crop' &&
          task.maskBounds &&
          task.maskImageUrl &&
          task.sourceSnapshotUrl
        ) {
          const composited = await compositeMaskedEditResult({
            baseImageUrl: task.sourceSnapshotUrl,
            patchImageUrl: generated.imageUrl,
            maskImageUrl: task.maskImageUrl,
            maskBounds: task.maskBounds,
            featherPx: task.compositeFeatherPx ?? DEFAULT_MASK_FEATHER_PX,
            signal: controller.signal,
          })

          generatedImageWidth = composited.width
          generatedImageHeight = composited.height
          generatedImageUrl = composited.imageUrl
          generatedImageMimeType = composited.mimeType
        } else {
          try {
            const normalized = await maybePadImageToTargetRatio(
              generated.imageUrl,
              task.width,
              task.height,
              controller.signal
            )
            generatedImageWidth = normalized.width
            generatedImageHeight = normalized.height
            generatedImageUrl = normalized.imageUrl
            generatedImageMimeType = normalized.mimeType
          } catch {
            try {
              const dimensions = await getImageDimensions(generated.imageUrl, controller.signal)
              generatedImageWidth = dimensions.width
              generatedImageHeight = dimensions.height
            } catch {
              // noop
            }
          }
        }

        if (!editor.getShape(shapeId)) {
          throw createTaskTargetRemovedError()
        }

        const generatedAsset = AssetRecordType.create({
          id: AssetRecordType.createId(),
          type: 'image',
          props: {
            name: `generated-${generated.route}`,
            src: generatedImageUrl,
            w: generatedImageWidth,
            h: generatedImageHeight,
            mimeType: generatedImageMimeType,
            isAnimated: false,
          },
        })

        const successMetaPatch =
          task.origin === 'image-generator-card'
            ? {
                canvasRole: GENERATED_IMAGE_ROLE,
                aspectRatio: task.aspectRatio,
                lastPrompt: task.prompt,
              }
            : undefined

        editor.run(() => {
          editor.createAssets([generatedAsset])

          if (!editor.getShape(shapeId)) return
          editor.updateShapes<TLImageShape>([
            {
              id: shapeId,
              type: 'image',
              ...(successMetaPatch ? { meta: successMetaPatch } : {}),
              props: {
                assetId: generatedAsset.id,
                w: task.width,
                h: task.height,
                crop: null,
                altText: task.prompt,
              },
            },
          ])
        })
        selectAndRevealShape(shapeId)

        const debugImages = [
          ...(task.referenceImageUrls?.map((url, index) => ({
            label: index === 0 ? 'input-crop' : 'input-highlight',
            url,
            mimeType: task.referenceImageMimeTypes?.[index] || undefined,
          })) || []),
          ...(task.referenceImageUrl
            ? [
                {
                  label: 'input',
                  url: task.referenceImageUrl,
                  mimeType: task.referenceImageMimeType || undefined,
                },
              ]
            : []),
          ...(task.sourceSnapshotUrl
            ? [
                {
                  label: 'input-source',
                  url: task.sourceSnapshotUrl,
                  mimeType: 'image/png',
                },
              ]
            : []),
          ...(task.maskImageUrl
            ? [
                {
                  label: 'input-mask',
                  url: task.maskImageUrl,
                  mimeType: 'image/png',
                },
              ]
            : []),
          {
            label: 'output-raw',
            url: generated.imageUrl,
            mimeType: generated.mimeType || undefined,
          },
          {
            label: 'output-final',
            url: generatedImageUrl,
            mimeType: generatedImageMimeType || undefined,
          },
        ].filter((item) => !!item.url)

        if (debugImages.length > 0) {
          void archiveDebugImages({
            runId: task.id,
            prompt: task.prompt,
            images: debugImages,
          })
            .then((result) => {
              console.info(
                `[debug-image] 已保存到 ${result.folder}（saved=${result.saved}, failed=${result.failed}）`
              )
            })
            .catch((error) => {
              console.warn(
                '[debug-image] 保存输入输出图失败',
                error instanceof Error ? error.message : error
              )
            })
        }

        upsertTask(taskId, (current) => ({
          ...current,
          status: 'succeeded',
          targetShapeId: shapeId,
          resultShapeId: shapeId,
          updatedAt: Date.now(),
          abortController: undefined,
          error: undefined,
        }))

        const updated = touchBoard(board.id)
        if (updated) {
          onBoardMetaChange?.()
        }
      } catch (error) {
        const cancelled =
          controller.signal.aborted || isAbortError(error) || isTaskTargetRemovedError(error)
        if (cancelled) {
          if (editor.getShape(shapeId)) {
            updateTaskStatusPlaceholder(
              shapeId,
              'Cancelled',
              task.width,
              task.height,
              generatorMetaPatch
            )
          }
          upsertTask(taskId, (current) => ({
            ...current,
            status: 'cancelled',
            updatedAt: Date.now(),
            abortController: undefined,
            error:
              current.origin === 'image-generator-card' && isTaskTargetRemovedError(error)
                ? '生成卡片已删除，请重新插入 Image Generator。'
                : '任务已取消',
          }))
          return
        }

        const message = error instanceof Error ? error.message : '生成失败，请稍后重试'
        if (editor.getShape(shapeId)) {
          updateTaskStatusPlaceholder(
            shapeId,
            'Generation failed',
            task.width,
            task.height,
            generatorMetaPatch
          )
        }
        upsertTask(taskId, (current) => ({
          ...current,
          status: 'failed',
          updatedAt: Date.now(),
          abortController: undefined,
          error: message,
        }))
      }
    },
    [
      board.id,
      editor,
      ensureTaskTargetShape,
      onBoardMetaChange,
      selectAndRevealShape,
      updateTaskStatusPlaceholder,
      upsertTask,
    ]
  )

  useEffect(() => {
    const hasRunningTask = tasks.some((task) => task.status === 'running')
    if (hasRunningTask) return

    const nextTask = tasks.find((task) => task.status === 'queued')
    if (!nextTask) return

    const timer = window.setTimeout(() => {
      const controller = new AbortController()
      upsertTask(nextTask.id, (task) => ({
        ...task,
        status: 'running',
        updatedAt: Date.now(),
        abortController: controller,
      }))
      void runTask(nextTask.id, controller)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [tasks, runTask, upsertTask])

  const enqueueSidebarTask = useCallback(async () => {
    if (assistantMode !== 'image-edit' || !selectedImage) return

    const promptText = sidebarPrompt.trim()
    if (!promptText) return

    const viewportBounds = editor.getViewportPageBounds()
    const selectedBounds = editor.getShapePageBounds(selectedImage)
    const placement = getInsertPlacement('image-edit', {
      viewportBounds,
      selectedImage: {
        shapeId: selectedImage.id,
        x: selectedImage.x,
        y: selectedImage.y,
        width: selectedImage.props.w,
        height: selectedImage.props.h,
        bounds: selectedBounds
          ? {
              minY: selectedBounds.minY,
              maxX: selectedBounds.maxX,
            }
          : undefined,
      },
      insertGap: INSERT_GAP,
    })

    const selectedAsset = selectedImage.props.assetId ? editor.getAsset(selectedImage.props.assetId) : null

    let referenceImageUrl =
      selectedAsset && selectedAsset.type === 'image' ? selectedAsset.props.src || undefined : undefined
    let referenceImageMimeType =
      selectedAsset && selectedAsset.type === 'image'
        ? selectedAsset.props.mimeType || 'image/png'
        : undefined
    let referenceImageUrls: string[] | undefined
    let referenceImageMimeTypes: Array<string | null> | undefined
    let taskPrompt = promptText
    let taskAspectRatio = sidebarAspectRatio
    let maskMode: GenerationTaskMaskMode | undefined
    let maskBounds: MaskBounds | undefined
    let maskImageUrl: string | undefined
    let sourceSnapshotUrl: string | undefined
    let sourceSnapshotWidth: number | undefined
    let sourceSnapshotHeight: number | undefined
    let compositeFeatherPx: number | undefined

    if (maskEnabled) {
      try {
        const snapshot = await exportSelectedImageSnapshot(selectedImage)
        const prepared = await prepareMaskedEditAssets({
          sourceImageUrl: snapshot.imageUrl,
          strokes: maskStrokes,
        })

        taskPrompt = buildSemanticMaskPrompt(promptText)
        taskAspectRatio = pickNearestImageAspectRatio(
          prepared.maskBounds.width,
          prepared.maskBounds.height
        )
        referenceImageUrl = undefined
        referenceImageMimeType = undefined
        referenceImageUrls = [prepared.sourceCropUrl, prepared.highlightCropUrl]
        referenceImageMimeTypes = ['image/png', 'image/png']
        maskMode = 'semantic-crop'
        maskBounds = prepared.maskBounds
        maskImageUrl = prepared.maskCropUrl
        sourceSnapshotUrl = snapshot.imageUrl
        sourceSnapshotWidth = prepared.sourceWidth
        sourceSnapshotHeight = prepared.sourceHeight
        compositeFeatherPx = DEFAULT_MASK_FEATHER_PX
      } catch (error) {
        setSidebarError(error instanceof Error ? error.message : '准备蒙版编辑失败')
        return
      }
    } else {
      try {
        const exported = await editor.toImage([selectedImage.id], { format: 'png' })
        referenceImageUrl = await blobToDataUrl(exported.blob)
        referenceImageMimeType = 'image/png'
      } catch {
        // noop
      }
    }

    try {
      const placeholderShapeId = createPlaceholderShape(
        'Queued',
        placement.width,
        placement.height,
        placement.insertX,
        placement.insertY
      )
      const now = Date.now()
      const task: GenerationTask = {
        id: createTaskId(),
        mode: 'image-edit',
        origin: 'image-edit-sidebar',
        prompt: taskPrompt,
        aspectRatio: taskAspectRatio,
        status: 'queued',
        width: placement.width,
        height: placement.height,
        insertX: placement.insertX,
        insertY: placement.insertY,
        targetShapeId: placeholderShapeId,
        referenceImageUrl,
        referenceImageUrls,
        referenceImageMimeType,
        referenceImageMimeTypes,
        sourceShapeId: placement.referenceImage?.sourceShapeId as TLImageShape['id'] | undefined,
        sourceAction: activePreset,
        maskMode,
        maskBounds,
        maskImageUrl,
        sourceSnapshotUrl,
        sourceSnapshotWidth,
        sourceSnapshotHeight,
        compositeFeatherPx,
        retries: 0,
        createdAt: now,
        updatedAt: now,
      }

      setTasks((prev) => [task, ...prev].slice(0, MAX_TASKS))
      setSidebarPrompt('')
      setSidebarError('')
      selectAndRevealShape(placeholderShapeId)
    } catch (error) {
      setSidebarError(error instanceof Error ? error.message : '创建占位图失败')
    }
  }, [
    activePreset,
    assistantMode,
    createPlaceholderShape,
    editor,
    exportSelectedImageSnapshot,
    maskEnabled,
    maskStrokes,
    selectAndRevealShape,
    selectedImage,
    sidebarAspectRatio,
    sidebarPrompt,
  ])

  const enqueueGeneratorTask = useCallback(async () => {
    if (assistantMode !== 'image-generator' || !selectedGeneratorImage) return

    const promptText = generatorPrompt.trim()
    if (!promptText) return

    try {
      const liveGeneratorShape = editor.getShape<TLImageShape>(selectedGeneratorImage.id)

      if (!liveGeneratorShape || liveGeneratorShape.type !== 'image' || !isGeneratorShape(liveGeneratorShape)) {
        setGeneratorError('当前生成卡片已失效，请重新选择后再试')
        return
      }

      const liveGeneratorMeta =
        getGeneratorMeta(liveGeneratorShape) ?? createGeneratorMeta(DEFAULT_GENERATOR_ASPECT_RATIO)
      const nextWidth = Math.max(1, Math.round(liveGeneratorShape.props.w))
      const nextHeight = Math.max(1, Math.round(liveGeneratorShape.props.h))

      persistGeneratorPrompt(liveGeneratorShape.id, promptText)
      updateTaskStatusPlaceholder(
        liveGeneratorShape.id,
        'Queued',
        nextWidth,
        nextHeight,
        createGeneratorMeta(
          liveGeneratorMeta.aspectRatio,
          promptText,
          liveGeneratorMeta.imageModel,
          liveGeneratorMeta.imageSize
        )
      )

      const now = Date.now()
      const task: GenerationTask = {
        id: createTaskId(),
        mode: 'image-generator',
        origin: 'image-generator-card',
        prompt: promptText,
        aspectRatio: liveGeneratorMeta.aspectRatio,
        imageModel: liveGeneratorMeta.imageModel,
        imageSize: liveGeneratorMeta.imageSize,
        status: 'queued',
        width: nextWidth,
        height: nextHeight,
        insertX: Math.round(liveGeneratorShape.x),
        insertY: Math.round(liveGeneratorShape.y),
        targetShapeId: liveGeneratorShape.id,
        sourceAction: 'text-to-image',
        retries: 0,
        createdAt: now,
        updatedAt: now,
      }

      setTasks((prev) => [task, ...prev].slice(0, MAX_TASKS))
      setGeneratorError('')
    } catch (error) {
      setGeneratorError(error instanceof Error ? error.message : '创建生成任务失败')
    }
  }, [
    assistantMode,
    editor,
    generatorPrompt,
    persistGeneratorPrompt,
    selectedGeneratorImage,
    updateTaskStatusPlaceholder,
  ])

  const enqueueSelectionImagineTask = useCallback(async () => {
    if (assistantMode !== 'selection-imagine' || !selectionState.canImagineSelection) return

    const selectedShapeIds = [...selectionState.selectedShapeIds]
    const firstSelectedImage = selectionState.firstSelectedImage
    const selectionPageBounds = selectionState.selectionPageBounds

    if (selectedShapeIds.length < 2 || !selectionPageBounds || !firstSelectedImage) {
      return
    }

    setSelectionImaginePending(true)
    setSelectionImagineError('')

    try {
      const placement = getInsertPlacement('selection-imagine', {
        viewportBounds: editor.getViewportPageBounds(),
        selectionBounds: {
          x: selectionPageBounds.x,
          y: selectionPageBounds.y,
          width: selectionPageBounds.w,
          height: selectionPageBounds.h,
          minY: selectionPageBounds.minY,
          maxX: selectionPageBounds.maxX,
        },
        selectionOutputSize: {
          width: firstSelectedImage.width,
          height: firstSelectedImage.height,
        },
        insertGap: INSERT_GAP,
      })

      const exported = await editor.toImage(selectedShapeIds, { format: 'png' })
      const referenceImageUrl = await blobToDataUrl(exported.blob)
      const placeholderShapeId = createPlaceholderShape(
        'Queued',
        placement.width,
        placement.height,
        placement.insertX,
        placement.insertY
      )
      const now = Date.now()
      const task: GenerationTask = {
        id: createTaskId(),
        mode: 'selection-imagine',
        origin: 'selection-imagine-actionbar',
        prompt: SELECTION_IMAGINE_PROMPT,
        aspectRatio: pickNearestImageAspectRatio(
          firstSelectedImage.width,
          firstSelectedImage.height
        ),
        status: 'queued',
        width: placement.width,
        height: placement.height,
        insertX: placement.insertX,
        insertY: placement.insertY,
        targetShapeId: placeholderShapeId,
        referenceImageUrl,
        referenceImageMimeType: 'image/png',
        sourceAction: 'imagine-selection',
        retries: 0,
        createdAt: now,
        updatedAt: now,
      }

      setTasks((prev) => [task, ...prev].slice(0, MAX_TASKS))
      selectAndRevealShape(placeholderShapeId)
    } catch (error) {
      setSelectionImagineError(error instanceof Error ? error.message : '创建 imagine 任务失败')
    } finally {
      setSelectionImaginePending(false)
    }
  }, [
    assistantMode,
    createPlaceholderShape,
    editor,
    selectAndRevealShape,
    selectionState.canImagineSelection,
    selectionState.firstSelectedImage,
    selectionState.selectedShapeIds,
    selectionState.selectionPageBounds,
  ])

  const handleSidebarFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void enqueueSidebarTask()
    },
    [enqueueSidebarTask]
  )

  const handleGeneratorFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void enqueueGeneratorTask()
    },
    [enqueueGeneratorTask]
  )

  const handleSidebarPromptKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        void enqueueSidebarTask()
      }
    },
    [enqueueSidebarTask]
  )

  const handleGeneratorPromptKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        void enqueueGeneratorTask()
      }
    },
    [enqueueGeneratorTask]
  )

  const handleCancelTask = useCallback(
    (taskId: string) => {
      const task = tasksRef.current.find((item) => item.id === taskId)
      if (!task) return

      if (task.status === 'running') {
        task.abortController?.abort()
      }

      upsertTask(taskId, (current) => {
        if (
          current.status === 'succeeded' ||
          current.status === 'failed' ||
          current.status === 'cancelled'
        ) {
          return current
        }

        if (editor.getShape(current.targetShapeId)) {
          updateTaskStatusPlaceholder(
            current.targetShapeId,
            'Cancelled',
            current.width,
            current.height,
            current.origin === 'image-generator-card'
              ? createGeneratorMeta(
                  current.aspectRatio,
                  current.prompt,
                  current.imageModel,
                  current.imageSize
                )
              : undefined
          )
        }

        return {
          ...current,
          status: 'cancelled',
          updatedAt: Date.now(),
          abortController: undefined,
          error: '任务已取消',
        }
      })
    },
    [editor, updateTaskStatusPlaceholder, upsertTask]
  )

  const handleRetryTask = useCallback(
    (taskId: string) => {
      const task = tasksRef.current.find((item) => item.id === taskId)
      if (!task) return
      if (task.status !== 'failed' && task.status !== 'cancelled') return

      let nextTargetShapeId = task.targetShapeId

      if (!editor.getShape(task.targetShapeId)) {
        if (!shouldRecreateTaskTarget(task.origin)) {
          upsertTask(taskId, (current) => ({
            ...current,
            error: '生成卡片已删除，请重新插入 Image Generator。',
          }))
          return
        }

        nextTargetShapeId = createPlaceholderShape(
          'Queued',
          task.width,
          task.height,
          task.insertX,
          task.insertY
        )
        upsertTask(taskId, (current) => ({
          ...current,
          targetShapeId: nextTargetShapeId,
          resultShapeId: undefined,
        }))
      } else {
        updateTaskStatusPlaceholder(
          task.targetShapeId,
          'Queued',
          task.width,
          task.height,
          task.origin === 'image-generator-card'
            ? createGeneratorMeta(task.aspectRatio, task.prompt, task.imageModel, task.imageSize)
            : undefined
        )
      }

      selectAndRevealShape(nextTargetShapeId)

      upsertTask(taskId, (current) => ({
        ...current,
        status: 'queued',
        updatedAt: Date.now(),
        error: undefined,
        retries: current.retries + 1,
        abortController: undefined,
        resultShapeId: undefined,
      }))
    },
    [createPlaceholderShape, editor, selectAndRevealShape, updateTaskStatusPlaceholder, upsertTask]
  )

  const handleToolbarMouseDown = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
  }, [])

  const selectionMessage = useMemo(() => {
    if (assistantMode === 'disabled') {
      if (selectionNeedsImagineImage) {
        return '当前多选中至少需要一张图片才能 imagine。'
      }

      if (selectedImage && selectionState.isLocked) {
        return '当前图片已锁定，请先解锁后再进行 AI 编辑。'
      }

      return '当前选择状态不支持生成图片，请调整后再继续。'
    }

    if (assistantMode === 'image-edit') {
      return '已选中当前图片，可以直接描述修改需求或使用上方快捷动作。'
    }

    if (assistantMode === 'selection-imagine') {
      return `已选中 ${selectionState.selectedCount} 个对象，可点击选区下方 imagine 生成融合结果。`
    }

    if (assistantMode === 'image-generator') {
      return '当前是 Image Generator 生成卡片，可直接在画布中输入提示词。'
    }

    return '点击底部 Image Generator 按钮，在画布中插入一个文生图卡片。'
  }, [
    assistantMode,
    selectedImage,
    selectionNeedsImagineImage,
    selectionState.isLocked,
    selectionState.selectedCount,
  ])

  const selectionCardTitle = useMemo(() => {
    if (selectedImagePreview) {
      return assistantMode === 'image-edit' ? '当前编辑图片' : '当前选中图片'
    }

    if (assistantMode === 'disabled') {
      if (selectionNeedsImagineImage) {
        return '请至少选择一张图片'
      }

      return '请调整图片选择'
    }

    return '等待选择图片'
  }, [assistantMode, selectedImagePreview, selectionNeedsImagineImage])

  const emptyTaskMessage = useMemo(() => {
    if (assistantMode === 'image-edit') {
      return '还没有任务。先选中一张图片并输入提示词。'
    }

    if (assistantMode === 'selection-imagine') {
      return '还没有任务。先框选多个元素，再点击下方 imagine。'
    }

    if (assistantMode === 'disabled') {
      if (selectionNeedsImagineImage) {
        return '还没有任务。先在当前多选中加入一张图片。'
      }

      return '还没有任务。请先调整当前选择状态。'
    }

    return '还没有任务。先创建一个图片编辑任务。'
  }, [assistantMode, selectionNeedsImagineImage])

  const presetHelperText = assistantMode === 'disabled' ? selectionMessage : activePresetDefinition.helper
  const canUseMaskEditor = assistantMode === 'image-edit' && Boolean(selectedImagePreview)
  const maskStatusText = useMemo(() => {
    if (!canUseMaskEditor) {
      return '先选择一张可编辑图片后再使用局部蒙版。'
    }

    if (!maskEnabled) {
      return '关闭时按整张图片编辑；开启后可用画笔限定局部重绘区域。'
    }

    return `当前使用${maskTool === 'paint' ? '画笔' : '橡皮擦'}，笔刷 ${maskBrushSize}px。Gemini 将参考高亮局部图进行语义重绘。`
  }, [canUseMaskEditor, maskBrushSize, maskEnabled, maskTool])
  const generatorStatusText = useMemo(() => {
    if (generatorBusy) {
      return selectedGeneratorTask?.status === 'queued' ? '任务已加入队列。' : '正在生成图片，请稍候。'
    }

    if (selectedGeneratorTask?.status === 'failed') {
      return selectedGeneratorTask.error || '本次生成失败，请调整提示词后重试。'
    }

    if (selectedGeneratorTask?.status === 'cancelled') {
      return selectedGeneratorTask.error || '任务已取消。'
    }

    if (selectedGeneratorTask?.status === 'succeeded') {
      return '生成成功，可继续修改提示词再次生成。'
    }

    return 'Describe what you want to create today'
  }, [generatorBusy, selectedGeneratorTask])

  const generatorShapeSizeLabel = selectedGeneratorImage
    ? `${Math.max(1, Math.round(selectedGeneratorImage.props.w))} × ${Math.max(
        1,
        Math.round(selectedGeneratorImage.props.h)
      )}`
    : '1024 × 1024'

  const getToolIsActive = useCallback(
    (toolId: ToolId) => {
      if (toolId === 'rectangle') {
        return currentToolId === 'geo' && currentGeo === 'rectangle'
      }

      if (toolId === 'asset') {
        return currentToolId === 'asset'
      }

      return currentToolId === toolId
    },
    [currentGeo, currentToolId]
  )

  const handleToolSelect = useCallback(
    (toolId: ToolId) => {
      switch (toolId) {
        case 'select':
          tools.select.onSelect('toolbar')
          break
        case 'frame':
          tools.frame.onSelect('toolbar')
          break
        case 'rectangle':
          tools.rectangle.onSelect('toolbar')
          break
        case 'text':
          tools.text.onSelect('toolbar')
          break
        case 'draw':
          tools.draw.onSelect('toolbar')
          break
        case 'asset':
          tools.asset.onSelect('toolbar')
          break
        default:
          break
      }
    },
    [tools]
  )

  const renderTaskActionButton = useCallback(
    (task: GenerationTask): ReactNode => {
      if (task.status === 'queued' || task.status === 'running') {
        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              handleCancelTask(task.id)
            }}
          >
            取消
          </button>
        )
      }

      if (task.status === 'failed' || task.status === 'cancelled') {
        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              handleRetryTask(task.id)
            }}
          >
            重试
          </button>
        )
      }

      if (task.status === 'succeeded' && task.resultShapeId) {
        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              handleSelectTaskResult(task)
            }}
          >
            定位结果
          </button>
        )
      }

      return null
    },
    [handleCancelTask, handleRetryTask, handleSelectTaskResult]
  )

  return (
    <div className={`canvas-workbench ${showSidebar ? 'has-sidebar' : 'no-sidebar'}`}>
      <div className="canvas-workbench-topbar">
        <div className="canvas-workbench-brand">
          <Link to="/" className="workbench-chip workbench-chip--ghost">
            ← 返回
          </Link>

          <div className="workbench-title-card">
            {isRenaming ? (
              <input
                ref={titleInputRef}
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={handleRenameCommit}
                onKeyDown={handleTitleKeyDown}
                className="workbench-title-input"
                aria-label="重命名画布"
              />
            ) : (
              <button
                type="button"
                className="workbench-title-button"
                onClick={handleRenameStart}
                onMouseDown={handleToolbarMouseDown}
              >
                <span>{board.title}</span>
              </button>
            )}
            <p>最近更新：{formatDate(board.updatedAt)}</p>
          </div>

          <div className="workbench-more" ref={menuRef}>
            <button
              type="button"
              className="workbench-chip workbench-chip--ghost"
              onClick={() => setIsMenuOpen((value) => !value)}
              onMouseDown={handleToolbarMouseDown}
              aria-label="更多操作"
            >
              ⋯
            </button>

            {isMenuOpen ? (
              <div className="workbench-popover-menu">
                <button
                  type="button"
                  onClick={handleRenameStart}
                  onMouseDown={handleToolbarMouseDown}
                >
                  重命名
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={handleDeleteBoard}
                  onMouseDown={handleToolbarMouseDown}
                >
                  删除画布
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="canvas-workbench-zoom workbench-chip">
          <button
            type="button"
            onClick={() => editor.zoomOut()}
            onMouseDown={handleToolbarMouseDown}
            aria-label="缩小"
          >
            −
          </button>
          <button
            type="button"
            className="zoom-readout"
            onClick={() => editor.resetZoom()}
            onMouseDown={handleToolbarMouseDown}
            aria-label="重置缩放"
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            onClick={() => editor.zoomIn()}
            onMouseDown={handleToolbarMouseDown}
            aria-label="放大"
          >
            +
          </button>
        </div>
      </div>

      <div className="canvas-workbench-toolbar">
        {TOOL_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`workbench-tool-button ${getToolIsActive(item.id) ? 'is-active' : ''}`}
            onClick={() => handleToolSelect(item.id)}
            onMouseDown={handleToolbarMouseDown}
            aria-label={item.label}
            title={item.label}
          >
            <ToolbarIcon icon={item.icon} />
          </button>
        ))}

        <div className="workbench-toolbar-divider" aria-hidden="true" />

        <button
          type="button"
          className={`workbench-tool-button workbench-generator-button ${assistantMode === 'image-generator' ? 'is-active' : ''}`}
          onClick={() => createGeneratorCard()}
          onMouseDown={handleToolbarMouseDown}
          aria-label="Image Generator"
          title="Image Generator"
        >
          <ToolbarIcon icon="generator" />
        </button>
      </div>

      {floatingActionStyle ? (
        <div className="canvas-workbench-actionbar" style={floatingActionStyle}>
          {IMAGE_EDIT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={activePreset === preset ? 'is-active' : ''}
              onClick={() => handleSelectPreset(preset)}
              onMouseDown={handleToolbarMouseDown}
            >
              {ACTION_PRESETS[preset].label}
            </button>
          ))}
          <button
            type="button"
            className="camera-angle-action-trigger"
            onClick={() => void openCameraAngleDialog()}
            onMouseDown={handleToolbarMouseDown}
          >
            视角调节
          </button>
        </div>
      ) : null}

      {selectionImagineStyle ? (
        <div className="canvas-workbench-imaginebar" style={selectionImagineStyle}>
          <button
            type="button"
            onClick={() => void enqueueSelectionImagineTask()}
            onMouseDown={handleToolbarMouseDown}
            disabled={selectionImaginePending}
          >
            {selectionImaginePending ? 'Imagining…' : 'imagine'}
          </button>
          {selectionImagineError ? (
            <p className="canvas-workbench-imagine-status is-error">{selectionImagineError}</p>
          ) : null}
        </div>
      ) : null}

      {generatorOverlayLayout && selectedGeneratorImage ? (
        <>
          <div
            className="generator-card-header"
            style={{
              left: generatorOverlayLayout.headerLeft,
              top: generatorOverlayLayout.headerTop,
              width: generatorOverlayLayout.headerWidth,
            }}
          >
            <span className="generator-card-title">
              <ToolbarIcon icon="generator" />
              <span>Image Generator</span>
            </span>
            <span className="generator-card-size">{generatorShapeSizeLabel}</span>
          </div>

          <form
            className="generator-prompt-dock"
            style={{
              left: generatorOverlayLayout.promptLeft,
              top: generatorOverlayLayout.promptTop,
              width: generatorOverlayLayout.promptWidth,
            }}
            onSubmit={handleGeneratorFormSubmit}
          >
            <textarea
              ref={generatorPromptInputRef}
              value={generatorPrompt}
              disabled={generatorBusy}
              onChange={(event) => {
                setGeneratorPrompt(event.target.value)
                setGeneratorError('')
              }}
              onBlur={() => persistGeneratorPrompt(selectedGeneratorImage.id, generatorPrompt.trim())}
              onKeyDown={handleGeneratorPromptKeyDown}
              placeholder={ACTION_PRESETS['text-to-image'].placeholder}
              rows={4}
            />

            <div className="generator-prompt-footer">
              <div className="generator-prompt-toolbar">
                <label className="generator-prompt-field generator-prompt-field--model">
                  <span className="generator-prompt-field-label">Model</span>
                  <select
                    value={generatorImageModel}
                    disabled={generatorBusy}
                    onChange={(event) =>
                      handleGeneratorModelChange(event.target.value as ImageGeneratorModel)
                    }
                    aria-label="选择生成模型"
                  >
                    {IMAGE_GENERATOR_MODELS.map((model) => (
                      <option key={model} value={model}>
                        {IMAGE_GENERATOR_MODEL_LABELS[model]}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="generator-prompt-actions">
                  <div className="generator-size-group" role="group" aria-label="选择清晰度">
                    {IMAGE_GENERATION_SIZES.map((imageSize) => (
                      <button
                        key={imageSize}
                        type="button"
                        className={imageSize === generatorImageSize ? 'is-active' : ''}
                        disabled={generatorBusy}
                        aria-pressed={imageSize === generatorImageSize}
                        onClick={() => handleGeneratorSizeChange(imageSize)}
                      >
                        {imageSize}
                      </button>
                    ))}
                  </div>

                  <label className="generator-prompt-field generator-prompt-field--ratio">
                    <span className="generator-prompt-field-label">Ratio</span>
                    <select
                      value={generatorAspectRatio}
                      disabled={generatorBusy}
                      onChange={(event) =>
                        selectedGeneratorImage
                          ? resizeGeneratorCard(
                              selectedGeneratorImage,
                              event.target.value as ImageAspectRatio
                            )
                          : undefined
                      }
                      aria-label="选择生成卡片比例"
                    >
                      {IMAGE_ASPECT_RATIOS.map((ratio) => (
                        <option key={ratio} value={ratio}>
                          {ratio}
                        </option>
                      ))}
                    </select>
                  </label>

                  {generatorBusy ? (
                    <button
                      type="button"
                      className="generator-secondary-button"
                      onClick={() => selectedGeneratorTask && handleCancelTask(selectedGeneratorTask.id)}
                    >
                      Cancel
                    </button>
                  ) : (
                    <button type="submit" disabled={!canGenerateFromCard}>
                      Generate
                    </button>
                  )}
                </div>
              </div>
            </div>

            <p className={`generator-prompt-status ${selectedGeneratorTask?.status === 'failed' ? 'is-error' : ''}`}>
              {generatorError || generatorStatusText}
            </p>
          </form>
        </>
      ) : null}

      <CameraAngleDialog
        isOpen={isCameraAngleOpen}
        sourcePreviewUrl={cameraSourcePreviewUrl}
        sourceWidth={cameraSourceSize.width}
        sourceHeight={cameraSourceSize.height}
        sourceLoading={cameraSourceLoading}
        cameraView={cameraDraftView}
        runStatus={cameraRunStatus}
        generatedPreviewUrl={cameraGeneratedPreviewUrl}
        error={cameraError}
        onChangeView={setCameraDraftView}
        onRun={() => void runCameraAngleGeneration()}
        onClose={closeCameraAngleDialog}
        onConfirm={completeCameraAngleDialog}
        canRun={cameraCanRun}
        canConfirm={cameraCanConfirm}
      />

      {showSidebar ? (
        <aside className="canvas-workbench-sidebar">
          <div className="workbench-sidebar-header">
            <div>
              <p className="eyebrow">Agent</p>
              <h2>图片任务助手</h2>
            </div>
            <span className="task-count-pill">{tasks.length} 个任务</span>
          </div>

          <div className="workbench-selection-card">
            {selectedImagePreview ? (
              <>
                <div className="workbench-selection-preview-shell">
                  <div
                    ref={maskPreviewStageRef}
                    className={`workbench-selection-preview ${maskEnabled ? 'is-mask-enabled' : ''}`}
                    style={{ aspectRatio: `${selectedImagePreview.width} / ${selectedImagePreview.height}` }}
                  >
                    <img
                      src={selectedImagePreview.src}
                      alt="当前选中图片预览"
                      onError={handlePreviewImageError}
                      draggable={false}
                    />
                    <canvas
                      ref={maskPreviewCanvasRef}
                      className={`workbench-selection-mask-canvas ${maskEnabled && showMaskOverlay ? 'is-interactive' : ''}`}
                      onPointerDown={handleMaskPointerDown}
                      onPointerMove={handleMaskPointerMove}
                      onPointerUp={handleMaskPointerEnd}
                      onPointerCancel={handleMaskPointerEnd}
                    />
                  </div>
                </div>
                <div className="workbench-selection-meta">
                  <strong>{selectionCardTitle}</strong>
                  <p>
                    {selectedImagePreview.width} × {selectedImagePreview.height}
                  </p>
                  {assistantMode === 'image-edit' ? (
                    <p>{maskEnabled ? '局部蒙版已开启' : '可直接整图编辑，也可开启蒙版只改局部。'}</p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="workbench-selection-empty">
                <strong>{selectionCardTitle}</strong>
                <p>{selectionMessage}</p>
              </div>
            )}
          </div>

          <div className="workbench-sidebar-note">{selectionMessage}</div>

          {assistantMode === 'image-edit' ? (
            <div className="workbench-mask-panel">
              <div className="workbench-mask-panel__header">
                <div>
                  <strong>语义蒙版</strong>
                  <p>{maskStatusText}</p>
                </div>
                <button
                  type="button"
                  className={`workbench-mask-toggle ${maskEnabled ? 'is-active' : ''}`}
                  onClick={() => {
                    setMaskEnabled((value) => !value)
                    setShowMaskOverlay(true)
                    setSidebarError('')
                  }}
                  onMouseDown={handleToolbarMouseDown}
                  disabled={!canUseMaskEditor}
                >
                  {maskEnabled ? '已开启' : '开启蒙版'}
                </button>
              </div>

              <div className="workbench-mask-controls">
                <button
                  type="button"
                  className={maskTool === 'paint' ? 'is-active' : ''}
                  onClick={() => setMaskTool('paint')}
                  onMouseDown={handleToolbarMouseDown}
                  disabled={!maskEnabled || !canUseMaskEditor}
                >
                  画笔
                </button>
                <button
                  type="button"
                  className={maskTool === 'erase' ? 'is-active' : ''}
                  onClick={() => setMaskTool('erase')}
                  onMouseDown={handleToolbarMouseDown}
                  disabled={!maskEnabled || !canUseMaskEditor}
                >
                  橡皮擦
                </button>
                <select
                  value={maskBrushSize}
                  onChange={(event) => setMaskBrushSize(Number(event.target.value))}
                  disabled={!maskEnabled || !canUseMaskEditor}
                  aria-label="选择蒙版笔刷大小"
                >
                  {MASK_BRUSH_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}px
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowMaskOverlay((value) => !value)}
                  onMouseDown={handleToolbarMouseDown}
                  disabled={!maskEnabled || !canUseMaskEditor}
                >
                  {showMaskOverlay ? '隐藏遮罩' : '显示遮罩'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMaskStrokes([])
                    setSidebarError('')
                  }}
                  onMouseDown={handleToolbarMouseDown}
                  disabled={!maskEnabled || !canUseMaskEditor || maskStrokes.length === 0}
                >
                  清空
                </button>
              </div>
            </div>
          ) : null}

          <div className="workbench-preset-card">
            <div className="workbench-preset-card__top">
              <span className="active-preset-badge">{activePresetDefinition.label}</span>
              <span>比例 {sidebarAspectRatio}</span>
            </div>
            <p>{presetHelperText}</p>
          </div>

          <div className="workbench-task-summary">
            <span>运行中 {runningCount}</span>
            <span>排队 {queueCount}</span>
            <span>成功 {successCount}</span>
          </div>

          <div className="workbench-task-panel">
            <div className="workbench-panel-heading">
              <h3>任务历史</h3>
              <span>点击成功任务可重新选中结果</span>
            </div>

            <div className="workbench-task-list">
              {tasks.length === 0 ? (
                <p className="image-task-empty">{emptyTaskMessage}</p>
              ) : (
                tasks.map((task) => {
                  const taskPreset = ACTION_PRESETS[task.sourceAction]
                  const isClickable = task.status === 'succeeded' && !!task.resultShapeId

                  return (
                    <div
                      key={task.id}
                      className={`workbench-task-item task-${task.status} ${isClickable ? 'is-clickable' : ''}`}
                      onClick={() => handleSelectTaskResult(task)}
                      onKeyDown={(event) => {
                        if (!isClickable) return
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleSelectTaskResult(task)
                        }
                      }}
                      role={isClickable ? 'button' : undefined}
                      tabIndex={isClickable ? 0 : -1}
                    >
                      <div className="task-main">
                        <div className="task-headline-row">
                          <span className="task-action-pill">{taskPreset.label}</span>
                          <span className="task-status-pill">{formatTaskStatus(task.status)}</span>
                        </div>
                        <p className="task-prompt">{task.prompt}</p>
                        <p className="task-meta">
                          <span>{task.retries > 0 ? `重试 ${task.retries} 次` : '首次任务'}</span>
                          <span>比例 {task.aspectRatio}</span>
                        </p>
                        {task.error ? <p className="task-error">{task.error}</p> : null}
                      </div>

                      <div className="task-actions">{renderTaskActionButton(task)}</div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <form className="workbench-prompt-form" onSubmit={handleSidebarFormSubmit}>
            <label className="workbench-prompt-label" htmlFor="workbench-prompt-input">
              编辑提示词
            </label>
            <textarea
              id="workbench-prompt-input"
              ref={sidebarPromptInputRef}
              value={sidebarPrompt}
              onChange={(event) => {
                setSidebarPrompt(event.target.value)
                setSidebarError('')
              }}
              onKeyDown={handleSidebarPromptKeyDown}
              placeholder={
                canSubmitSidebarPrompt
                  ? activePresetDefinition.placeholder
                  : '请先调整当前选择后再输入提示词'
              }
              disabled={!canSubmitSidebarPrompt}
              rows={4}
            />

            <div className="workbench-prompt-actions">
              <select
                value={sidebarAspectRatio}
                onChange={(event) =>
                  setSidebarAspectRatioOverride({
                    shapeId: selectedImage?.id ?? null,
                    ratio: event.target.value as ImageAspectRatio,
                  })
                }
                disabled={!canSubmitSidebarPrompt}
                aria-label="选择图片比例"
              >
                {IMAGE_ASPECT_RATIOS.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={!canGenerateSidebar}>
                加入队列
              </button>
            </div>

            <p className="workbench-submit-hint">Enter 提交，Shift + Enter 换行</p>
            {sidebarError ? <p className="image-prompt-error">{sidebarError}</p> : null}
          </form>
        </aside>
      ) : null}
    </div>
  )
}
