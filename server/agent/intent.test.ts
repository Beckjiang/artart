import { describe, expect, it } from 'vitest'
import { inferActionHeuristically } from './intent'

describe('inferActionHeuristically', () => {
  it('asks for clarification when an image is attached without prompt', () => {
    expect(
      inferActionHeuristically({
        messageText: '',
        attachments: [
          {
            id: 'attachment-1',
            kind: 'selection-image',
            name: 'reference',
          },
        ],
        selectionContext: {
          boardId: 'board-1',
          selectedShapeIds: ['shape:image-1'],
          selectedImageShapeIds: ['shape:image-1'],
          sourceKind: 'single-image',
          sourceShapeId: 'shape:image-1',
        },
      })
    ).toMatchObject({
      type: 'ask_followup',
    })
  })

  it('routes image attachments to image_to_image', () => {
    expect(
      inferActionHeuristically({
        messageText: '把它改成浅色极简风',
        attachments: [
          {
            id: 'attachment-1',
            kind: 'selection-image',
            name: 'reference',
          },
        ],
        selectionContext: {
          boardId: 'board-1',
          selectedShapeIds: ['shape:image-1'],
          selectedImageShapeIds: ['shape:image-1'],
          sourceKind: 'single-image',
          sourceShapeId: 'shape:image-1',
        },
      })
    ).toMatchObject({
      type: 'image_to_image',
      toolPrompt: '把它改成浅色极简风',
    })
  })

  it('routes long descriptive prompts to text_to_image', () => {
    expect(
      inferActionHeuristically({
        messageText: '生成一套极简健身生活记录 app 的四种模式界面，包含睡眠、有氧、无氧和监测页',
        attachments: [],
        selectionContext: null,
      })
    ).toMatchObject({
      type: 'text_to_image',
    })
  })
})
