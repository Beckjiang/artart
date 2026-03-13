import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import { AssetRecordType, createShapeId, useEditor, useTools } from 'tldraw'
import type { TLBinding, TLImageShape, TLImageShapeProps, TLShapeId } from 'tldraw'
import { archiveDebugImages } from '../../lib/debugImageArchive'
import { touchBoard } from '../../lib/boards'
import {
  generateImageFromPrompt,

  pickNearestImageAspectRatio,
} from '../../lib/imageGeneration'
import type {
  ImageAspectRatio,
  ImageGenerationSize,
  ImageGeneratorModel,
} from '../../lib/imageGeneration'
import {
  getGeneratorCardPlacement,
  getGeneratorCardSize,
  getInsertPlacement,
  shouldRecreateTaskTarget,
} from '../../lib/workbenchGeneration'
import { CameraAngleDialog } from '../CameraAngleDialog'
import {
  DEFAULT_CAMERA_VIEW,
  DEFAULT_MULTI_ANGLE_MODE,
  buildCameraAnglePrompt,
} from '../../lib/cameraAngle'
import type { CameraRunState, CameraViewDraft, MultiAngleMode } from '../../lib/cameraAngle'
import {
  DEFAULT_MASK_FEATHER_PX,
  buildSemanticMaskPrompt,
  compositeMaskedEditResult,
  drawMaskStrokes,
  prepareMaskedEditAssets,
} from '../../lib/maskedImageEdit'
import type {
  MaskBounds,
  MaskStrokeMode,
  NormalizedMaskStroke,
} from '../../lib/maskedImageEdit'
import { GeneratorPromptDock } from './components/GeneratorPromptDock'
import { WorkbenchActionBars } from './components/WorkbenchActionBars'
import { WorkbenchFabMenu } from './components/WorkbenchFabMenu'
import { WorkbenchSidebar } from './components/WorkbenchSidebar'
import { WorkbenchToolbar } from './components/WorkbenchToolbar'
import { WorkbenchTopbar } from './components/WorkbenchTopbar'
import {
  buildSessionEventsUrl,
  createAgentAsset,
  fetchSessionMessages,
  sendAgentMessage,
} from '../../lib/agentChatClient'
import {
  buildAgentMessageRequest,
  canSubmitAgentChat,
  submitSidebarComposer,
} from '../../lib/agentChatComposer'
import { applyAgentStreamEvent, getChatStatusSummary, upsertChatMessage } from '../../lib/agentChatState'
import { buildComposerSelectionDraft } from '../../lib/agentChatSelection'
import type {
  AgentStreamEvent,
  CanvasInsertHint,
  ChatAttachment,
  ChatMessage,
  ChatSession,
} from '../../lib/agentChatTypes'
import {
  ACTION_PRESETS,
  BOARD_TOUCH_DEBOUNCE,
  DEFAULT_GENERATOR_ASPECT_RATIO,
  DEFAULT_GENERATOR_IMAGE_COUNT,
  DEFAULT_GENERATOR_IMAGE_MODEL,
  DEFAULT_GENERATOR_IMAGE_SIZE,
  GENERATED_IMAGE_ROLE,
  GENERATOR_PLACEHOLDER_LABEL,

  INSERT_GAP,

  MAX_TASKS,
  SELECTION_IMAGINE_PROMPT,
} from './constants'
import {
  blobToDataUrl,

  createGeneratorMeta,
  createPlaceholderDataUrl,
  createTaskId,
  createTaskTargetRemovedError,

  getGeneratorMeta,
  getImageDimensions,

  isAbortError,
  isGeneratorShape,
  isTaskTargetRemovedError,
  maybePadImageToTargetRatio,
  normalizeCreatedTextShapeForWorkbench,
  shouldBringCreatedArrowToFrontInWorkbench,
  shouldRemoveArrowImageBindingInWorkbench,

} from './helpers'
import { useWorkbenchSelectionState } from './hooks/useWorkbenchSelectionState'
import { useWorkbenchSidebarLayout } from './hooks/useWorkbenchSidebarLayout'
import type {
  CameraSourceSize,
  CanvasWorkbenchProps,
  GenerationTask,
  GenerationTaskMaskMode,
  GeneratorShapeMeta,
  ImageEditActionPreset,
  ShapeMeta,
  ToolId,
} from './types'
export function CanvasWorkbench({ board, onBoardMetaChange }: CanvasWorkbenchProps) {
  const editor = useEditor()
  const tools = useTools()
  const {
    sidebarWidth,
    isCompactWorkbench,
    sidebarPresentation,
    isSidebarOpen,
    openSidebar,
    closeSidebar,
    toggleSidebar,
    workbenchStyle,
    handleSidebarResizePointerDown,
  } = useWorkbenchSidebarLayout()
  const {
    currentToolId,
    currentGeo,
    zoomPercent,
    selectionState,
    selectedImage,
    assistantMode,
    selectedShapeIdsKey,
    selectedGeneratorImage,
    selectedChatImage,
    selectedSidebarImage,
    selectionNeedsImagineImage,
  } = useWorkbenchSelectionState(editor)

  const [sidebarPrompt, setSidebarPrompt] = useState('')
  const [sidebarError, setSidebarError] = useState('')
  const [generatorPrompt, setGeneratorPrompt] = useState('')
  const [generatorError, setGeneratorError] = useState('')
  const [selectionImagineError, setSelectionImagineError] = useState('')
  const [selectionImaginePending, setSelectionImaginePending] = useState(false)
  const [tasks, setTasks] = useState<GenerationTask[]>([])
  const [selectedPreviewSrc, setSelectedPreviewSrc] = useState('')
  const [activePreset, setActivePreset] = useState<ImageEditActionPreset>('quick-edit')
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
  const [cameraAngleMode, setCameraAngleMode] = useState<MultiAngleMode>(DEFAULT_MULTI_ANGLE_MODE)
  const [cameraError, setCameraError] = useState('')
  const [cameraAbortController, setCameraAbortController] = useState<AbortController | null>(null)
  const [, setChatSession] = useState<ChatSession | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(true)
  const [chatError, setChatError] = useState('')
  const [chatSubmitting, setChatSubmitting] = useState(false)
  const [chatRunId, setChatRunId] = useState<string | null>(null)
  const [dismissedSelectionKey, setDismissedSelectionKey] = useState<string | null>(null)
  const [maskEnabled, setMaskEnabled] = useState(false)
  const [showMaskOverlay, setShowMaskOverlay] = useState(true)
  const [maskTool, setMaskTool] = useState<MaskStrokeMode>('paint')
  const [maskBrushSize, setMaskBrushSize] = useState<number>(24)
  const [maskStrokes, setMaskStrokes] = useState<NormalizedMaskStroke[]>([])
  const [maskStageSize, setMaskStageSize] = useState({ width: 0, height: 0 })

  const sidebarPromptInputRef = useRef<HTMLTextAreaElement>(null)
  const generatorPromptInputRef = useRef<HTMLTextAreaElement>(null)
  const maskPreviewStageRef = useRef<HTMLDivElement>(null)
  const maskPreviewCanvasRef = useRef<HTMLCanvasElement>(null)
  const boardTouchTimerRef = useRef<number | null>(null)
  const tasksRef = useRef<GenerationTask[]>(tasks)
  const cameraAbortControllerRef = useRef<AbortController | null>(null)
  const cameraAngleSessionRef = useRef(0)
  const chatEventSourceRef = useRef<EventSource | null>(null)
  const activeMaskPointerRef = useRef<number | null>(null)

  useEffect(() => {
    const getCurrentWorkbenchToolId = () => String(editor.getCurrentToolId()).split('.')[0]
    const removeArrowImageBindingIfNeeded = (
      binding: TLBinding,
      source: 'remote' | 'user'
    ) => {
      const fromShape = editor.getShape(binding.fromId)
      const toShape = editor.getShape(binding.toId)

      if (!shouldRemoveArrowImageBindingInWorkbench(binding, source, fromShape, toShape)) {
        return
      }

      editor.deleteBinding(binding.id)
      editor.bringToFront([binding.fromId])
    }
    const cleanupExistingArrowImageBindings = () => {
      const bindingsToDelete = new Map<string, TLBinding>()
      const arrowIdsToBringToFront = new Set<TLShapeId>()

      for (const shape of editor.getCurrentPageShapes()) {
        if (shape.type !== 'image') continue

        for (const binding of editor.getBindingsToShape(shape, 'arrow')) {
          const fromShape = editor.getShape(binding.fromId)

          if (binding.type !== 'arrow' || fromShape?.type !== 'arrow') {
            continue
          }

          bindingsToDelete.set(binding.id, binding)
          arrowIdsToBringToFront.add(binding.fromId)
        }
      }

      if (bindingsToDelete.size === 0) return

      editor.run(() => {
        editor.deleteBindings([...bindingsToDelete.values()])
        if (arrowIdsToBringToFront.size > 0) {
          editor.bringToFront([...arrowIdsToBringToFront])
        }
      }, { history: 'ignore' })
    }

    const disposeBeforeCreate = editor.sideEffects.registerBeforeCreateHandler('shape', (shape, source) =>
      normalizeCreatedTextShapeForWorkbench(shape, source, getCurrentWorkbenchToolId())
    )

    const disposeAfterCreate = editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
      if (!shouldBringCreatedArrowToFrontInWorkbench(shape, source, getCurrentWorkbenchToolId())) {
        return
      }

      editor.run(() => {
        editor.bringToFront([shape.id])
      }, { history: 'ignore' })
    })

    const disposeBindingAfterCreate = editor.sideEffects.registerAfterCreateHandler('binding', (binding, source) => {
      removeArrowImageBindingIfNeeded(binding, source)
    })

    const disposeBindingAfterChange = editor.sideEffects.registerAfterChangeHandler(
      'binding',
      (_prev, binding, source) => {
        removeArrowImageBindingIfNeeded(binding, source)
      }
    )

    cleanupExistingArrowImageBindings()

    return () => {
      disposeBindingAfterChange()
      disposeBindingAfterCreate()
      disposeAfterCreate()
      disposeBeforeCreate()
    }
  }, [editor])

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
      selectedGeneratorTask.imageSize,
      selectedGeneratorTask.imageCount
    )
  }, [generatorMeta, selectedGeneratorTask])
  const generatorAspectRatio = resolvedGeneratorMeta?.aspectRatio ?? DEFAULT_GENERATOR_ASPECT_RATIO
  const generatorImageModel = resolvedGeneratorMeta?.imageModel ?? DEFAULT_GENERATOR_IMAGE_MODEL
  const generatorImageSize = resolvedGeneratorMeta?.imageSize ?? DEFAULT_GENERATOR_IMAGE_SIZE
  const generatorImageCount = resolvedGeneratorMeta?.imageCount ?? DEFAULT_GENERATOR_IMAGE_COUNT
  const activePresetDefinition = ACTION_PRESETS[activePreset]
  const composerSelectionDraft = useMemo(() => {
    if (dismissedSelectionKey === selectedShapeIdsKey) {
      return null
    }

    const selectionBounds = selectionState.selectionPageBounds
      ? {
          x: selectionState.selectionPageBounds.x,
          y: selectionState.selectionPageBounds.y,
          width: selectionState.selectionPageBounds.w,
          height: selectionState.selectionPageBounds.h,
          minY: selectionState.selectionPageBounds.minY,
          maxX: selectionState.selectionPageBounds.maxX,
        }
      : null

    const insertHint: CanvasInsertHint | null =
      selectionState.selectedCount === 1 && selectedChatImage
        ? {
            mode: 'image-edit',
            sourceShapeId: selectedChatImage.id,
            outputWidth: Math.round(selectedChatImage.props.w),
            outputHeight: Math.round(selectedChatImage.props.h),
          }
        : selectionState.selectedCount > 1 && selectionState.firstSelectedImage
          ? {
              mode: 'selection-imagine',
              selectionBounds,
              outputWidth: Math.round(selectionState.firstSelectedImage.width),
              outputHeight: Math.round(selectionState.firstSelectedImage.height),
            }
          : null

    return buildComposerSelectionDraft({
      boardId: board.id,
      selectedShapeIds: selectionState.selectedShapeIds,
      selectedImageShapeIds: selectionState.selectedImageShapeIds,
      selectedCount: selectionState.selectedCount,
      selectedImageCount: selectionState.selectedImageCount,
      sourceShapeId: selectedChatImage?.id ?? null,
      previewUrl: selectionState.selectedCount === 1 ? selectedPreviewSrc : undefined,
      selectionBounds,
      insertHint,
    })
  }, [
    board.id,
    dismissedSelectionKey,
    selectedChatImage,
    selectedPreviewSrc,
    selectedShapeIdsKey,
    selectionState.firstSelectedImage,
    selectionState.selectedCount,
    selectionState.selectedImageCount,
    selectionState.selectedImageShapeIds,
    selectionState.selectedShapeIds,
    selectionState.selectionPageBounds,
  ])
  const chatStatusSummary = useMemo(() => getChatStatusSummary(chatMessages), [chatMessages])
  const chatStatusText = chatSubmitting ? '正在发送消息…' : chatStatusSummary
  const chatComposerPlaceholder = useMemo(() => {
    if (assistantMode === 'selection-imagine') {
      return '描述你想基于当前选区生成什么内容'
    }

    if (composerSelectionDraft?.kind === 'single-image') {
      return activePresetDefinition.placeholder
    }

    return '请输入你的设计需求'
  }, [activePresetDefinition.placeholder, assistantMode, composerSelectionDraft?.kind])
  const canSubmitChat = canSubmitAgentChat({
    promptText: sidebarPrompt,
    selectionDraft: composerSelectionDraft,
    chatRunId,
    chatSubmitting,
  })
  const canSubmitSidebarPrompt = assistantMode === 'image-edit'
  const canGenerateSidebar = canSubmitSidebarPrompt && !!sidebarPrompt.trim()
  const generatorBusy =
    selectedGeneratorTask?.status === 'queued' ||
    selectedGeneratorTask?.status === 'running' ||
    Boolean(chatRunId) ||
    chatSubmitting
  const canGenerateFromCard = Boolean(selectedGeneratorImage && generatorPrompt.trim() && !generatorBusy)
  const cameraCanRun =
    isCameraAngleOpen &&
    !cameraSourceLoading &&
    Boolean(cameraReferenceImageUrl) &&
    cameraRunStatus !== 'running'

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
    setCameraAngleMode(DEFAULT_MULTI_ANGLE_MODE)
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

  const showDockedSidebar = sidebarPresentation === 'docked' && isSidebarOpen
  const showOverlaySidebar = sidebarPresentation === 'overlay' && isSidebarOpen
  const showDockedChatPill = sidebarPresentation === 'docked' && !isSidebarOpen

  const floatingActionStyle = useMemo<CSSProperties | null>(() => {
    const bounds = selectionState.selectionBounds
    if (isCameraAngleOpen || !selectionState.canShowFloatingActions || !bounds) return null

    const sidebarOffset = showDockedSidebar ? sidebarWidth : 0
    const left = Math.min(bounds.midX, Math.max(120, window.innerWidth - sidebarOffset - 48))

    return {
      left,
      top: Math.max(88, bounds.top - 20),
    }
  }, [
    isCameraAngleOpen,
    selectionState.canShowFloatingActions,
    selectionState.selectionBounds,
    showDockedSidebar,
    sidebarWidth,
  ])

  const selectionImagineStyle = useMemo<CSSProperties | null>(() => {
    const bounds = selectionState.selectionBounds
    if (!selectionState.canImagineSelection || !bounds) return null

    const sidebarOffset = showDockedSidebar ? sidebarWidth : 0
    const left = Math.min(bounds.midX, Math.max(120, window.innerWidth - sidebarOffset - 48))

    return {
      left,
      top: Math.min(window.innerHeight - 96, bounds.bottom + 18),
    }
  }, [selectionState.canImagineSelection, selectionState.selectionBounds, showDockedSidebar, sidebarWidth])

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

  const replaceImageShapeAsset = useCallback(
    ({
      shapeId,
      name,
      imageUrl,
      mimeType,
      width,
      height,
      altText,
      meta,
    }: {
      shapeId: TLImageShape['id']
      name: string
      imageUrl: string
      mimeType?: string | null
      width: number
      height: number
      altText?: string
      meta?: ShapeMeta
    }) => {
      if (!editor.getShape(shapeId)) return null

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

      editor.run(() => {
        editor.createAssets([imageAsset])
        editor.updateShapes<TLImageShape>([
          {
            id: shapeId,
            type: 'image',
            ...(meta ? { meta } : {}),
            props: {
              assetId: imageAsset.id,
              w: width,
              h: height,
              altText,
            },
          },
        ])
      })

      return shapeId
    },
    [editor]
  )

  const insertGeneratedImageFromChat = useCallback(
    ({
      attachment,
      insertHint,
    }: {
      attachment: ChatAttachment
      insertHint: CanvasInsertHint
    }) => {
      const width = Math.max(64, Math.round(attachment.width ?? 1024))
      const height = Math.max(64, Math.round(attachment.height ?? 1024))
      const imageUrl = attachment.previewUrl || attachment.dataUrl
      if (!imageUrl) return null

      if (insertHint.mode === 'generator-card' && insertHint.targetShapeId) {
        const replaced = replaceImageShapeAsset({
          shapeId: insertHint.targetShapeId as TLImageShape['id'],
          name: attachment.name,
          imageUrl,
          mimeType: attachment.mimeType,
          width: Math.max(64, Math.round(insertHint.width)),
          height: Math.max(64, Math.round(insertHint.height)),
          altText: attachment.name,
          meta: {
            canvasRole: GENERATED_IMAGE_ROLE,
          },
        })
        if (replaced) {
          selectAndRevealShape(replaced)
          return replaced
        }
      }

      if (insertHint.mode === 'image-edit' && insertHint.sourceShapeId) {
        const sourceShape = editor.getShape<TLImageShape>(insertHint.sourceShapeId as TLImageShape['id'])
        const sourceBounds = sourceShape ? editor.getShapePageBounds(sourceShape) : null
        if (sourceShape) {
          const placement = getInsertPlacement('image-edit', {
            viewportBounds: editor.getViewportPageBounds(),
            selectedImage: {
              shapeId: sourceShape.id,
              x: sourceShape.x,
              y: sourceShape.y,
              width: sourceShape.props.w,
              height: sourceShape.props.h,
              bounds: sourceBounds
                ? {
                    minY: sourceBounds.minY,
                    maxX: sourceBounds.maxX,
                  }
                : undefined,
            },
            insertGap: INSERT_GAP,
          })

          const shapeId = createImageShape({
            name: attachment.name,
            imageUrl,
            mimeType: attachment.mimeType,
            width: placement.width,
            height: placement.height,
            x: placement.insertX,
            y: placement.insertY,
            altText: attachment.name,
          })
          selectAndRevealShape(shapeId)
          return shapeId
        }
      }

      if (insertHint.mode === 'selection-imagine' && insertHint.selectionBounds) {
        const placement = getInsertPlacement('selection-imagine', {
          viewportBounds: editor.getViewportPageBounds(),
          selectionBounds: insertHint.selectionBounds,
          selectionOutputSize: {
            width: insertHint.outputWidth ?? width,
            height: insertHint.outputHeight ?? height,
          },
          insertGap: INSERT_GAP,
        })

        const shapeId = createImageShape({
          name: attachment.name,
          imageUrl,
          mimeType: attachment.mimeType,
          width: placement.width,
          height: placement.height,
          x: placement.insertX,
          y: placement.insertY,
          altText: attachment.name,
        })
        selectAndRevealShape(shapeId)
        return shapeId
      }

      const viewportBounds = editor.getViewportPageBounds()
      const centeredX = Math.round(viewportBounds.x + viewportBounds.w / 2 - width / 2)
      const centeredY = Math.round(viewportBounds.y + viewportBounds.h / 2 - height / 2)
      const shapeId = createImageShape({
        name: attachment.name,
        imageUrl,
        mimeType: attachment.mimeType,
        width,
        height,
        x: insertHint.mode === 'generator-card' ? insertHint.x : centeredX,
        y: insertHint.mode === 'generator-card' ? insertHint.y : centeredY,
        altText: attachment.name,
      })
      selectAndRevealShape(shapeId)
      return shapeId
    },
    [createImageShape, editor, replaceImageShapeAsset, selectAndRevealShape]
  )

  const handleLocateChatAttachment = useCallback(
    (attachment: ChatAttachment) => {
      if (!attachment.canvasShapeId) return
      selectAndRevealShape(attachment.canvasShapeId as TLImageShape['id'])
    },
    [selectAndRevealShape]
  )

  const handleReuseChatAttachment = useCallback(
    (attachment: ChatAttachment) => {
      if (!attachment.canvasShapeId) return
      const shape = editor.getShape<TLImageShape>(attachment.canvasShapeId as TLImageShape['id'])
      if (!shape) return
      setDismissedSelectionKey(null)
      editor.setSelectedShapes([shape.id])
      focusSidebarPromptInput()
    },
    [editor, focusSidebarPromptInput]
  )

  const handleAgentEvent = useCallback(
    (event: AgentStreamEvent) => {
      setChatMessages((previous) => applyAgentStreamEvent(previous, event))

      if (event.type === 'message.started') {
        setChatRunId(event.runId)
        return
      }

      if (event.type === 'canvas.result.created') {
        const canvasShapeId = insertGeneratedImageFromChat({
          attachment: event.attachment,
          insertHint: event.insertHint,
        })

        if (canvasShapeId) {
          setChatMessages((previous) =>
            previous.map((message) => {
              if (message.id !== event.messageId) return message
              return {
                ...message,
                attachments: message.attachments.map((attachment) =>
                  attachment.id === event.attachment.id
                    ? {
                        ...attachment,
                        canvasShapeId,
                      }
                    : attachment
                ),
              }
            })
          )
        }
        return
      }

      if (event.type === 'message.completed' || event.type === 'run.failed') {
        setChatRunId(null)
      }
    },
    [insertGeneratedImageFromChat]
  )

  useEffect(() => {
    let disposed = false
    setChatLoading(true)
    setChatError('')

    void fetchSessionMessages(board.id)
      .then((response) => {
        if (disposed) return
        setChatSession(response.session)
        setChatMessages(response.messages)
      })
      .catch((error) => {
        if (disposed) return
        setChatError(error instanceof Error ? error.message : '加载会话失败')
      })
      .finally(() => {
        if (disposed) return
        setChatLoading(false)
      })

    return () => {
      disposed = true
    }
  }, [board.id])

  useEffect(() => {
    chatEventSourceRef.current?.close()
    const eventSource = new EventSource(buildSessionEventsUrl(board.id))
    chatEventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        handleAgentEvent(JSON.parse(event.data) as AgentStreamEvent)
      } catch {
        // noop
      }
    }

    eventSource.onerror = () => {
      // EventSource 会自动重连，这里不主动打断创作流程
    }

    return () => {
      eventSource.close()
      if (chatEventSourceRef.current === eventSource) {
        chatEventSourceRef.current = null
      }
    }
  }, [board.id, handleAgentEvent])

  const sendChatTurn = useCallback(
    async ({
      promptText,
      selectionDraft,
      insertHint,
    }: {
      promptText?: string
      selectionDraft?: typeof composerSelectionDraft
      insertHint?: CanvasInsertHint | null
    } = {}) => {
      const nextPrompt = (promptText ?? sidebarPrompt).trim()
      const nextSelectionDraft = selectionDraft ?? composerSelectionDraft
      const hasPayload = Boolean(nextPrompt) || Boolean(nextSelectionDraft)

      if (!hasPayload) {
        return '请先输入提示，或附带当前选区。'
      }

      if (chatRunId || chatSubmitting) {
        return '当前已有任务在处理中，请稍候。'
      }

      setChatError('')
      setChatSubmitting(true)

      let uploadedAssetId: string | null = null

      try {
        if (nextSelectionDraft?.kind === 'single-image' && selectedChatImage) {
          const snapshot = await exportSelectedImageSnapshot(selectedChatImage)
          const { asset } = await createAgentAsset({
            boardId: board.id,
            name: 'selected-image',
            kind: 'selection-image',
            mimeType: snapshot.mimeType,
            previewUrl: selectedPreviewSrc || snapshot.imageUrl,
            dataUrl: snapshot.imageUrl,
            width: snapshot.width,
            height: snapshot.height,
            shapeId: selectedChatImage.id,
          })
          uploadedAssetId = asset.id
        }

        if (nextSelectionDraft?.kind === 'selection-with-images') {
          const exported = await editor.toImage(nextSelectionDraft.selectedShapeIds as TLShapeId[], {
            format: 'png',
          })
          const imageUrl = await blobToDataUrl(exported.blob)
          const dimensions = await getImageDimensions(imageUrl)
          const { asset } = await createAgentAsset({
            boardId: board.id,
            name: 'selection-composite',
            kind: 'selection-image',
            mimeType: 'image/png',
            previewUrl: imageUrl,
            dataUrl: imageUrl,
            width: dimensions.width,
            height: dimensions.height,
            shapeId: nextSelectionDraft.selectedImageShapeIds[0] ?? null,
          })
          uploadedAssetId = asset.id
        }

        const response = await sendAgentMessage(
          board.id,
          buildAgentMessageRequest({
            boardId: board.id,
            promptText: nextPrompt,
            selectionDraft: nextSelectionDraft,
            uploadedAssetId,
            insertHint,
            clientMessageId: createTaskId(),
          })
        )

        setChatSession(response.session)
        setChatRunId(response.runId)
        setChatMessages((previous) => upsertChatMessage(previous, response.acceptedMessage))
        setSidebarPrompt('')
        setSidebarError('')
        setChatSubmitting(false)
        return null
      } catch (error) {
        setChatSubmitting(false)
        setChatError(error instanceof Error ? error.message : '发送失败，请稍后重试。')
        return '发送失败，请稍后重试。'
      }
    },
    [
      board.id,
      chatRunId,
      chatSubmitting,
      composerSelectionDraft,
      editor,
      exportSelectedImageSnapshot,
      selectedChatImage,
      selectedPreviewSrc,
      sidebarPrompt,
    ]
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
    setCameraAngleMode(DEFAULT_MULTI_ANGLE_MODE)
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

  const applyCameraAngleGeneration = useCallback(async () => {
    if (!cameraCanRun || !cameraReferenceImageUrl) return

    const sessionId = cameraAngleSessionRef.current
    const controller = new AbortController()
    const prompt = buildCameraAnglePrompt(cameraDraftView, cameraSourceSize, cameraAngleMode)
    const activeSourceShapeId = cameraSourceShapeId

    if (!activeSourceShapeId) {
      setCameraRunStatus('failed')
      setCameraError('???????????')
      return
    }

    const liveShape = editor.getShape<TLImageShape>(activeSourceShapeId)
    if (!liveShape || liveShape.type !== 'image') {
      setCameraRunStatus('failed')
      setCameraError('????????????')
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

    const placeholderShapeId = createPlaceholderShape(
      '????',
      placement.width,
      placement.height,
      placement.insertX,
      placement.insertY,
      {
        canvasRole: GENERATED_IMAGE_ROLE,
      }
    )

    selectAndRevealShape(placeholderShapeId)

    setCameraAbortController(controller)
    setCameraRunStatus('running')
    setCameraError('')

    try {
      const generated = await generateImageFromPrompt({
        runId: String(sessionId),
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

      if (cameraAngleSessionRef.current !== sessionId) {
        updateTaskStatusPlaceholder(placeholderShapeId, '???', placement.width, placement.height)
        return
      }

      const replaced = replaceImageShapeAsset({
        shapeId: placeholderShapeId,
        name: 'multi-angle-result',
        imageUrl: nextImageUrl,
        mimeType: nextMimeType,
        width: placement.width,
        height: placement.height,
        altText: prompt,
      })

      const resultShapeId =
        replaced ??
        createImageShape({
          name: 'multi-angle-result',
          imageUrl: nextImageUrl,
          mimeType: nextMimeType,
          width: placement.width,
          height: placement.height,
          x: placement.insertX,
          y: placement.insertY,
          altText: prompt,
          meta: {
            canvasRole: GENERATED_IMAGE_ROLE,
          },
        })

      selectAndRevealShape(resultShapeId)

      const updated = touchBoard(board.id)
      if (updated) {
        onBoardMetaChange?.()
      }

      resetCameraAngleDialog()
    } catch (error) {
      const aborted = controller.signal.aborted || isAbortError(error)
      if (aborted) {
        updateTaskStatusPlaceholder(placeholderShapeId, '???', placement.width, placement.height)
      } else {
        updateTaskStatusPlaceholder(placeholderShapeId, '????', placement.width, placement.height)
      }

      if (cameraAngleSessionRef.current !== sessionId) return
      if (aborted) {
        setCameraRunStatus('idle')
        setCameraError('')
        return
      }

      setCameraRunStatus('failed')
      setCameraError(error instanceof Error ? error.message : '?????????????')
    } finally {
      if (cameraAngleSessionRef.current === sessionId) {
        setCameraAbortController(null)
      }
    }
  }, [
    board.id,
    cameraAngleMode,
    cameraCanRun,
    cameraDraftView,
    cameraReferenceImageMimeType,
    cameraReferenceImageUrl,
    cameraSourceShapeId,
    cameraSourceSize,
    createImageShape,
    createPlaceholderShape,
    editor,
    onBoardMetaChange,
    replaceImageShapeAsset,
    resetCameraAngleDialog,
    selectAndRevealShape,
    updateTaskStatusPlaceholder,
  ])

  const resetMultiAnglePanel = useCallback(() => {
    setCameraRunStatus('idle')
    setCameraError('')
  }, [])

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

  const handleGeneratorCountChange = useCallback(
    (imageCount: number) => {
      if (!selectedGeneratorImage || generatorBusy) return

      const safeImageCount = Number.isFinite(imageCount)
        ? Math.max(1, Math.min(4, Math.round(imageCount)))
        : DEFAULT_GENERATOR_IMAGE_COUNT
      updateGeneratorShapeMeta(selectedGeneratorImage.id, { imageCount: safeImageCount })
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
          ? createGeneratorMeta(
              task.aspectRatio,
              task.prompt,
              task.imageModel,
              task.imageSize,
              task.imageCount
            )
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
          runId: String(taskId),
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
      const baseX = Math.round(liveGeneratorShape.x)
      const baseY = Math.round(liveGeneratorShape.y)
      const count = liveGeneratorMeta.imageCount

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
          liveGeneratorMeta.imageSize,
          liveGeneratorMeta.imageCount
        )
      )

      const now = Date.now()
      const nextTasks: GenerationTask[] = []

      for (let i = 0; i < count; i += 1) {
        const col = i % 2
        const row = Math.floor(i / 2)
        const insertX = baseX + col * (nextWidth + INSERT_GAP)
        const insertY = baseY + row * (nextHeight + INSERT_GAP)
        const isPrimary = i === 0

        const targetShapeId = isPrimary
          ? liveGeneratorShape.id
          : createPlaceholderShape('Queued', nextWidth, nextHeight, insertX, insertY)

        nextTasks.push({
          id: createTaskId(),
          mode: 'image-generator',
          origin: isPrimary ? 'image-generator-card' : 'image-generator-batch',
          prompt: promptText,
          aspectRatio: liveGeneratorMeta.aspectRatio,
          imageModel: liveGeneratorMeta.imageModel,
          imageSize: liveGeneratorMeta.imageSize,
          imageCount: liveGeneratorMeta.imageCount,
          status: 'queued',
          width: nextWidth,
          height: nextHeight,
          insertX,
          insertY,
          targetShapeId,
          sourceAction: 'text-to-image',
          retries: 0,
          createdAt: now,
          updatedAt: now,
        })
      }

      setTasks((prev) => [...nextTasks, ...prev].slice(0, MAX_TASKS))
      setGeneratorError('')
    } catch (error) {
      setGeneratorError(error instanceof Error ? error.message : '创建生成任务失败')
    }
  }, [
    assistantMode,
    createPlaceholderShape,
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

  const handleChatFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void submitSidebarComposer({
        surface: 'chat-panel',
        sendAgentTurn: sendChatTurn,
        enqueueLegacyTask: enqueueSidebarTask,
      })
    },
    [enqueueSidebarTask, sendChatTurn]
  )

  const handleGeneratorFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void enqueueGeneratorTask()
    },
    [enqueueGeneratorTask]
  )

  const handleSidebarPromptChange = useCallback((nextValue: string) => {
    setSidebarPrompt(nextValue)
    setSidebarError('')
    setChatError('')
  }, [])

  const handleSidebarPromptKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        void enqueueSidebarTask()
      }
    },
    [enqueueSidebarTask]
  )

  const handleChatPromptKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        void submitSidebarComposer({
          surface: 'chat-panel',
          sendAgentTurn: sendChatTurn,
          enqueueLegacyTask: enqueueSidebarTask,
        })
      }
    },
    [enqueueSidebarTask, sendChatTurn]
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
                  current.imageSize,
                  current.imageCount
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
            ? createGeneratorMeta(
                task.aspectRatio,
                task.prompt,
                task.imageModel,
                task.imageSize,
                task.imageCount
              )
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

  useEffect(() => {
    if (!showOverlaySidebar) return

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSidebar()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeSidebar, showOverlaySidebar])

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

  const selectionImagineBusy = selectionImaginePending || Boolean(chatRunId) || chatSubmitting

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
        case 'arrow':
          tools.arrow.onSelect('toolbar')
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

  const renderWorkbenchSidebar = (options: { showResizer: boolean; closeActionLabel: string }) => (
    <WorkbenchSidebar
      boardTitle={board.title}
      tasks={tasks}
      chatMessages={chatMessages}
      chatLoading={chatLoading}
      sidebarPrompt={sidebarPrompt}
      chatComposerPlaceholder={chatComposerPlaceholder}
      chatComposerDisabled={Boolean(chatRunId || chatSubmitting)}
      canSubmitChat={canSubmitChat}
      composerSelectionDraft={composerSelectionDraft}
      chatStatusText={chatStatusText}
      combinedError={sidebarError || chatError}
      selectedImagePreview={selectedImagePreview}
      selectionCardTitle={selectionCardTitle}
      selectionMessage={selectionMessage}
      assistantMode={assistantMode}
      maskEnabled={maskEnabled}
      showMaskOverlay={showMaskOverlay}
      maskStatusText={maskStatusText}
      canUseMaskEditor={canUseMaskEditor}
      maskTool={maskTool}
      maskBrushSize={maskBrushSize}
      maskStrokeCount={maskStrokes.length}
      activePresetLabel={activePresetDefinition.label}
      presetHelperText={presetHelperText}
      sidebarAspectRatio={sidebarAspectRatio}
      emptyTaskMessage={emptyTaskMessage}
      runningCount={runningCount}
      queueCount={queueCount}
      successCount={successCount}
      canSubmitSidebarPrompt={canSubmitSidebarPrompt}
      canGenerateSidebar={canGenerateSidebar}
      activePlaceholder={activePresetDefinition.placeholder}
      chatInputRef={sidebarPromptInputRef}
      maskPreviewStageRef={maskPreviewStageRef}
      maskPreviewCanvasRef={maskPreviewCanvasRef}
      onResizePointerDown={handleSidebarResizePointerDown}
      showResizer={options.showResizer}
      onRequestClose={closeSidebar}
      closeActionLabel={options.closeActionLabel}
      onChatComposerChange={handleSidebarPromptChange}
      onChatComposerKeyDown={handleChatPromptKeyDown}
      onChatSubmit={handleChatFormSubmit}
      onRemoveSelectionDraft={() => setDismissedSelectionKey(selectedShapeIdsKey || '__empty__')}
      onLocateAttachment={handleLocateChatAttachment}
      onReuseAttachment={handleReuseChatAttachment}
      onPreviewImageError={handlePreviewImageError}
      onMaskPointerDown={handleMaskPointerDown}
      onMaskPointerMove={handleMaskPointerMove}
      onMaskPointerEnd={handleMaskPointerEnd}
      onToggleMaskEnabled={() => {
        setMaskEnabled((value) => !value)
        setShowMaskOverlay(true)
        setSidebarError('')
      }}
      onSelectMaskTool={setMaskTool}
      onBrushSizeChange={setMaskBrushSize}
      onToggleMaskOverlay={() => setShowMaskOverlay((value) => !value)}
      onClearMask={() => {
        setMaskStrokes([])
        setSidebarError('')
      }}
      onToolbarMouseDown={handleToolbarMouseDown}
      onSelectTaskResult={handleSelectTaskResult}
      renderTaskActionButton={renderTaskActionButton}
      onSidebarSubmit={handleSidebarFormSubmit}
      onSidebarPromptChange={(value) => {
        setSidebarPrompt(value)
        setSidebarError('')
      }}
      onSidebarPromptKeyDown={handleSidebarPromptKeyDown}
      onSidebarAspectRatioChange={(ratio) =>
        setSidebarAspectRatioOverride({
          shapeId: selectedImage?.id ?? null,
          ratio,
        })
      }
    />
  )

  return (
    <div
      className={[
        'canvas-workbench',
        showDockedSidebar ? 'has-sidebar' : '',
        showDockedChatPill ? 'no-sidebar' : '',
        isCompactWorkbench ? 'is-compact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={workbenchStyle}
    >
      <WorkbenchTopbar
        zoomPercent={zoomPercent}
        onZoomOut={() => editor.zoomOut()}
        onResetZoom={() => editor.resetZoom()}
        onZoomIn={() => editor.zoomIn()}
        onToolbarMouseDown={handleToolbarMouseDown}
      />

      {isCompactWorkbench ? (
        <WorkbenchFabMenu
          assistantMode={assistantMode}
          isChatOpen={isSidebarOpen}
          getToolIsActive={getToolIsActive}
          onToolSelect={handleToolSelect}
          onCreateGeneratorCard={() => createGeneratorCard()}
          onToggleChat={toggleSidebar}
          onToolbarMouseDown={handleToolbarMouseDown}
        />
      ) : (
        <WorkbenchToolbar
          assistantMode={assistantMode}
          getToolIsActive={getToolIsActive}
          onToolSelect={handleToolSelect}
          onCreateGeneratorCard={() => createGeneratorCard()}
          onToolbarMouseDown={handleToolbarMouseDown}
        />
      )}

      <WorkbenchActionBars
        floatingActionStyle={floatingActionStyle}
        selectionImagineStyle={selectionImagineStyle}
        activePreset={activePreset}
        selectionImagineBusy={selectionImagineBusy}
        selectionImagineError={selectionImagineError}
        onSelectPreset={handleSelectPreset}
        onOpenCameraAngle={() => void openCameraAngleDialog()}
        onEnqueueSelectionImagineTask={() => void enqueueSelectionImagineTask()}
        onToolbarMouseDown={handleToolbarMouseDown}
      />

      <GeneratorPromptDock
        layout={generatorOverlayLayout}
        visible={Boolean(generatorOverlayLayout && selectedGeneratorImage)}
        generatorShapeSizeLabel={generatorShapeSizeLabel}
        generatorPrompt={generatorPrompt}
        generatorBusy={generatorBusy}
        generatorImageModel={generatorImageModel}
        generatorImageSize={generatorImageSize}
        generatorAspectRatio={generatorAspectRatio}
        generatorImageCount={generatorImageCount}
        generatorError={generatorError}
        generatorStatusText={generatorStatusText}
        generatorTaskFailed={selectedGeneratorTask?.status === 'failed'}
        canGenerateFromCard={canGenerateFromCard}
        promptInputRef={generatorPromptInputRef}
        onSubmit={handleGeneratorFormSubmit}
        onPromptChange={(value) => {
          setGeneratorPrompt(value)
          setGeneratorError('')
        }}
        onPromptBlur={() => {
          if (selectedGeneratorImage) {
            persistGeneratorPrompt(selectedGeneratorImage.id, generatorPrompt.trim())
          }
        }}
        onPromptKeyDown={handleGeneratorPromptKeyDown}
        onModelChange={handleGeneratorModelChange}
        onSizeChange={handleGeneratorSizeChange}
        onCountChange={handleGeneratorCountChange}
        onAspectRatioChange={(ratio) => {
          if (selectedGeneratorImage) {
            resizeGeneratorCard(selectedGeneratorImage, ratio)
          }
        }}
        onCancel={() => {
          if (selectedGeneratorTask) {
            handleCancelTask(selectedGeneratorTask.id)
          }
        }}
      />

      <CameraAngleDialog
        isOpen={isCameraAngleOpen}
        sourcePreviewUrl={cameraSourcePreviewUrl}
        sourceLoading={cameraSourceLoading}
        cameraView={cameraDraftView}
        mode={cameraAngleMode}
        runStatus={cameraRunStatus}
        error={cameraError}
        onChangeView={setCameraDraftView}
        onChangeMode={setCameraAngleMode}
        onReset={resetMultiAnglePanel}
        onApply={() => void applyCameraAngleGeneration()}
        onClose={closeCameraAngleDialog}
        canApply={cameraCanRun}
      />

      {showDockedSidebar ? renderWorkbenchSidebar({ showResizer: true, closeActionLabel: '收起' }) : null}

      {showDockedChatPill ? (
        <button
          type="button"
          className="canvas-workbench-chat-pill"
          onClick={openSidebar}
          onMouseDown={handleToolbarMouseDown}
          aria-label="打开 Chat 面板"
          title="打开 Chat 面板"
        >
          Chat
        </button>
      ) : null}

      {showOverlaySidebar ? (
        <div className="canvas-workbench-sidebar-overlay" role="dialog" aria-modal="true">
          <button
            type="button"
            className="canvas-workbench-overlay-scrim"
            onClick={closeSidebar}
            aria-label="关闭 Chat 面板"
          />
          {renderWorkbenchSidebar({ showResizer: false, closeActionLabel: '关闭' })}
        </div>
      ) : null}
    </div>
  )
}
