import type { LucideIcon } from 'lucide-react'
import type { TLImageShape } from 'tldraw'
import type { BoardMeta } from '../../lib/boards'
import type { ImageAspectRatio, ImageGenerationSize, ImageGeneratorModel } from '../../lib/imageGeneration'
import type { AssistantMode, GenerationTaskOrigin } from '../../lib/workbenchGeneration'
import type { MaskBounds } from '../../lib/maskedImageEdit'

export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type GenerationTaskMaskMode = 'semantic-crop'

export type ToolId = 'select' | 'frame' | 'rectangle' | 'arrow' | 'text' | 'draw' | 'asset'
export type ToolIconId = ToolId | 'generator'

export type ScreenBounds = {
  left: number
  top: number
  right: number
  bottom: number
  midX: number
  width: number
  height: number
}

export type PageBounds = {
  x: number
  y: number
  w: number
  h: number
  minY: number
  maxX: number
}

export type ShapeMetaValue = string | number | boolean | null
export type ShapeMeta = Record<string, ShapeMetaValue>

export type GeneratorShapeMeta = {
  canvasRole: 'image-generator'
  aspectRatio: ImageAspectRatio
  lastPrompt: string
  imageModel: ImageGeneratorModel
  imageSize: ImageGenerationSize
  imageCount: number
}

export type CameraSourceSize = {
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

export type ImageEditActionPreset = Exclude<
  AssistantActionPreset,
  'text-to-image' | 'imagine-selection'
>

export type GenerationTask = {
  id: string
  mode: Extract<AssistantMode, 'image-edit' | 'image-generator' | 'selection-imagine'>
  origin: GenerationTaskOrigin
  prompt: string
  aspectRatio: ImageAspectRatio
  imageModel?: ImageGeneratorModel
  imageSize?: ImageGenerationSize
  imageCount?: number
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

export type CanvasWorkbenchProps = {
  board: BoardMeta
  onBoardMetaChange?: () => void
}

export type PresetDefinition = {
  label: string
  icon: LucideIcon
  helper: string
  defaultPrompt: string
  placeholder: string
}

export type ToolItem = {
  id: ToolId
  label: string
  icon: ToolIconId
}
