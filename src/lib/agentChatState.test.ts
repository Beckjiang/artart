import { describe, expect, it } from 'vitest'
import type { AgentStreamEvent, ChatMessage } from './agentChatTypes'
import { applyAgentStreamEvent, getChatStatusSummary, upsertChatMessage } from './agentChatState'

const baseMessage: ChatMessage = {
  id: 'message-1',
  sessionId: 'session-1',
  boardId: 'board-1',
  role: 'assistant',
  kind: 'text',
  text: '',
  status: 'pending',
  attachments: [],
  createdAt: '2026-03-09T12:00:00.000Z',
  updatedAt: '2026-03-09T12:00:00.000Z',
}

describe('upsertChatMessage', () => {
  it('merges attachments when the message already exists', () => {
    const initial: ChatMessage[] = [
      {
        ...baseMessage,
        attachments: [
          {
            id: 'attachment-1',
            kind: 'generated-image',
            name: 'draft-1',
          },
        ],
      },
    ]

    const next = upsertChatMessage(initial, {
      ...baseMessage,
      text: 'done',
      status: 'completed',
      attachments: [
        {
          id: 'attachment-1',
          kind: 'generated-image',
          name: 'draft-1',
          canvasShapeId: 'shape:result-1',
        },
      ],
    })

    expect(next[0]?.attachments[0]).toMatchObject({
      id: 'attachment-1',
      canvasShapeId: 'shape:result-1',
    })
  })
})

describe('applyAgentStreamEvent', () => {
  it('updates streaming assistant content', () => {
    const events: AgentStreamEvent[] = [
      {
        type: 'message.started',
        runId: 'run-1',
        boardId: 'board-1',
        message: baseMessage,
      },
      {
        type: 'message.delta',
        runId: 'run-1',
        boardId: 'board-1',
        messageId: 'message-1',
        textDelta: '你好',
        fullText: '你好，正在分析你的需求。',
      },
      {
        type: 'message.completed',
        runId: 'run-1',
        boardId: 'board-1',
        message: {
          ...baseMessage,
          text: '你好，正在分析你的需求。',
          status: 'completed',
        },
      },
    ]

    const reduced = events.reduce(applyAgentStreamEvent, [] as ChatMessage[])
    expect(reduced).toHaveLength(1)
    expect(reduced[0]).toMatchObject({
      id: 'message-1',
      text: '你好，正在分析你的需求。',
      status: 'completed',
    })
  })

  it('merges canvas result attachments onto the completed message', () => {
    const initial: ChatMessage[] = [
      {
        ...baseMessage,
        text: '已为你生成 1 张图。',
        status: 'completed',
      },
    ]

    const next = applyAgentStreamEvent(initial, {
      type: 'canvas.result.created',
      runId: 'run-1',
      boardId: 'board-1',
      messageId: 'message-1',
      insertHint: {
        mode: 'center',
        aspectRatio: '1:1',
      },
      attachment: {
        id: 'attachment-1',
        kind: 'generated-image',
        name: 'result',
        canvasShapeId: 'shape:generated-1',
      },
    })

    expect(next[0]?.attachments[0]).toMatchObject({
      id: 'attachment-1',
      canvasShapeId: 'shape:generated-1',
    })
    expect(next[0]?.canvasInsertHint).toMatchObject({ mode: 'center' })
  })

  it('preserves generated attachments across started-result-completed message flow', () => {
    const events: AgentStreamEvent[] = [
      {
        type: 'message.started',
        runId: 'run-2',
        boardId: 'board-1',
        message: baseMessage,
      },
      {
        type: 'canvas.result.created',
        runId: 'run-2',
        boardId: 'board-1',
        messageId: 'message-1',
        insertHint: {
          mode: 'image-edit',
          sourceShapeId: 'shape:image-1',
          outputWidth: 640,
          outputHeight: 480,
        },
        attachment: {
          id: 'attachment-2',
          kind: 'generated-image',
          name: 'result-2',
          canvasShapeId: 'shape:generated-2',
        },
      },
      {
        type: 'message.completed',
        runId: 'run-2',
        boardId: 'board-1',
        message: {
          ...baseMessage,
          text: '我已经基于参考图生成了新的结果。',
          status: 'completed',
        },
      },
    ]

    const reduced = events.reduce(applyAgentStreamEvent, [] as ChatMessage[])
    expect(reduced).toHaveLength(1)
    expect(reduced[0]).toMatchObject({
      id: 'message-1',
      status: 'completed',
      text: '我已经基于参考图生成了新的结果。',
      canvasInsertHint: {
        mode: 'image-edit',
        sourceShapeId: 'shape:image-1',
      },
    })
    expect(reduced[0]?.attachments).toEqual([
      {
        id: 'attachment-2',
        kind: 'generated-image',
        name: 'result-2',
        canvasShapeId: 'shape:generated-2',
      },
    ])
  })
})

describe('getChatStatusSummary', () => {
  it('prefers active tool status', () => {
    expect(
      getChatStatusSummary([
        {
          ...baseMessage,
          id: 'tool-1',
          role: 'tool',
          kind: 'tool',
          text: '正在分析参考图…',
          status: 'streaming',
        },
      ])
    ).toBe('正在分析参考图…')
  })
})
