import { generateTextWithGateway } from '../../modelGateway'
import type { ChatAttachment, ChatMessage, ChatSelectionContext } from '../../src/lib/agentChatTypes'

export type AgentAction =
  | {
      type: 'reply'
      reply: string
    }
  | {
      type: 'ask_followup'
      reply: string
    }
  | {
      type: 'text_to_image'
      reply: string
      toolPrompt: string
    }
  | {
      type: 'image_to_image'
      reply: string
      toolPrompt: string
    }

type DecideActionInput = {
  boardId: string
  messageText: string
  attachments: ChatAttachment[]
  selectionContext?: ChatSelectionContext | null
  conversation: ChatMessage[]
}

type StructuredAction = {
  type?: AgentAction['type']
  reply?: string
  toolPrompt?: string
}

const extractJson = (text: string): StructuredAction | null => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    return JSON.parse(text.slice(start, end + 1)) as StructuredAction
  } catch {
    return null
  }
}

const createConversationSummary = (conversation: ChatMessage[]) => {
  return conversation
    .slice(-8)
    .map((message) => {
      const preview = message.text.trim().replace(/\s+/g, ' ').slice(0, 140)
      return `${message.role}: ${preview || '[empty]'}`
    })
    .join('\n')
}

export const inferActionHeuristically = ({
  messageText,
  attachments,
  selectionContext,
}: Pick<DecideActionInput, 'messageText' | 'attachments' | 'selectionContext'>): AgentAction => {
  const text = messageText.trim()
  const normalized = text.toLowerCase()
  const hasImageAttachment = attachments.some((attachment) => attachment.kind === 'selection-image')
  const hasSelectionImages = Boolean(selectionContext?.selectedImageShapeIds.length)

  if ((hasImageAttachment || hasSelectionImages) && !text) {
    return {
      type: 'ask_followup',
      reply: '我已收到参考图。告诉我你想怎么修改它，我就可以继续生成。',
    }
  }

  if (hasImageAttachment || hasSelectionImages) {
    return {
      type: 'image_to_image',
      reply: '我先基于你给的参考图整理意图，然后开始生成新的结果。',
      toolPrompt: text,
    }
  }

  if (!text) {
    return {
      type: 'ask_followup',
      reply: '告诉我你想生成什么内容，或者先在画布上选中一张图作为参考。',
    }
  }

  const looksLikeGenerationRequest =
    /生成|画|做一张|来一张|create|generate|design|poster|banner|ui|界面|海报|插画|封面/.test(text)

  if (looksLikeGenerationRequest || text.length >= 12) {
    return {
      type: 'text_to_image',
      reply: '我先理解你的需求并生成图片结果。',
      toolPrompt: text,
    }
  }

  if (/你好|hello|hi|在吗/.test(normalized)) {
    return {
      type: 'reply',
      reply: '在的。我可以理解你的意图，支持文生图、图生图和基于当前画布选区的多轮对话。',
    }
  }

  return {
    type: 'reply',
    reply:
      '我可以直接帮你生成图片，也可以基于当前画布里的参考图继续编辑。你可以继续补充风格、构图、配色或输出形式。',
  }
}

export const decideAgentAction = async (input: DecideActionInput): Promise<AgentAction> => {
  const attachmentSummary = input.attachments.map((attachment) => `${attachment.kind}:${attachment.name}`).join(', ')
  const prompt = [
    'You are an orchestration agent for a canvas image assistant.',
    'Return JSON only with fields: type, reply, toolPrompt.',
    'Allowed type values: reply, ask_followup, text_to_image, image_to_image.',
    'Rules:',
    '- If attachments contain an image, prefer image_to_image.',
    '- If the user message is missing required detail to generate, use ask_followup.',
    '- If the user is just chatting, use reply.',
    '- reply must be short and user-facing.',
    '- toolPrompt should contain the final prompt to send to the image model when a tool is needed.',
    '',
    `Board: ${input.boardId}`,
    `Current user message: ${input.messageText || '[empty]'}`,
    `Attachments: ${attachmentSummary || 'none'}`,
    `Selection context: ${JSON.stringify(input.selectionContext ?? null)}`,
    'Recent conversation:',
    createConversationSummary(input.conversation) || 'none',
  ].join('\n')

  try {
    const response = await generateTextWithGateway({
      jobId: `agent-intent-${Date.now()}`,
      jobType: 'copy',
      campaignId: input.boardId,
      input: prompt,
      temperature: 0.2,
      maxOutputTokens: 280,
      useFallback: true,
    })

    const structured = extractJson(response.text)
    if (!structured?.type || !structured.reply) {
      return inferActionHeuristically(input)
    }

    if (structured.type === 'text_to_image' || structured.type === 'image_to_image') {
      return {
        type: structured.type,
        reply: structured.reply,
        toolPrompt: structured.toolPrompt?.trim() || input.messageText.trim(),
      }
    }

    if (structured.type === 'ask_followup') {
      return {
        type: 'ask_followup',
        reply: structured.reply,
      }
    }

    return {
      type: 'reply',
      reply: structured.reply,
    }
  } catch {
    return inferActionHeuristically(input)
  }
}
