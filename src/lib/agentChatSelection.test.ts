import { describe, expect, it } from 'vitest'
import { buildComposerSelectionDraft, buildLegacyChatPrompt, buildSelectionContext } from './agentChatSelection'

describe('buildComposerSelectionDraft', () => {
  it('builds a single-image chip with preview', () => {
    expect(
      buildComposerSelectionDraft({
        boardId: 'board-1',
        selectedShapeIds: ['shape:image-1'],
        selectedImageShapeIds: ['shape:image-1'],
        selectedCount: 1,
        selectedImageCount: 1,
        sourceShapeId: 'shape:image-1',
        previewUrl: 'data:image/png;base64,abc',
        insertHint: {
          mode: 'image-edit',
          sourceShapeId: 'shape:image-1',
          outputWidth: 640,
          outputHeight: 480,
        },
      })
    ).toMatchObject({
      kind: 'single-image',
      label: '当前选中图片',
      previewUrl: 'data:image/png;base64,abc',
      imageCount: 1,
      elementCount: 1,
    })
  })

  it('builds an aggregate chip for selections with images', () => {
    expect(
      buildComposerSelectionDraft({
        boardId: 'board-1',
        selectedShapeIds: ['shape:image-1', 'shape:text-1', 'shape:image-2'],
        selectedImageShapeIds: ['shape:image-1', 'shape:image-2'],
        selectedCount: 3,
        selectedImageCount: 2,
        selectionBounds: {
          x: 10,
          y: 20,
          width: 300,
          height: 200,
          minY: 20,
          maxX: 310,
        },
        insertHint: {
          mode: 'selection-imagine',
          outputWidth: 800,
          outputHeight: 600,
        },
      })
    ).toMatchObject({
      kind: 'selection-with-images',
      label: '已引用 2 张图片 / 3 个元素',
      imageCount: 2,
      elementCount: 3,
    })
  })

  it('builds a summary chip for non-image selections', () => {
    expect(
      buildComposerSelectionDraft({
        boardId: 'board-1',
        selectedShapeIds: ['shape:text-1', 'shape:rect-1'],
        selectedImageShapeIds: [],
        selectedCount: 2,
        selectedImageCount: 0,
      })
    ).toMatchObject({
      kind: 'selection-summary',
      label: '已引用 2 个元素',
      imageCount: 0,
      elementCount: 2,
    })
  })

  it('returns null when nothing is selected', () => {
    expect(
      buildComposerSelectionDraft({
        boardId: 'board-1',
        selectedShapeIds: [],
        selectedImageShapeIds: [],
        selectedCount: 0,
        selectedImageCount: 0,
      })
    ).toBeNull()
  })
})

describe('buildSelectionContext', () => {
  it('includes the uploaded image asset when present', () => {
    const draft = buildComposerSelectionDraft({
      boardId: 'board-1',
      selectedShapeIds: ['shape:image-1'],
      selectedImageShapeIds: ['shape:image-1'],
      selectedCount: 1,
      selectedImageCount: 1,
      sourceShapeId: 'shape:image-1',
      insertHint: {
        mode: 'image-edit',
        sourceShapeId: 'shape:image-1',
      },
    })

    expect(buildSelectionContext(draft, 'board-1', 'asset-1')).toMatchObject({
      boardId: 'board-1',
      primaryImageAssetId: 'asset-1',
      sourceKind: 'single-image',
      sourceShapeId: 'shape:image-1',
    })
  })
})

describe('buildLegacyChatPrompt', () => {
  it('uses the provided prompt when present', () => {
    expect(buildLegacyChatPrompt('text-to-image', '生成夜景海报')).toBe('生成夜景海报')
  })

  it('falls back to mode-specific defaults', () => {
    expect(buildLegacyChatPrompt('selection-imagine', '')).toContain('当前选区')
    expect(buildLegacyChatPrompt('image-edit', '')).toContain('参考图')
  })
})
