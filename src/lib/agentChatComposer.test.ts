import { describe, expect, it, vi } from 'vitest'
import {
  buildAgentMessageRequest,
  canSubmitAgentChat,
  submitSidebarComposer,
} from './agentChatComposer'
import { buildComposerSelectionDraft } from './agentChatSelection'

describe('canSubmitAgentChat', () => {
  it('accepts a selection-only turn when no prompt is provided', () => {
    const draft = buildComposerSelectionDraft({
      boardId: 'board-1',
      selectedShapeIds: ['shape:image-1'],
      selectedImageShapeIds: ['shape:image-1'],
      selectedCount: 1,
      selectedImageCount: 1,
    })

    expect(
      canSubmitAgentChat({
        promptText: '',
        selectionDraft: draft,
        chatRunId: null,
        chatSubmitting: false,
      })
    ).toBe(true)
  })
})

describe('submitSidebarComposer', () => {
  it('dispatches visible chat panel submissions to the agent flow', async () => {
    const sendAgentTurn = vi.fn().mockResolvedValue(null)
    const enqueueLegacyTask = vi.fn().mockResolvedValue(undefined)

    await submitSidebarComposer({
      surface: 'chat-panel',
      sendAgentTurn,
      enqueueLegacyTask,
    })

    expect(sendAgentTurn).toHaveBeenCalledTimes(1)
    expect(enqueueLegacyTask).not.toHaveBeenCalled()
  })

  it('keeps the hidden legacy sidebar on the old queue path', async () => {
    const sendAgentTurn = vi.fn().mockResolvedValue(null)
    const enqueueLegacyTask = vi.fn().mockResolvedValue(undefined)

    await submitSidebarComposer({
      surface: 'legacy-sidebar',
      sendAgentTurn,
      enqueueLegacyTask,
    })

    expect(enqueueLegacyTask).toHaveBeenCalledTimes(1)
    expect(sendAgentTurn).not.toHaveBeenCalled()
  })
})

describe('buildAgentMessageRequest', () => {
  it('builds a text-only request without selection context', () => {
    expect(
      buildAgentMessageRequest({
        boardId: 'board-1',
        promptText: '  生成一张深色科技海报  ',
        clientMessageId: 'msg-1',
      })
    ).toEqual({
      text: '生成一张深色科技海报',
      attachments: [],
      selectionContext: null,
      clientMessageId: 'msg-1',
    })
  })

  it('includes uploaded asset and image-edit insert hint for a single selected image', () => {
    const draft = buildComposerSelectionDraft({
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

    expect(
      buildAgentMessageRequest({
        boardId: 'board-1',
        promptText: '调整成更明亮的电商主图',
        selectionDraft: draft,
        uploadedAssetId: 'asset-1',
        clientMessageId: 'msg-2',
      })
    ).toMatchObject({
      text: '调整成更明亮的电商主图',
      attachments: [{ assetId: 'asset-1' }],
      selectionContext: {
        boardId: 'board-1',
        primaryImageAssetId: 'asset-1',
        sourceKind: 'single-image',
        sourceShapeId: 'shape:image-1',
        insertHint: {
          mode: 'image-edit',
          sourceShapeId: 'shape:image-1',
          outputWidth: 640,
          outputHeight: 480,
        },
      },
      clientMessageId: 'msg-2',
    })
  })

  it('includes a composite selection reference for multi-element image selections', () => {
    const draft = buildComposerSelectionDraft({
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
        selectionBounds: {
          x: 10,
          y: 20,
          width: 300,
          height: 200,
          minY: 20,
          maxX: 310,
        },
        outputWidth: 800,
        outputHeight: 600,
      },
    })

    expect(
      buildAgentMessageRequest({
        boardId: 'board-1',
        promptText: '融合成一张更统一的 KV',
        selectionDraft: draft,
        uploadedAssetId: 'asset-selection-1',
        clientMessageId: 'msg-3',
      })
    ).toMatchObject({
      text: '融合成一张更统一的 KV',
      attachments: [{ assetId: 'asset-selection-1' }],
      selectionContext: {
        boardId: 'board-1',
        primaryImageAssetId: 'asset-selection-1',
        sourceKind: 'selection-with-images',
        selectedShapeIds: ['shape:image-1', 'shape:text-1', 'shape:image-2'],
        selectedImageShapeIds: ['shape:image-1', 'shape:image-2'],
        insertHint: {
          mode: 'selection-imagine',
          outputWidth: 800,
          outputHeight: 600,
        },
      },
      clientMessageId: 'msg-3',
    })
  })
})
