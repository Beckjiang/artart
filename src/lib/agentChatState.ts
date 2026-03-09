import type { AgentStreamEvent, ChatAttachment, ChatMessage } from './agentChatTypes'

const mergeAttachment = (existing: ChatAttachment, incoming: ChatAttachment): ChatAttachment => ({
  ...existing,
  ...Object.fromEntries(
    Object.entries(incoming).filter(([, value]) => value !== undefined)
  ),
})

const mergeAttachments = (
  existing: ChatAttachment[],
  incoming: ChatAttachment[]
): ChatAttachment[] => {
  const byId = new Map(existing.map((attachment) => [attachment.id, attachment]))
  for (const attachment of incoming) {
    const current = byId.get(attachment.id)
    byId.set(attachment.id, current ? mergeAttachment(current, attachment) : attachment)
  }
  return Array.from(byId.values())
}

export const upsertChatMessage = (
  messages: ChatMessage[],
  incoming: ChatMessage
): ChatMessage[] => {
  const index = messages.findIndex((message) => message.id === incoming.id)
  if (index < 0) {
    return [...messages, incoming].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    )
  }

  return messages.map((message, messageIndex) => {
    if (messageIndex !== index) return message
    return {
      ...message,
      ...incoming,
      attachments: mergeAttachments(message.attachments, incoming.attachments),
      meta: incoming.meta ?? message.meta,
      canvasInsertHint: incoming.canvasInsertHint ?? message.canvasInsertHint,
    }
  })
}

export const applyAgentStreamEvent = (
  messages: ChatMessage[],
  event: AgentStreamEvent
): ChatMessage[] => {
  switch (event.type) {
    case 'message.started':
    case 'tool.called':
    case 'tool.progress':
    case 'tool.completed':
    case 'message.completed':
    case 'run.failed':
      return upsertChatMessage(messages, event.message)

    case 'message.delta':
      return messages.map((message) =>
        message.id === event.messageId
          ? {
              ...message,
              text: event.fullText,
              status: 'streaming',
            }
          : message
      )

    case 'agent.thinking':
      return messages

    case 'canvas.result.created':
      return messages.map((message) => {
        if (message.id !== event.messageId) return message
        return {
          ...message,
          canvasInsertHint: event.insertHint,
          attachments: mergeAttachments(message.attachments, [event.attachment]),
        }
      })

    default:
      return messages
  }
}

export const getChatStatusSummary = (messages: ChatMessage[]) => {
  const reversed = [...messages].reverse()
  const activeTool = reversed.find(
    (message) => message.role === 'tool' && message.status !== 'completed'
  )
  if (activeTool) return activeTool.text || '正在执行工具…'

  const streamingAssistant = reversed.find(
    (message) => message.role === 'assistant' && message.status === 'streaming'
  )
  if (streamingAssistant) return '助手正在回复…'

  const latestCompleted = reversed.find((message) => message.status === 'completed')
  if (latestCompleted) {
    return latestCompleted.role === 'assistant' ? '对话已更新' : '已同步最新消息'
  }

  return '准备就绪'
}
