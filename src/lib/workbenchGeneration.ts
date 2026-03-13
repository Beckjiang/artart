import type { ImageAspectRatio } from './imageGeneration'

export type AssistantMode =
  | 'neutral'
  | 'image-edit'
  | 'image-generator'
  | 'selection-imagine'
  | 'disabled'

export type GenerationTaskOrigin =
  | 'image-edit-sidebar'
  | 'image-generator-card'
  | 'image-generator-batch'
  | 'selection-imagine-actionbar'

export type WorkbenchSelectionSummary = {
  selectedCount: number
  hasAnySelectedImage: boolean
  singleSelectedImageIsLocked: boolean
  singleSelectedImageIsGenerator: boolean
}

export type WorkbenchSelectionImagineImage = {
  shapeId: string
  width: number
  height: number
  isGenerator?: boolean
}

export type WorkbenchBounds = {
  x: number
  y: number
  w: number
  h: number
}

export type WorkbenchSelectedImage = {
  shapeId: string
  x: number
  y: number
  width: number
  height: number
  bounds?: {
    minY: number
    maxX: number
  }
}

export type WorkbenchSelectionBounds = {
  x: number
  y: number
  width: number
  height: number
  minY: number
  maxX: number
}

export type WorkbenchEditorState = {
  viewportBounds: WorkbenchBounds
  selectedImage?: WorkbenchSelectedImage | null
  selectionBounds?: WorkbenchSelectionBounds | null
  selectionOutputSize?: {
    width: number
    height: number
  } | null
  insertGap?: number
}

export type WorkbenchInsertPlacement = {
  width: number
  height: number
  insertX: number
  insertY: number
  referenceImage?: {
    sourceShapeId: string
  }
}

const MIN_GENERATED_EDGE = 96
const GENERATOR_CARD_LONG_EDGE = 1024

const toAspectRatioNumber = (aspectRatio: ImageAspectRatio) => {
  const [widthToken, heightToken] = aspectRatio.split(':')
  const width = Number(widthToken)
  const height = Number(heightToken)

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 1
  }

  return width / height
}

export const resolveAssistantMode = ({
  selectedCount,
  hasAnySelectedImage,
  singleSelectedImageIsLocked,
  singleSelectedImageIsGenerator,
}: WorkbenchSelectionSummary): AssistantMode => {
  if (selectedCount === 1 && hasAnySelectedImage) {
    if (singleSelectedImageIsLocked) return 'disabled'
    return singleSelectedImageIsGenerator ? 'image-generator' : 'image-edit'
  }

  if (selectedCount > 1) {
    if (!hasAnySelectedImage) return 'disabled'
    return 'selection-imagine'
  }

  return 'neutral'
}

export const getSelectionImagineSourceImage = (
  selectedImages: WorkbenchSelectionImagineImage[]
): WorkbenchSelectionImagineImage | null => {
  for (const image of selectedImages) {
    if (image.isGenerator) continue

    const width = Number(image.width)
    const height = Number(image.height)
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      continue
    }

    return {
      shapeId: image.shapeId,
      width: Math.round(width),
      height: Math.round(height),
      isGenerator: false,
    }
  }

  return null
}

export const getGeneratorCardSize = (
  aspectRatio: ImageAspectRatio,
  longEdge = GENERATOR_CARD_LONG_EDGE
) => {
  const ratio = toAspectRatioNumber(aspectRatio)

  if (ratio >= 1) {
    return {
      width: longEdge,
      height: Math.max(MIN_GENERATED_EDGE, Math.round(longEdge / ratio)),
    }
  }

  return {
    width: Math.max(MIN_GENERATED_EDGE, Math.round(longEdge * ratio)),
    height: longEdge,
  }
}

export const getGeneratorCardPlacement = (
  viewportBounds: WorkbenchBounds,
  aspectRatio: ImageAspectRatio,
  longEdge = GENERATOR_CARD_LONG_EDGE
): WorkbenchInsertPlacement => {
  const { width, height } = getGeneratorCardSize(aspectRatio, longEdge)
  const centerX = viewportBounds.x + viewportBounds.w / 2
  const centerY = viewportBounds.y + viewportBounds.h / 2

  return {
    width,
    height,
    insertX: Math.round(centerX - width / 2),
    insertY: Math.round(centerY - height / 2),
  }
}

export const getInsertPlacement = (
  mode: AssistantMode,
  editorState: WorkbenchEditorState
): WorkbenchInsertPlacement => {
  const insertGap = editorState.insertGap ?? 0

  if (mode === 'image-edit') {
    const selectedImage = editorState.selectedImage
    if (!selectedImage) {
      throw new Error('缺少参考图片，无法计算图生图插入位置')
    }

    const width = Math.max(MIN_GENERATED_EDGE, Math.round(selectedImage.width))
    const height = Math.max(MIN_GENERATED_EDGE, Math.round(selectedImage.height))

    return {
      width,
      height,
      insertX: (selectedImage.bounds?.maxX ?? selectedImage.x + width) + insertGap,
      insertY: selectedImage.bounds?.minY ?? selectedImage.y,
      referenceImage: {
        sourceShapeId: selectedImage.shapeId,
      },
    }
  }

  if (mode === 'selection-imagine') {
    const selectionBounds = editorState.selectionBounds
    if (!selectionBounds) {
      throw new Error('缺少选区范围，无法计算 imagine 插入位置')
    }

    const outputWidth = editorState.selectionOutputSize?.width
    const outputHeight = editorState.selectionOutputSize?.height
    const width =
      Number.isFinite(outputWidth) && Number(outputWidth) > 0
        ? Math.round(Number(outputWidth))
        : Math.max(MIN_GENERATED_EDGE, Math.round(selectionBounds.width))
    const height =
      Number.isFinite(outputHeight) && Number(outputHeight) > 0
        ? Math.round(Number(outputHeight))
        : Math.max(MIN_GENERATED_EDGE, Math.round(selectionBounds.height))

    return {
      width,
      height,
      insertX: selectionBounds.maxX + insertGap,
      insertY: selectionBounds.minY,
    }
  }

  throw new Error('当前模式不支持通过该方法计算插入位置')
}

export const shouldRecreateTaskTarget = (origin: GenerationTaskOrigin) =>
  origin === 'image-edit-sidebar' ||
  origin === 'selection-imagine-actionbar' ||
  origin === 'image-generator-batch'
