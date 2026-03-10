import type {
  AgentStreamEvent,
  CanvasInsertHint,
  ChatAttachment,
  ChatMessage,
  ChatSelectionContext,
  ChatSession,
} from '../../src/lib/agentChatTypes'
import {
  createGeneratedAttachment,
  createMessage,
  listMessagesByBoard,
  touchSession,
  updateMessage,
  updateRun,
  getAssetDataUrl,
} from './db'
import { publishEvent } from './eventBus'
import { runImageToImageTool, runTextToImageTool } from './imageTools'
import { decideAgentAction } from './intent'
import { chunkText, createId, delay, nowIso } from './utils'

type ProcessRunInput = {
  runId: string
  boardId: string
  session: ChatSession
  userMessage: ChatMessage
  selectionContext?: ChatSelectionContext | null
}

const publish = (boardId: string, event: AgentStreamEvent) => {
  publishEvent(boardId, event)
}

const streamAssistantText = async (
  boardId: string,
  runId: string,
  assistantMessage: ChatMessage,
  fullText: string,
  canvasInsertHint?: CanvasInsertHint | null
) => {
  let accumulated = ''
  for (const part of chunkText(fullText)) {
    accumulated += part
    const next = await updateMessage(assistantMessage.id, {
      text: accumulated,
      status: 'streaming',
      canvasInsertHint,
      updatedAt: nowIso(),
    })

    publish(boardId, {
      type: 'message.delta',
      runId,
      boardId,
      messageId: assistantMessage.id,
      textDelta: part,
      fullText: next.text,
    })

    await delay(32)
  }

  const completed = await updateMessage(assistantMessage.id, {
    text: fullText,
    status: 'completed',
    canvasInsertHint,
    updatedAt: nowIso(),
  })

  publish(boardId, {
    type: 'message.completed',
    runId,
    boardId,
    message: completed,
  })

  return completed
}

const createToolMessage = async (
  runId: string,
  session: ChatSession,
  boardId: string,
  text: string,
  status: 'streaming' | 'completed' = 'streaming'
) => {
  return createMessage({
    id: createId('msg-tool'),
    sessionId: session.id,
    boardId,
    role: 'tool',
    kind: 'tool',
    text,
    status,
    runId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  })
}

const resolveReferenceDataUrls = async (attachments: ChatAttachment[]) => {
  const values = await Promise.all(
    attachments
      .filter((attachment) => attachment.kind === 'selection-image')
      .map(async (attachment) => attachment.dataUrl ?? (attachment.assetId ? getAssetDataUrl(attachment.assetId) : null))
  )

  return values.filter((value): value is string => Boolean(value))
}

const buildResultReply = (tool: 'text_to_image' | 'image_to_image') =>
  tool === 'image_to_image'
    ? '我已经基于参考图生成了新的结果，并自动放到了画布上。你可以继续让我微调风格、细节或版本。'
    : '我已经根据你的描述生成了一张图片，并自动插入到了画布上。你可以继续追加修改要求。'

export const processAgentRun = async ({
  runId,
  boardId,
  session,
  userMessage,
  selectionContext,
}: ProcessRunInput) => {
  const assistantMessage = await createMessage({
    id: createId('msg-assistant'),
    sessionId: session.id,
    boardId,
    role: 'assistant',
    kind: 'text',
    text: '',
    status: 'streaming',
    runId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  })

  publish(boardId, {
    type: 'message.started',
    runId,
    boardId,
    message: assistantMessage,
  })

  publish(boardId, {
    type: 'agent.thinking',
    runId,
    boardId,
    summary: '正在理解你的意图…',
  })

  await updateRun(runId, {
    assistantMessageId: assistantMessage.id,
    status: 'running',
    updatedAt: nowIso(),
  })

  try {
    const conversation = await listMessagesByBoard(boardId)
    const action = await decideAgentAction({
      boardId,
      messageText: userMessage.text,
      attachments: userMessage.attachments,
      selectionContext,
      conversation,
    })

    await updateRun(runId, {
      actionJson: JSON.stringify({
        action,
        selectionContext,
      }),
      updatedAt: nowIso(),
    })

    if (action.type === 'reply' || action.type === 'ask_followup') {
      await streamAssistantText(boardId, runId, assistantMessage, action.reply)
      await updateRun(runId, {
        status: 'completed',
        updatedAt: nowIso(),
      })
      await touchSession(session.id, nowIso())
      return
    }

    const toolLabel = action.type === 'image_to_image' ? '图生图工具' : '文生图工具'
    let toolMessage = await createToolMessage(runId, session, boardId, `已选择${toolLabel}，正在准备参数…`)
    publish(boardId, {
      type: 'tool.called',
      runId,
      boardId,
      message: toolMessage,
    })

    toolMessage = await updateMessage(toolMessage.id, {
      text:
        action.type === 'image_to_image'
          ? '正在分析参考图并生成新图…'
          : '正在根据你的描述生成图片…',
      status: 'streaming',
      updatedAt: nowIso(),
    })

    publish(boardId, {
      type: 'tool.progress',
      runId,
      boardId,
      message: toolMessage,
    })

    const result =
      action.type === 'image_to_image'
        ? await runImageToImageTool({
            runId,
            prompt: action.toolPrompt,
            insertHint: selectionContext?.insertHint,
            referenceDataUrls: await resolveReferenceDataUrls(userMessage.attachments),
          })
        : await runTextToImageTool({
            runId,
            prompt: action.toolPrompt,
            insertHint: selectionContext?.insertHint,
          })

    toolMessage = await updateMessage(toolMessage.id, {
      text: `${toolLabel}执行完成`,
      status: 'completed',
      updatedAt: nowIso(),
    })

    publish(boardId, {
      type: 'tool.completed',
      runId,
      boardId,
      message: toolMessage,
    })

    const attachment = await createGeneratedAttachment(
      {
        id: createId('attachment-generated'),
        messageId: assistantMessage.id,
        boardId,
        name: action.type === 'image_to_image' ? '编辑结果' : '生成结果',
        mimeType: result.mimeType,
        previewUrl: result.dataUrl,
        dataUrl: result.dataUrl,
        width: result.width,
        height: result.height,
      },
      nowIso()
    )

    const canvasInsertHint = selectionContext?.insertHint ?? {
      mode: 'center',
      outputWidth: result.width,
      outputHeight: result.height,
      aspectRatio: '1:1',
    }

    const completedAssistant = await updateMessage(assistantMessage.id, {
      text: '',
      status: 'streaming',
      canvasInsertHint,
      updatedAt: nowIso(),
      meta: {
        tool: action.type,
      },
    })

    publish(boardId, {
      type: 'canvas.result.created',
      runId,
      boardId,
      messageId: completedAssistant.id,
      attachment,
      insertHint: canvasInsertHint,
    })

    await streamAssistantText(
      boardId,
      runId,
      completedAssistant,
      buildResultReply(action.type),
      canvasInsertHint
    )

    await updateRun(runId, {
      status: 'completed',
      updatedAt: nowIso(),
    })
    await touchSession(session.id, nowIso())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'agent_run_failed'
    const failedMessage = await updateMessage(assistantMessage.id, {
      text: `这次处理失败了：${message}`,
      status: 'failed',
      updatedAt: nowIso(),
    })

    await updateRun(runId, {
      status: 'failed',
      error: message,
      updatedAt: nowIso(),
    })

    publish(boardId, {
      type: 'run.failed',
      runId,
      boardId,
      error: message,
      message: failedMessage,
    })
  }
}
