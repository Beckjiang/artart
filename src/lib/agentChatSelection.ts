import type {
  CanvasInsertHint,
  ChatSelectionContext,
  ComposerSelectionDraft,
  SelectionBounds,
} from './agentChatTypes'

export type ComposerSelectionInput = {
  boardId: string
  selectedShapeIds: string[]
  selectedImageShapeIds: string[]
  selectedCount: number
  selectedImageCount: number
  sourceShapeId?: string | null
  previewUrl?: string
  selectionBounds?: SelectionBounds | null
  insertHint?: CanvasInsertHint | null
}

const pluralize = (count: number, noun: string) => `${count} ${noun}`

export const buildComposerSelectionDraft = (
  input: ComposerSelectionInput
): ComposerSelectionDraft | null => {
  const {
    selectedShapeIds,
    selectedImageShapeIds,
    selectedCount,
    selectedImageCount,
    sourceShapeId,
    previewUrl,
    selectionBounds,
    insertHint,
  } = input

  if (selectedCount <= 0 || selectedShapeIds.length === 0) return null

  const key = selectedShapeIds.join(',')
  if (selectedCount === 1 && selectedImageCount === 1) {
    return {
      key,
      kind: 'single-image',
      label: '当前选中图片',
      helper: '本次发送会把这张图片作为参考图。',
      previewUrl,
      imageCount: 1,
      elementCount: 1,
      selectedShapeIds,
      selectedImageShapeIds,
      sourceShapeId,
      selectionBounds,
      insertHint,
    }
  }

  if (selectedImageCount > 0) {
    return {
      key,
      kind: 'selection-with-images',
      label: `已引用 ${pluralize(selectedImageCount, '张图片')} / ${pluralize(selectedCount, '个元素')}`,
      helper: '本次发送会把当前选区作为参考内容。',
      imageCount: selectedImageCount,
      elementCount: selectedCount,
      selectedShapeIds,
      selectedImageShapeIds,
      sourceShapeId,
      selectionBounds,
      insertHint,
    }
  }

  return {
    key,
    kind: 'selection-summary',
    label: `已引用 ${pluralize(selectedCount, '个元素')}`,
    helper: '本次发送会携带当前选区摘要，但不会自动触发图生图。',
    imageCount: 0,
    elementCount: selectedCount,
    selectedShapeIds,
    selectedImageShapeIds,
    sourceShapeId,
    selectionBounds,
    insertHint,
  }
}

export const buildSelectionContext = (
  draft: ComposerSelectionDraft | null,
  boardId: string,
  primaryImageAssetId?: string | null
): ChatSelectionContext | null => {
  if (!draft) return null

  return {
    boardId,
    selectedShapeIds: draft.selectedShapeIds,
    selectedImageShapeIds: draft.selectedImageShapeIds,
    primaryImageAssetId: primaryImageAssetId ?? null,
    selectionBounds: draft.selectionBounds ?? null,
    sourceShapeId: draft.sourceShapeId ?? null,
    sourceKind: draft.kind,
    insertHint: draft.insertHint ?? null,
  }
}

export const buildLegacyChatPrompt = (
  origin: 'image-edit' | 'selection-imagine' | 'text-to-image',
  prompt: string
) => {
  const trimmed = prompt.trim()
  if (trimmed) return trimmed

  if (origin === 'selection-imagine') {
    return '根据当前选区的构图和元素关系生成一张新的融合结果。'
  }

  if (origin === 'image-edit') {
    return '请基于当前参考图进行编辑，保持整体风格协调。'
  }

  return '请生成一张新图片。'
}
