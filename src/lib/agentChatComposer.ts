import { buildSelectionContext } from './agentChatSelection'
import type {
  CanvasInsertHint,
  ChatSelectionContext,
  ComposerSelectionDraft,
  SendAgentMessageRequest,
} from './agentChatTypes'

export type SidebarSubmitSurface = 'chat-panel' | 'legacy-sidebar'

type BuildAgentMessageRequestInput = {
  boardId: string
  promptText?: string
  selectionDraft?: ComposerSelectionDraft | null
  uploadedAssetId?: string | null
  insertHint?: CanvasInsertHint | null
  clientMessageId: string
}

type SubmitSidebarComposerInput = {
  surface: SidebarSubmitSurface
  sendAgentTurn: () => Promise<unknown> | unknown
  enqueueLegacyTask: () => Promise<unknown> | unknown
}

const buildEmptySelectionContext = (
  boardId: string,
  insertHint?: CanvasInsertHint | null
): ChatSelectionContext | null => {
  if (!insertHint) return null

  return {
    boardId,
    selectedShapeIds: [],
    selectedImageShapeIds: [],
    sourceKind: 'none',
    insertHint,
  }
}

export const canSubmitAgentChat = ({
  promptText,
  selectionDraft,
  chatRunId,
  chatSubmitting,
}: {
  promptText: string
  selectionDraft?: ComposerSelectionDraft | null
  chatRunId?: string | null
  chatSubmitting?: boolean
}) => Boolean((promptText.trim() || selectionDraft) && !chatRunId && !chatSubmitting)

export const buildAgentMessageRequest = ({
  boardId,
  promptText,
  selectionDraft,
  uploadedAssetId,
  insertHint,
  clientMessageId,
}: BuildAgentMessageRequestInput): SendAgentMessageRequest => {
  const nextPrompt = promptText?.trim() ?? ''
  const nextInsertHint = insertHint ?? selectionDraft?.insertHint ?? null
  const selectionContextBase = selectionDraft
    ? buildSelectionContext(selectionDraft, boardId, uploadedAssetId)
    : buildEmptySelectionContext(boardId, nextInsertHint)

  const selectionContext = selectionContextBase
    ? {
        ...selectionContextBase,
        insertHint: nextInsertHint,
      }
    : null

  return {
    text: nextPrompt,
    attachments: uploadedAssetId ? [{ assetId: uploadedAssetId }] : [],
    selectionContext,
    clientMessageId,
  }
}

export const submitSidebarComposer = async ({
  surface,
  sendAgentTurn,
  enqueueLegacyTask,
}: SubmitSidebarComposerInput) => {
  if (surface === 'chat-panel') {
    await sendAgentTurn()
    return
  }

  await enqueueLegacyTask()
}
