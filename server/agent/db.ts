import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import initSqlJs from 'sql.js/dist/sql-asm.js'
import type {
  CanvasInsertHint,
  ChatAttachment,
  ChatAttachmentKind,
  ChatMessage,
  ChatMessageKind,
  ChatMessageRole,
  ChatMessageStatus,
  ChatSession,
  CreateAgentAssetRequest,
} from '../../src/lib/agentChatTypes'
import { safeJsonParse } from './utils'

type DbHandle = Awaited<ReturnType<typeof createDatabase>>

type MessagePayload = {
  canvasInsertHint?: CanvasInsertHint | null
  meta?: Record<string, unknown> | null
}

type CreateMessageInput = {
  id: string
  sessionId: string
  boardId: string
  role: ChatMessageRole
  kind: ChatMessageKind
  text: string
  status: ChatMessageStatus
  runId?: string | null
  canvasInsertHint?: CanvasInsertHint | null
  meta?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

type CreateRunInput = {
  id: string
  sessionId: string
  boardId: string
  userMessageId: string
  createdAt: string
  updatedAt: string
}

export type StoredRun = {
  id: string
  sessionId: string
  boardId: string
  userMessageId: string
  assistantMessageId: string | null
  status: string
  actionJson: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

type AssetRow = {
  id: string
  board_id: string
  kind: ChatAttachmentKind
  name: string
  mime_type: string | null
  preview_url: string | null
  data_url: string | null
  width: number | null
  height: number | null
  shape_id: string | null
  created_at: string
}

const DATA_DIR = path.join(process.cwd(), '.data')
const DB_PATH = path.join(DATA_DIR, 'agent-chat.sqlite')

let dbPromise: Promise<DbHandle> | null = null

const createDatabase = async () => {
  mkdirSync(DATA_DIR, { recursive: true })
  const SQL = await initSqlJs()
  const initial = existsSync(DB_PATH) ? new Uint8Array(readFileSync(DB_PATH)) : undefined
  const database = new SQL.Database(initial)

  database.run(`
    CREATE TABLE IF NOT EXISTS agent_session (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_asset (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT,
      preview_url TEXT,
      data_url TEXT,
      width INTEGER,
      height INTEGER,
      shape_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      board_id TEXT NOT NULL,
      role TEXT NOT NULL,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL,
      run_id TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_attachment (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      board_id TEXT NOT NULL,
      asset_id TEXT,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT,
      preview_url TEXT,
      data_url TEXT,
      width INTEGER,
      height INTEGER,
      shape_id TEXT,
      canvas_shape_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_run (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      board_id TEXT NOT NULL,
      user_message_id TEXT NOT NULL,
      assistant_message_id TEXT,
      status TEXT NOT NULL,
      action_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_message_board_created
      ON agent_message(board_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_agent_attachment_message
      ON agent_attachment(message_id);
    CREATE INDEX IF NOT EXISTS idx_agent_run_board_updated
      ON agent_run(board_id, updated_at);
  `)

  const persist = () => {
    writeFileSync(DB_PATH, Buffer.from(database.export()))
  }

  const all = <T>(sql: string, params?: Record<string, unknown>): T[] => {
    const statement = database.prepare(sql, params)
    const rows: T[] = []
    while (statement.step()) {
      rows.push(statement.getAsObject() as T)
    }
    statement.free()
    return rows
  }

  const get = <T>(sql: string, params?: Record<string, unknown>): T | null => all<T>(sql, params)[0] ?? null

  const run = (sql: string, params?: Record<string, unknown>) => {
    database.run(sql, params)
    persist()
  }

  return { database, all, get, run }
}

const getDb = async () => {
  dbPromise ??= createDatabase()
  return dbPromise
}

const hydrateAttachments = async (messageId: string): Promise<ChatAttachment[]> => {
  const db = await getDb()
  const rows = db.all<{
    id: string
    asset_id: string | null
    kind: ChatAttachmentKind
    name: string
    mime_type: string | null
    preview_url: string | null
    data_url: string | null
    width: number | null
    height: number | null
    shape_id: string | null
    canvas_shape_id: string | null
  }>(
    `SELECT id, asset_id, kind, name, mime_type, preview_url, data_url, width, height, shape_id, canvas_shape_id
       FROM agent_attachment
      WHERE message_id = $messageId
      ORDER BY created_at ASC`,
    { $messageId: messageId }
  )

  return rows.map((row) => ({
    id: row.id,
    assetId: row.asset_id,
    kind: row.kind,
    name: row.name,
    mimeType: row.mime_type,
    previewUrl: row.preview_url,
    dataUrl: row.data_url,
    width: row.width,
    height: row.height,
    shapeId: row.shape_id,
    canvasShapeId: row.canvas_shape_id,
  }))
}

const hydrateMessage = async (row: {
  id: string
  session_id: string
  board_id: string
  role: ChatMessageRole
  kind: ChatMessageKind
  text: string
  status: ChatMessageStatus
  run_id: string | null
  payload_json: string | null
  created_at: string
  updated_at: string
}): Promise<ChatMessage> => {
  const payload = safeJsonParse<MessagePayload>(row.payload_json, {})

  return {
    id: row.id,
    sessionId: row.session_id,
    boardId: row.board_id,
    role: row.role,
    kind: row.kind,
    text: row.text,
    status: row.status,
    runId: row.run_id,
    attachments: await hydrateAttachments(row.id),
    canvasInsertHint: payload.canvasInsertHint ?? null,
    meta: payload.meta ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const getAssetRow = async (assetId: string) => {
  const db = await getDb()
  return db.get<AssetRow>(
    `SELECT id, board_id, kind, name, mime_type, preview_url, data_url, width, height, shape_id, created_at
       FROM agent_asset
      WHERE id = $assetId`,
    { $assetId: assetId }
  )
}

export const getOrCreateSession = async (session: ChatSession): Promise<ChatSession> => {
  const db = await getDb()
  const existing = db.get<{
    id: string
    board_id: string
    created_at: string
    updated_at: string
  }>(
    `SELECT id, board_id, created_at, updated_at
       FROM agent_session
      WHERE board_id = $boardId`,
    { $boardId: session.boardId }
  )

  if (existing) {
    return {
      id: existing.id,
      boardId: existing.board_id,
      createdAt: existing.created_at,
      updatedAt: existing.updated_at,
    }
  }

  db.run(
    `INSERT INTO agent_session (id, board_id, created_at, updated_at)
     VALUES ($id, $boardId, $createdAt, $updatedAt)`,
    {
      $id: session.id,
      $boardId: session.boardId,
      $createdAt: session.createdAt,
      $updatedAt: session.updatedAt,
    }
  )

  return session
}

export const touchSession = async (sessionId: string, updatedAt: string) => {
  const db = await getDb()
  db.run(`UPDATE agent_session SET updated_at = $updatedAt WHERE id = $sessionId`, {
    $updatedAt: updatedAt,
    $sessionId: sessionId,
  })
}

export const createAsset = async (
  id: string,
  request: CreateAgentAssetRequest,
  createdAt: string
): Promise<ChatAttachment> => {
  const db = await getDb()
  db.run(
    `INSERT INTO agent_asset (
      id, board_id, kind, name, mime_type, preview_url, data_url, width, height, shape_id, created_at
    ) VALUES (
      $id, $boardId, $kind, $name, $mimeType, $previewUrl, $dataUrl, $width, $height, $shapeId, $createdAt
    )`,
    {
      $id: id,
      $boardId: request.boardId,
      $kind: request.kind,
      $name: request.name,
      $mimeType: request.mimeType ?? null,
      $previewUrl: request.previewUrl ?? request.dataUrl,
      $dataUrl: request.dataUrl,
      $width: request.width ?? null,
      $height: request.height ?? null,
      $shapeId: request.shapeId ?? null,
      $createdAt: createdAt,
    }
  )

  return {
    id,
    kind: request.kind,
    name: request.name,
    mimeType: request.mimeType ?? null,
    previewUrl: request.previewUrl ?? request.dataUrl,
    dataUrl: request.dataUrl,
    width: request.width ?? null,
    height: request.height ?? null,
    shapeId: request.shapeId ?? null,
  }
}

export const createMessage = async (input: CreateMessageInput): Promise<ChatMessage> => {
  const db = await getDb()
  db.run(
    `INSERT INTO agent_message (
      id, session_id, board_id, role, kind, text, status, run_id, payload_json, created_at, updated_at
    ) VALUES (
      $id, $sessionId, $boardId, $role, $kind, $text, $status, $runId, $payloadJson, $createdAt, $updatedAt
    )`,
    {
      $id: input.id,
      $sessionId: input.sessionId,
      $boardId: input.boardId,
      $role: input.role,
      $kind: input.kind,
      $text: input.text,
      $status: input.status,
      $runId: input.runId ?? null,
      $payloadJson: JSON.stringify({
        canvasInsertHint: input.canvasInsertHint ?? null,
        meta: input.meta ?? null,
      }),
      $createdAt: input.createdAt,
      $updatedAt: input.updatedAt,
    }
  )

  return hydrateMessage({
    id: input.id,
    session_id: input.sessionId,
    board_id: input.boardId,
    role: input.role,
    kind: input.kind,
    text: input.text,
    status: input.status,
    run_id: input.runId ?? null,
    payload_json: JSON.stringify({
      canvasInsertHint: input.canvasInsertHint ?? null,
      meta: input.meta ?? null,
    }),
    created_at: input.createdAt,
    updated_at: input.updatedAt,
  })
}

export const updateMessage = async (
  messageId: string,
  patch: {
    text?: string
    status?: ChatMessageStatus
    updatedAt: string
    canvasInsertHint?: CanvasInsertHint | null
    meta?: Record<string, unknown> | null
  }
): Promise<ChatMessage> => {
  const db = await getDb()
  const current = db.get<{
    id: string
    session_id: string
    board_id: string
    role: ChatMessageRole
    kind: ChatMessageKind
    text: string
    status: ChatMessageStatus
    run_id: string | null
    payload_json: string | null
    created_at: string
    updated_at: string
  }>(
    `SELECT id, session_id, board_id, role, kind, text, status, run_id, payload_json, created_at, updated_at
       FROM agent_message
      WHERE id = $messageId`,
    { $messageId: messageId }
  )

  if (!current) {
    throw new Error('message_not_found')
  }

  const currentPayload = safeJsonParse<MessagePayload>(current.payload_json, {})
  const nextPayload: MessagePayload = {
    canvasInsertHint: patch.canvasInsertHint ?? currentPayload.canvasInsertHint ?? null,
    meta: patch.meta ?? currentPayload.meta ?? null,
  }

  db.run(
    `UPDATE agent_message
        SET text = $text,
            status = $status,
            payload_json = $payloadJson,
            updated_at = $updatedAt
      WHERE id = $messageId`,
    {
      $text: patch.text ?? current.text,
      $status: patch.status ?? current.status,
      $payloadJson: JSON.stringify(nextPayload),
      $updatedAt: patch.updatedAt,
      $messageId: messageId,
    }
  )

  return hydrateMessage({
    ...current,
    text: patch.text ?? current.text,
    status: patch.status ?? current.status,
    payload_json: JSON.stringify(nextPayload),
    updated_at: patch.updatedAt,
  })
}

export const attachAssetsToMessage = async (
  messageId: string,
  boardId: string,
  assetIds: string[],
  attachmentIds: string[],
  createdAt: string
) => {
  const db = await getDb()

  for (let index = 0; index < assetIds.length; index += 1) {
    const assetRow = await getAssetRow(assetIds[index] ?? '')
    if (!assetRow) {
      throw new Error(`asset_not_found:${assetIds[index]}`)
    }

    db.run(
      `INSERT INTO agent_attachment (
        id, message_id, board_id, asset_id, kind, name, mime_type, preview_url, data_url, width, height, shape_id, canvas_shape_id, created_at
      ) VALUES (
        $id, $messageId, $boardId, $assetId, $kind, $name, $mimeType, $previewUrl, $dataUrl, $width, $height, $shapeId, NULL, $createdAt
      )`,
      {
        $id: attachmentIds[index],
        $messageId: messageId,
        $boardId: boardId,
        $assetId: assetRow.id,
        $kind: assetRow.kind,
        $name: assetRow.name,
        $mimeType: assetRow.mime_type,
        $previewUrl: assetRow.preview_url,
        $dataUrl: assetRow.data_url,
        $width: assetRow.width,
        $height: assetRow.height,
        $shapeId: assetRow.shape_id,
        $createdAt: createdAt,
      }
    )
  }
}

export const createGeneratedAttachment = async (
  input: {
    id: string
    messageId: string
    boardId: string
    name: string
    mimeType?: string | null
    previewUrl?: string | null
    dataUrl?: string | null
    width?: number | null
    height?: number | null
    canvasShapeId?: string | null
  },
  createdAt: string
): Promise<ChatAttachment> => {
  const db = await getDb()
  db.run(
    `INSERT INTO agent_attachment (
      id, message_id, board_id, asset_id, kind, name, mime_type, preview_url, data_url, width, height, shape_id, canvas_shape_id, created_at
    ) VALUES (
      $id, $messageId, $boardId, NULL, $kind, $name, $mimeType, $previewUrl, $dataUrl, $width, $height, NULL, $canvasShapeId, $createdAt
    )`,
    {
      $id: input.id,
      $messageId: input.messageId,
      $boardId: input.boardId,
      $kind: 'generated-image',
      $name: input.name,
      $mimeType: input.mimeType ?? null,
      $previewUrl: input.previewUrl ?? input.dataUrl ?? null,
      $dataUrl: input.dataUrl ?? null,
      $width: input.width ?? null,
      $height: input.height ?? null,
      $canvasShapeId: input.canvasShapeId ?? null,
      $createdAt: createdAt,
    }
  )

  return {
    id: input.id,
    kind: 'generated-image',
    name: input.name,
    mimeType: input.mimeType ?? null,
    previewUrl: input.previewUrl ?? input.dataUrl ?? null,
    dataUrl: input.dataUrl ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    canvasShapeId: input.canvasShapeId ?? null,
  }
}

export const updateAttachmentCanvasShape = async (attachmentId: string, canvasShapeId: string | null) => {
  const db = await getDb()
  db.run(`UPDATE agent_attachment SET canvas_shape_id = $canvasShapeId WHERE id = $attachmentId`, {
    $canvasShapeId: canvasShapeId,
    $attachmentId: attachmentId,
  })
}

export const listMessagesByBoard = async (boardId: string): Promise<ChatMessage[]> => {
  const db = await getDb()
  const rows = db.all<{
    id: string
    session_id: string
    board_id: string
    role: ChatMessageRole
    kind: ChatMessageKind
    text: string
    status: ChatMessageStatus
    run_id: string | null
    payload_json: string | null
    created_at: string
    updated_at: string
  }>(
    `SELECT id, session_id, board_id, role, kind, text, status, run_id, payload_json, created_at, updated_at
       FROM agent_message
      WHERE board_id = $boardId
      ORDER BY created_at ASC`,
    { $boardId: boardId }
  )

  return Promise.all(rows.map((row) => hydrateMessage(row)))
}

export const getMessageById = async (messageId: string): Promise<ChatMessage | null> => {
  const db = await getDb()
  const row = db.get<{
    id: string
    session_id: string
    board_id: string
    role: ChatMessageRole
    kind: ChatMessageKind
    text: string
    status: ChatMessageStatus
    run_id: string | null
    payload_json: string | null
    created_at: string
    updated_at: string
  }>(
    `SELECT id, session_id, board_id, role, kind, text, status, run_id, payload_json, created_at, updated_at
       FROM agent_message
      WHERE id = $messageId`,
    { $messageId: messageId }
  )

  return row ? hydrateMessage(row) : null
}

export const createRun = async (input: CreateRunInput): Promise<StoredRun> => {
  const db = await getDb()
  db.run(
    `INSERT INTO agent_run (
      id, session_id, board_id, user_message_id, assistant_message_id, status, action_json, error, created_at, updated_at
    ) VALUES (
      $id, $sessionId, $boardId, $userMessageId, NULL, 'queued', NULL, NULL, $createdAt, $updatedAt
    )`,
    {
      $id: input.id,
      $sessionId: input.sessionId,
      $boardId: input.boardId,
      $userMessageId: input.userMessageId,
      $createdAt: input.createdAt,
      $updatedAt: input.updatedAt,
    }
  )

  return {
    id: input.id,
    sessionId: input.sessionId,
    boardId: input.boardId,
    userMessageId: input.userMessageId,
    assistantMessageId: null,
    status: 'queued',
    actionJson: null,
    error: null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}

export const updateRun = async (
  runId: string,
  patch: Partial<Pick<StoredRun, 'assistantMessageId' | 'status' | 'actionJson' | 'error'>> & {
    updatedAt: string
  }
): Promise<StoredRun> => {
  const db = await getDb()
  const current = db.get<{
    id: string
    session_id: string
    board_id: string
    user_message_id: string
    assistant_message_id: string | null
    status: string
    action_json: string | null
    error: string | null
    created_at: string
    updated_at: string
  }>(
    `SELECT id, session_id, board_id, user_message_id, assistant_message_id, status, action_json, error, created_at, updated_at
       FROM agent_run
      WHERE id = $runId`,
    { $runId: runId }
  )

  if (!current) throw new Error('run_not_found')

  db.run(
    `UPDATE agent_run
        SET assistant_message_id = $assistantMessageId,
            status = $status,
            action_json = $actionJson,
            error = $error,
            updated_at = $updatedAt
      WHERE id = $runId`,
    {
      $assistantMessageId: patch.assistantMessageId ?? current.assistant_message_id,
      $status: patch.status ?? current.status,
      $actionJson: patch.actionJson ?? current.action_json,
      $error: patch.error ?? current.error,
      $updatedAt: patch.updatedAt,
      $runId: runId,
    }
  )

  return {
    id: current.id,
    sessionId: current.session_id,
    boardId: current.board_id,
    userMessageId: current.user_message_id,
    assistantMessageId: patch.assistantMessageId ?? current.assistant_message_id,
    status: patch.status ?? current.status,
    actionJson: patch.actionJson ?? current.action_json,
    error: patch.error ?? current.error,
    createdAt: current.created_at,
    updatedAt: patch.updatedAt,
  }
}

export const getLatestSessionByBoard = async (boardId: string): Promise<ChatSession | null> => {
  const db = await getDb()
  const session = db.get<{
    id: string
    board_id: string
    created_at: string
    updated_at: string
  }>(
    `SELECT id, board_id, created_at, updated_at
       FROM agent_session
      WHERE board_id = $boardId`,
    { $boardId: boardId }
  )

  return session
    ? {
        id: session.id,
        boardId: session.board_id,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
      }
    : null
}

export const getActiveRunByBoard = async (boardId: string): Promise<StoredRun | null> => {
  const db = await getDb()
  const run = db.get<{
    id: string
    session_id: string
    board_id: string
    user_message_id: string
    assistant_message_id: string | null
    status: string
    action_json: string | null
    error: string | null
    created_at: string
    updated_at: string
  }>(
    `SELECT id, session_id, board_id, user_message_id, assistant_message_id, status, action_json, error, created_at, updated_at
       FROM agent_run
      WHERE board_id = $boardId
        AND status IN ('queued', 'running')
      ORDER BY updated_at DESC
      LIMIT 1`,
    { $boardId: boardId }
  )

  return run
    ? {
        id: run.id,
        sessionId: run.session_id,
        boardId: run.board_id,
        userMessageId: run.user_message_id,
        assistantMessageId: run.assistant_message_id,
        status: run.status,
        actionJson: run.action_json,
        error: run.error,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
      }
    : null
}

export const getAssetDataUrl = async (assetId: string): Promise<string | null> => {
  const row = await getAssetRow(assetId)
  return row?.data_url ?? null
}
