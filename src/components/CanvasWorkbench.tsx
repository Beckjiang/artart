import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
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
import type { TLImageShape } from 'tldraw'
import { archiveDebugImages } from '../lib/debugImageArchive'
import { deleteBoard, renameBoard, touchBoard } from '../lib/boards'
import type { BoardMeta } from '../lib/boards'
import {
  generateImageFromPrompt,
  IMAGE_ASPECT_RATIOS,
  pickNearestImageAspectRatio,
} from '../lib/imageGeneration'
import type { ImageAspectRatio } from '../lib/imageGeneration'

const INSERT_GAP = 40
const MAX_TASKS = 16
const SIDEBAR_WIDTH = 360
const BOARD_TOUCH_DEBOUNCE = 1200

type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type AssistantActionPreset =
  | 'quick-edit'
  | 'remove-bg'
  | 'remove-object'
  | 'edit-elements'
  | 'edit-text'

type GenerationTask = {
  id: string
  prompt: string
  aspectRatio: ImageAspectRatio
  status: TaskStatus
  error?: string
  width: number
  height: number
  insertX: number
  insertY: number
  placeholderShapeId: TLImageShape['id']
  referenceImageUrl?: string
  referenceImageMimeType?: string | null
  sourceShapeId: TLImageShape['id']
  sourceAction: AssistantActionPreset
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

const ACTION_PRESETS: Record<AssistantActionPreset, PresetDefinition> = {
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

const TOOL_ITEMS = [
  { id: 'select', label: '选择', shortLabel: 'V' },
  { id: 'frame', label: '画框', shortLabel: 'F' },
  { id: 'rectangle', label: '矩形', shortLabel: 'R' },
  { id: 'text', label: '文本', shortLabel: 'T' },
  { id: 'draw', label: '画笔', shortLabel: 'D' },
  { id: 'asset', label: '媒体', shortLabel: '+' },
] as const

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
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#edf2ff" />
          <stop offset="100%" stop-color="#dbe7ff" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bg)" rx="14" ry="14" />
      <rect x="16" y="16" width="${Math.max(96, width - 32)}" height="${Math.max(
        24,
        height - 32
      )}" fill="none" stroke="#95aacf" stroke-dasharray="8 6" rx="10" ry="10" />
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        font-size="18" font-family="Segoe UI, PingFang SC, sans-serif" fill="#344a75">
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

export function CanvasWorkbench({ board, onBoardMetaChange }: CanvasWorkbenchProps) {
  const editor = useEditor()
  const tools = useTools()
  const navigate = useNavigate()

  const [prompt, setPrompt] = useState('')
  const [panelError, setPanelError] = useState('')
  const [tasks, setTasks] = useState<GenerationTask[]>([])
  const [selectedPreviewSrc, setSelectedPreviewSrc] = useState('')
  const [activePreset, setActivePreset] = useState<AssistantActionPreset>('quick-edit')
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(() => board.title)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const titleInputRef = useRef<HTMLInputElement>(null)
  const promptInputRef = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const boardTouchTimerRef = useRef<number | null>(null)
  const tasksRef = useRef<GenerationTask[]>(tasks)

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])


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
      const onlySelectedShape = editor.getOnlySelectedShape()
      const selectedImage = getSingleSelectedImage(onlySelectedShape)
      const selectedCount = selectedShapes.length
      const isLocked = Boolean(selectedImage?.isLocked)
      const canEditSingleImage = Boolean(selectedImage && selectedCount === 1 && !isLocked)
      const canShowFloatingActions =
        canEditSingleImage && editor.isInAny('select.idle', 'select.pointing_shape')
      const selectionBounds = canShowFloatingActions
        ? editor.getSelectionScreenBounds()
        : undefined

      return {
        selectedCount,
        selectedImage,
        isLocked,
        canEditSingleImage,
        canShowFloatingActions,
        selectionBounds,
      }
    },
    [editor]
  )

  const selectedImage = selectionState.selectedImage
  const canEditSingleImage = selectionState.canEditSingleImage
  const activePresetDefinition = ACTION_PRESETS[activePreset]

  const runningCount = useMemo(
    () => tasks.filter((task) => task.status === 'running').length,
    [tasks]
  )
  const queueCount = useMemo(
    () => tasks.filter((task) => task.status === 'queued').length,
    [tasks]
  )
  const canGenerate = useMemo(
    () => canEditSingleImage && !!prompt.trim(),
    [canEditSingleImage, prompt]
  )

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

  const [aspectRatioOverride, setAspectRatioOverride] = useState<{
    shapeId: TLImageShape['id'] | null
    ratio: ImageAspectRatio
  } | null>(null)

  const aspectRatio = useMemo(() => {
    if (!selectedImage) {
      return aspectRatioOverride?.ratio ?? '1:1'
    }

    if (aspectRatioOverride?.shapeId === selectedImage.id) {
      return aspectRatioOverride.ratio
    }

    return pickNearestImageAspectRatio(selectedImage.props.w, selectedImage.props.h)
  }, [aspectRatioOverride, selectedImage])

  const exportSelectedImagePreview = useCallback(
    async (shape: TLImageShape): Promise<string> => {
      const exported = await editor.toImage([shape.id], { format: 'png' })
      return blobToDataUrl(exported.blob)
    },
    [editor]
  )

  useEffect(() => {
    let disposed = false

    const syncPreview = async () => {
      if (!selectedImage) {
        setSelectedPreviewSrc('')
        return
      }

      const selectedAsset =
        selectedImage.props.assetId && editor.getAsset(selectedImage.props.assetId)

      if (selectedAsset && selectedAsset.type === 'image') {
        const assetWidth = Math.max(1, selectedAsset.props.w || selectedImage.props.w || 48)
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
        const exportedUrl = await exportSelectedImagePreview(selectedImage)
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
  }, [
    editor,
    exportSelectedImagePreview,
    selectedImage,
  ])

  const handlePreviewImageError = useCallback(() => {
    if (!selectedImage) return
    void exportSelectedImagePreview(selectedImage)
      .then((url) => setSelectedPreviewSrc(url))
      .catch(() => {})
  }, [exportSelectedImagePreview, selectedImage])

  const selectedImagePreview = useMemo(() => {
    if (!selectedImage || !selectedPreviewSrc) return null
    return {
      src: selectedPreviewSrc,
      width: Math.max(1, Math.round(selectedImage.props.w)),
      height: Math.max(1, Math.round(selectedImage.props.h)),
    }
  }, [selectedImage, selectedPreviewSrc])

  const floatingActionStyle = useMemo<CSSProperties | null>(() => {
    const bounds = selectionState.selectionBounds
    if (!selectionState.canShowFloatingActions || !bounds) return null

    const left = Math.min(
      bounds.midX,
      Math.max(120, window.innerWidth - SIDEBAR_WIDTH - 48)
    )

    return {
      left,
      top: Math.max(88, bounds.top - 20),
    }
  }, [selectionState.canShowFloatingActions, selectionState.selectionBounds])

  const focusPromptInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      const element = promptInputRef.current
      if (!element) return
      element.focus()
      const length = element.value.length
      element.setSelectionRange(length, length)
    })
  }, [])

  const handleSelectPreset = useCallback(
    (preset: AssistantActionPreset) => {
      setActivePreset(preset)
      setPrompt(ACTION_PRESETS[preset].defaultPrompt)
      setPanelError('')
      focusPromptInput()
    },
    [focusPromptInput]
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
      y: number
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
      editor.run(() => {
        editor.createAssets([placeholderAsset])
        editor.createShape<TLImageShape>({
          id: shapeId,
          type: 'image',
          x,
          y,
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

  const updateTaskStatusPlaceholder = useCallback(
    (shapeId: TLImageShape['id'], label: string, width: number, height: number) => {
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

  const upsertTask = useCallback(
    (taskId: string, updater: (task: GenerationTask) => GenerationTask) => {
      setTasks((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)))
    },
    []
  )

  const handleSelectTaskResult = useCallback(
    (task: GenerationTask) => {
      if (task.status !== 'succeeded' || !task.resultShapeId) return
      if (!editor.getShape(task.resultShapeId)) return
      editor.setSelectedShapes([task.resultShapeId])
    },
    [editor]
  )

  const runTask = useCallback(
    async (taskId: string, controller: AbortController) => {
      const task = tasksRef.current.find((item) => item.id === taskId)
      if (!task) return

      let shapeId = task.placeholderShapeId
      if (!editor.getShape(shapeId)) {
        shapeId = createPlaceholderShape(
          'Queued',
          task.width,
          task.height,
          task.insertX,
          task.insertY
        )
        upsertTask(taskId, (current) => ({ ...current, placeholderShapeId: shapeId }))
      }

      updateTaskStatusPlaceholder(shapeId, 'Generating...', task.width, task.height)

      try {
        const generated = await generateImageFromPrompt({
          prompt: task.prompt,
          width: task.width,
          height: task.height,
          aspectRatio: task.aspectRatio,
          referenceImageUrl: task.referenceImageUrl,
          referenceImageMimeType: task.referenceImageMimeType,
          signal: controller.signal,
        })

        let generatedImageWidth = task.width
        let generatedImageHeight = task.height
        let generatedImageUrl = generated.imageUrl
        let generatedImageMimeType = generated.mimeType || 'image/png'

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

        editor.run(() => {
          editor.createAssets([generatedAsset])

          if (!editor.getShape(shapeId)) return
          editor.updateShapes<TLImageShape>([
            {
              id: shapeId,
              type: 'image',
              props: {
                assetId: generatedAsset.id,
                w: task.width,
                h: task.height,
                crop: null,
                altText: task.prompt,
              },
            },
          ])
          editor.setSelectedShapes([shapeId])
        })

        const debugImages = [
          {
            label: 'input',
            url: task.referenceImageUrl,
            mimeType: task.referenceImageMimeType || undefined,
          },
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
        const cancelled = controller.signal.aborted || isAbortError(error)
        if (cancelled) {
          updateTaskStatusPlaceholder(shapeId, 'Cancelled', task.width, task.height)
          upsertTask(taskId, (current) => ({
            ...current,
            status: 'cancelled',
            updatedAt: Date.now(),
            abortController: undefined,
            error: '任务已取消',
          }))
          return
        }

        const message = error instanceof Error ? error.message : '生成失败，请稍后重试'
        updateTaskStatusPlaceholder(shapeId, 'Generation failed', task.width, task.height)
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
      createPlaceholderShape,
      editor,
      onBoardMetaChange,
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

  const enqueueTask = useCallback(async () => {
    if (!selectedImage || !canEditSingleImage) return

    const promptText = prompt.trim()
    if (!promptText) return

    const selectedAsset =
      selectedImage.props.assetId && editor.getAsset(selectedImage.props.assetId)

    let referenceImageUrl =
      selectedAsset && selectedAsset.type === 'image'
        ? selectedAsset.props.src || undefined
        : undefined
    let referenceImageMimeType =
      selectedAsset && selectedAsset.type === 'image'
        ? selectedAsset.props.mimeType || 'image/png'
        : undefined

    try {
      const exported = await editor.toImage([selectedImage.id], { format: 'png' })
      referenceImageUrl = await blobToDataUrl(exported.blob)
      referenceImageMimeType = 'image/png'
    } catch {
      // noop
    }

    const width = Math.max(96, Math.round(selectedImage.props.w))
    const height = Math.max(96, Math.round(selectedImage.props.h))
    const selectedBounds = editor.getShapePageBounds(selectedImage)
    const insertX = (selectedBounds?.maxX ?? selectedImage.x + width) + INSERT_GAP
    const insertY = selectedBounds?.minY ?? selectedImage.y

    try {
      const placeholderShapeId = createPlaceholderShape(
        'Queued',
        width,
        height,
        insertX,
        insertY
      )
      const now = Date.now()
      const task: GenerationTask = {
        id: createTaskId(),
        prompt: promptText,
        aspectRatio,
        status: 'queued',
        width,
        height,
        insertX,
        insertY,
        placeholderShapeId,
        referenceImageUrl,
        referenceImageMimeType,
        sourceShapeId: selectedImage.id,
        sourceAction: activePreset,
        retries: 0,
        createdAt: now,
        updatedAt: now,
      }

      setTasks((prev) => [task, ...prev].slice(0, MAX_TASKS))
      setPrompt('')
      setPanelError('')
      editor.setSelectedShapes([placeholderShapeId])
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : '创建占位图失败')
    }
  }, [
    activePreset,
    aspectRatio,
    canEditSingleImage,
    createPlaceholderShape,
    editor,
    prompt,
    selectedImage,
  ])

  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void enqueueTask()
    },
    [enqueueTask]
  )

  const handlePromptKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        void enqueueTask()
      }
    },
    [enqueueTask]
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

        updateTaskStatusPlaceholder(
          current.placeholderShapeId,
          'Cancelled',
          current.width,
          current.height
        )

        return {
          ...current,
          status: 'cancelled',
          updatedAt: Date.now(),
          abortController: undefined,
          error: '任务已取消',
        }
      })
    },
    [updateTaskStatusPlaceholder, upsertTask]
  )

  const handleRetryTask = useCallback(
    (taskId: string) => {
      const task = tasksRef.current.find((item) => item.id === taskId)
      if (!task) return
      if (task.status !== 'failed' && task.status !== 'cancelled') return

      if (!editor.getShape(task.placeholderShapeId)) {
        const shapeId = createPlaceholderShape(
          'Queued',
          task.width,
          task.height,
          task.insertX,
          task.insertY
        )
        upsertTask(taskId, (current) => ({
          ...current,
          placeholderShapeId: shapeId,
          resultShapeId: undefined,
        }))
      } else {
        updateTaskStatusPlaceholder(
          task.placeholderShapeId,
          'Queued',
          task.width,
          task.height
        )
      }

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
    [createPlaceholderShape, editor, updateTaskStatusPlaceholder, upsertTask]
  )

  const handleToolbarMouseDown = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
  }, [])

  const selectionMessage = useMemo(() => {
    if (selectionState.selectedCount > 1) {
      return `当前选中了 ${selectionState.selectedCount} 个对象，请只保留一张图片。`
    }

    if (selectedImage && selectionState.isLocked) {
      return '当前图片已锁定，请先解锁后再进行 AI 编辑。'
    }

    if (selectedImage) {
      return '已选中当前图片，可以直接描述修改需求或使用上方快捷动作。'
    }

    return '请选择一张图片以启用右侧任务型助手。'
  }, [selectedImage, selectionState.isLocked, selectionState.selectedCount])

  const getToolIsActive = useCallback(
    (toolId: (typeof TOOL_ITEMS)[number]['id']) => {
      if (toolId === 'rectangle') {
        return currentToolId === 'geo' && currentGeo === 'rectangle'
      }

      if (toolId === 'asset') {
        return false
      }

      return currentToolId === toolId
    },
    [currentGeo, currentToolId]
  )

  const handleToolSelect = useCallback(
    (toolId: (typeof TOOL_ITEMS)[number]['id']) => {
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

  return (
    <div className="canvas-workbench">
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
            <span>{item.shortLabel}</span>
          </button>
        ))}
      </div>

      {floatingActionStyle ? (
        <div className="canvas-workbench-actionbar" style={floatingActionStyle}>
          {(Object.keys(ACTION_PRESETS) as AssistantActionPreset[]).map((preset) => (
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
        </div>
      ) : null}

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
              <img
                src={selectedImagePreview.src}
                alt="当前选中图片预览"
                onError={handlePreviewImageError}
              />
              <div>
                <strong>当前编辑图片</strong>
                <p>
                  {selectedImagePreview.width} × {selectedImagePreview.height}
                </p>
              </div>
            </>
          ) : (
            <div className="workbench-selection-empty">
              <strong>等待选择图片</strong>
              <p>{selectionMessage}</p>
            </div>
          )}
        </div>

        <div className="workbench-sidebar-note">{selectionMessage}</div>

        <div className="workbench-preset-card">
          <div className="workbench-preset-card__top">
            <span className="active-preset-badge">{activePresetDefinition.label}</span>
            <span>比例 {aspectRatio}</span>
          </div>
          <p>{activePresetDefinition.helper}</p>
        </div>

        <div className="workbench-task-summary">
          <span>运行中 {runningCount}</span>
          <span>排队 {queueCount}</span>
          <span>成功 {tasks.filter((task) => task.status === 'succeeded').length}</span>
        </div>

        <div className="workbench-task-panel">
          <div className="workbench-panel-heading">
            <h3>任务历史</h3>
            <span>点击成功任务可重新选中结果</span>
          </div>

          <div className="workbench-task-list">
            {tasks.length === 0 ? (
              <p className="image-task-empty">还没有任务。先选中一张图片并输入提示词。</p>
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

                    <div className="task-actions">
                      {(task.status === 'queued' || task.status === 'running') && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleCancelTask(task.id)
                          }}
                        >
                          取消
                        </button>
                      )}
                      {(task.status === 'failed' || task.status === 'cancelled') && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleRetryTask(task.id)
                          }}
                        >
                          重试
                        </button>
                      )}
                      {task.status === 'succeeded' && task.resultShapeId ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleSelectTaskResult(task)
                          }}
                        >
                          定位结果
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <form className="workbench-prompt-form" onSubmit={handleFormSubmit}>
          <label className="workbench-prompt-label" htmlFor="workbench-prompt-input">
            编辑提示词
          </label>
          <textarea
            id="workbench-prompt-input"
            ref={promptInputRef}
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value)
              setPanelError('')
            }}
            onKeyDown={handlePromptKeyDown}
            placeholder={
              canEditSingleImage
                ? activePresetDefinition.placeholder
                : '请先选中一张图片，再输入修改要求'
            }
            disabled={!canEditSingleImage}
            rows={4}
          />

          <div className="workbench-prompt-actions">
            <select
              value={aspectRatio}
              onChange={(event) =>
                setAspectRatioOverride({
                  shapeId: selectedImage?.id ?? null,
                  ratio: event.target.value as ImageAspectRatio,
                })
              }
              disabled={!canEditSingleImage}
              aria-label="选择图片比例"
            >
              {IMAGE_ASPECT_RATIOS.map((ratio) => (
                <option key={ratio} value={ratio}>
                  {ratio}
                </option>
              ))}
            </select>
            <button type="submit" disabled={!canGenerate}>
              加入队列
            </button>
          </div>

          <p className="workbench-submit-hint">Enter 提交，Shift + Enter 换行</p>
          {panelError ? <p className="image-prompt-error">{panelError}</p> : null}
        </form>
      </aside>
    </div>
  )
}
