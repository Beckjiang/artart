import type {
  CreateAgentAssetRequest,
  CreateAgentAssetResponse,
  SendAgentMessageRequest,
  SendAgentMessageResponse,
  SessionMessagesResponse,
} from './agentChatTypes'
import { buildGeminiConnectionOverrideHeaders } from './geminiConnection'
import { readLocalGeminiConnectionOverride } from './geminiConnectionSettings'
import { buildApiUrl } from './runtime'

const ensureOk = async (response: Response) => {
  if (response.ok) return response

  let message = `Request failed (${response.status})`
  try {
    const payload = (await response.json()) as { error?: string }
    if (payload.error) {
      message = payload.error
    }
  } catch {
    // noop
  }

  throw new Error(message)
}

export const buildSessionEventsUrl = (boardId: string) =>
  buildApiUrl(`/api/agent/sessions/${encodeURIComponent(boardId)}/events`)

export const fetchSessionMessages = async (boardId: string): Promise<SessionMessagesResponse> => {
  const response = await fetch(
    buildApiUrl(`/api/agent/sessions/${encodeURIComponent(boardId)}/messages`),
    {
      cache: 'no-store',
    }
  )

  await ensureOk(response)
  return (await response.json()) as SessionMessagesResponse
}

export const createAgentAsset = async (
  request: CreateAgentAssetRequest
): Promise<CreateAgentAssetResponse> => {
  const response = await fetch(buildApiUrl('/api/agent/assets'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  await ensureOk(response)
  return (await response.json()) as CreateAgentAssetResponse
}

export const sendAgentMessage = async (
  boardId: string,
  request: SendAgentMessageRequest
): Promise<SendAgentMessageResponse> => {
  const response = await fetch(
    buildApiUrl(`/api/agent/sessions/${encodeURIComponent(boardId)}/messages`),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildGeminiConnectionOverrideHeaders(readLocalGeminiConnectionOverride()),
      },
      body: JSON.stringify(request),
    }
  )

  await ensureOk(response)
  return (await response.json()) as SendAgentMessageResponse
}
