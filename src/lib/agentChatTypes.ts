export type ChatMessageRole = 'user' | 'assistant' | 'tool' | 'system'

export type ChatMessageKind = 'text' | 'tool' | 'result'

export type ChatMessageStatus = 'pending' | 'streaming' | 'completed' | 'failed'

export type ChatAttachmentKind = 'selection-image' | 'selection-summary' | 'generated-image'

export type SelectionBounds = {
  x: number
  y: number
  width: number
  height: number
  minY: number
  maxX: number
}

export type CanvasInsertHint =
  | {
      mode: 'center'
      aspectRatio?: string | null
      outputWidth?: number | null
      outputHeight?: number | null
    }
  | {
      mode: 'image-edit'
      sourceShapeId?: string | null
      outputWidth?: number | null
      outputHeight?: number | null
    }
  | {
      mode: 'selection-imagine'
      selectionBounds?: SelectionBounds | null
      outputWidth?: number | null
      outputHeight?: number | null
    }
  | {
      mode: 'generator-card'
      targetShapeId?: string | null
      x: number
      y: number
      width: number
      height: number
      aspectRatio?: string | null
    }

export type ChatAttachment = {
  id: string
  kind: ChatAttachmentKind
  name: string
  assetId?: string | null
  mimeType?: string | null
  previewUrl?: string | null
  dataUrl?: string | null
  width?: number | null
  height?: number | null
  shapeId?: string | null
  canvasShapeId?: string | null
}

export type ChatMessage = {
  id: string
  sessionId: string
  boardId: string
  role: ChatMessageRole
  kind: ChatMessageKind
  text: string
  status: ChatMessageStatus
  runId?: string | null
  attachments: ChatAttachment[]
  canvasInsertHint?: CanvasInsertHint | null
  meta?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type ChatSession = {
  id: string
  boardId: string
  createdAt: string
  updatedAt: string
}

export type ChatSelectionContext = {
  boardId: string
  selectedShapeIds: string[]
  selectedImageShapeIds: string[]
  primaryImageAssetId?: string | null
  selectionBounds?: SelectionBounds | null
  sourceShapeId?: string | null
  sourceKind: 'single-image' | 'selection-with-images' | 'selection-summary' | 'none'
  outputWidth?: number | null
  outputHeight?: number | null
  insertHint?: CanvasInsertHint | null
}

export type SendAgentMessageRequest = {
  text: string
  attachments?: Array<{
    assetId: string
  }>
  selectionContext?: ChatSelectionContext | null
  clientMessageId?: string
}

export type SendAgentMessageResponse = {
  session: ChatSession
  runId: string
  acceptedMessage: ChatMessage
}

export type CreateAgentAssetRequest = {
  boardId: string
  name: string
  kind: Extract<ChatAttachmentKind, 'selection-image'>
  mimeType?: string | null
  previewUrl?: string | null
  dataUrl: string
  width?: number | null
  height?: number | null
  shapeId?: string | null
}

export type CreateAgentAssetResponse = {
  asset: ChatAttachment
}

export type SessionMessagesResponse = {
  session: ChatSession
  messages: ChatMessage[]
}

export type AgentStreamEvent =
  | {
      type: 'message.started'
      runId: string
      boardId: string
      message: ChatMessage
    }
  | {
      type: 'agent.thinking'
      runId: string
      boardId: string
      summary: string
    }
  | {
      type: 'tool.called' | 'tool.progress' | 'tool.completed'
      runId: string
      boardId: string
      message: ChatMessage
    }
  | {
      type: 'message.delta'
      runId: string
      boardId: string
      messageId: string
      textDelta: string
      fullText: string
    }
  | {
      type: 'message.completed'
      runId: string
      boardId: string
      message: ChatMessage
    }
  | {
      type: 'canvas.result.created'
      runId: string
      boardId: string
      messageId: string
      attachment: ChatAttachment
      insertHint: CanvasInsertHint
    }
  | {
      type: 'run.failed'
      runId: string
      boardId: string
      error: string
      message: ChatMessage
    }

export type ComposerSelectionDraft = {
  key: string
  kind: 'single-image' | 'selection-with-images' | 'selection-summary'
  label: string
  helper: string
  previewUrl?: string
  imageCount: number
  elementCount: number
  selectedShapeIds: string[]
  selectedImageShapeIds: string[]
  sourceShapeId?: string | null
  selectionBounds?: SelectionBounds | null
  insertHint?: CanvasInsertHint | null
}
