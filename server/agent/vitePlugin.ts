import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, PreviewServer, ViteDevServer } from 'vite'
import type {
  CreateAgentAssetRequest,
  SendAgentMessageRequest,
  SessionMessagesResponse,
} from '../../src/lib/agentChatTypes'
import {
  attachAssetsToMessage,
  createAsset,
  createMessage,
  createRun,
  getActiveRunByBoard,
  getLatestSessionByBoard,
  getMessageById,
  getOrCreateSession,
  listMessagesByBoard,
} from './db'
import { addSubscriber, removeSubscriber } from './eventBus'
import { processAgentRun } from './runtime'
import { createId, nowIso } from './utils'

const AGENT_ASSETS_ENDPOINT = '/api/agent/assets'

const readJsonBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

const matchSessionPath = (pathname: string) => {
  const messagesMatch = /^\/api\/agent\/sessions\/([^/]+)\/messages$/.exec(pathname)
  if (messagesMatch) {
    return {
      boardId: decodeURIComponent(messagesMatch[1] || ''),
      kind: 'messages' as const,
    }
  }

  const eventsMatch = /^\/api\/agent\/sessions\/([^/]+)\/events$/.exec(pathname)
  if (eventsMatch) {
    return {
      boardId: decodeURIComponent(eventsMatch[1] || ''),
      kind: 'events' as const,
    }
  }

  return null
}

const handleCreateAsset = async (req: IncomingMessage, res: ServerResponse) => {
  const payload = (await readJsonBody(req)) as CreateAgentAssetRequest
  if (!payload.boardId || !payload.dataUrl || !payload.name) {
    sendJson(res, 400, { error: 'boardId, name and dataUrl are required' })
    return
  }

  const asset = await createAsset(createId('asset'), payload, nowIso())
  sendJson(res, 200, { asset })
}

const handleListMessages = async (boardId: string, res: ServerResponse) => {
  await getActiveRunByBoard(boardId)

  const existingSession = await getLatestSessionByBoard(boardId)
  const session =
    existingSession ??
    (await getOrCreateSession({
      id: createId('session'),
      boardId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }))
  const messages = await listMessagesByBoard(boardId)
  const payload: SessionMessagesResponse = {
    session,
    messages,
  }
  sendJson(res, 200, payload)
}

const handleSendMessage = async (boardId: string, req: IncomingMessage, res: ServerResponse) => {
  const payload = (await readJsonBody(req)) as SendAgentMessageRequest
  const hasText = Boolean(payload.text?.trim())
  const hasAttachment = Boolean(payload.attachments?.length)
  const hasSelection = Boolean(payload.selectionContext)
  if (!hasText && !hasAttachment && !hasSelection) {
    sendJson(res, 400, { error: 'text, attachments or selectionContext is required' })
    return
  }

  const activeRun = await getActiveRunByBoard(boardId)
  if (activeRun) {
    sendJson(res, 409, { error: '当前已有进行中的生成，请等待完成后再发送。' })
    return
  }

  const session = await getOrCreateSession({
    id: createId('session'),
    boardId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  })

  const runId = createId('run')
  const userMessageId = payload.clientMessageId?.trim() || createId('msg-user')
  await createMessage({
    id: userMessageId,
    sessionId: session.id,
    boardId,
    role: 'user',
    kind: 'text',
    text: payload.text?.trim() || '',
    status: 'completed',
    runId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  })

  const assetIds = payload.attachments?.map((attachment) => attachment.assetId).filter(Boolean) ?? []
  if (assetIds.length > 0) {
    await attachAssetsToMessage(
      userMessageId,
      boardId,
      assetIds,
      assetIds.map(() => createId('attachment-user')),
      nowIso()
    )
  }

  const acceptedMessage = await getMessageById(userMessageId)
  if (!acceptedMessage) {
    sendJson(res, 500, { error: 'failed_to_create_user_message' })
    return
  }

  await createRun({
    id: runId,
    sessionId: session.id,
    boardId,
    userMessageId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  })

  sendJson(res, 200, {
    session,
    runId,
    acceptedMessage,
  })

  void processAgentRun({
    runId,
    boardId,
    session,
    userMessage: acceptedMessage,
    selectionContext: payload.selectionContext ?? null,
  })
}

const handleSse = (boardId: string, req: IncomingMessage, res: ServerResponse) => {
  const subscriptionId = createId('sse')
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.write(': connected\n\n')

  addSubscriber(boardId, subscriptionId, res)

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n')
  }, 15000)

  const dispose = () => {
    clearInterval(heartbeat)
    removeSubscriber(boardId, subscriptionId)
  }

  req.on('close', dispose)
  req.on('aborted', dispose)
}

const createAgentHandler = (): Connect.NextHandleFunction => {
  return async (req, res, next) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost')
    const matched = matchSessionPath(requestUrl.pathname)

    try {
      if (requestUrl.pathname === AGENT_ASSETS_ENDPOINT) {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method Not Allowed' })
          return
        }

        await handleCreateAsset(req, res)
        return
      }

      if (!matched) {
        next()
        return
      }

      if (matched.kind === 'messages' && req.method === 'GET') {
        await handleListMessages(matched.boardId, res)
        return
      }

      if (matched.kind === 'messages' && req.method === 'POST') {
        await handleSendMessage(matched.boardId, req, res)
        return
      }

      if (matched.kind === 'events' && req.method === 'GET') {
        handleSse(matched.boardId, req, res)
        return
      }

      sendJson(res, 405, { error: 'Method Not Allowed' })
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'agent_handler_failed',
      })
    }
  }
}

export const localAgentPlugin = () => {
  const handler = createAgentHandler()
  return {
    name: 'local-agent-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(handler)
    },
  }
}
