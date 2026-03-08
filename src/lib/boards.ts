export type BoardMeta = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

const BOARDS_INDEX_KEY = 'canvas:mvp:boards'
const BOARD_STORE_KEY_PREFIX = 'canvas:mvp:board:'

const nowISO = () => new Date().toISOString()

const createBoardId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `board-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
}

const sanitizeBoard = (value: unknown): BoardMeta | null => {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<BoardMeta>
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.title !== 'string' ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.updatedAt !== 'string'
  ) {
    return null
  }

  return {
    id: candidate.id,
    title: candidate.title,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  }
}

const readBoards = (): BoardMeta[] => {
  const raw = localStorage.getItem(BOARDS_INDEX_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(sanitizeBoard).filter((item): item is BoardMeta => !!item)
  } catch {
    return []
  }
}

const writeBoards = (boards: BoardMeta[]) => {
  localStorage.setItem(BOARDS_INDEX_KEY, JSON.stringify(boards))
}

const updateBoardById = (
  boardId: string,
  updater: (board: BoardMeta) => BoardMeta
): BoardMeta | null => {
  let updatedBoard: BoardMeta | null = null

  const nextBoards = readBoards().map((board) => {
    if (board.id !== boardId) return board

    updatedBoard = updater(board)
    return updatedBoard
  })

  if (!updatedBoard) return null

  writeBoards(nextBoards)
  return updatedBoard
}

export const getBoardStoreKey = (boardId: string) =>
  `${BOARD_STORE_KEY_PREFIX}${boardId}`

export const listBoards = (): BoardMeta[] => {
  return readBoards().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const getBoardById = (boardId: string): BoardMeta | null => {
  return readBoards().find((board) => board.id === boardId) ?? null
}

export const createBoard = (title?: string): BoardMeta => {
  const trimmedTitle = title?.trim()
  const timestamp = nowISO()
  const board: BoardMeta = {
    id: createBoardId(),
    title: trimmedTitle || 'Untitled board',
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  const nextBoards = [board, ...readBoards()]
  writeBoards(nextBoards)
  return board
}

export const renameBoard = (boardId: string, title: string): BoardMeta | null => {
  const nextTitle = title.trim()
  if (!nextTitle) return null

  return updateBoardById(boardId, (board) => ({
    ...board,
    title: nextTitle,
    updatedAt: nowISO(),
  }))
}

export const touchBoard = (boardId: string): BoardMeta | null => {
  return updateBoardById(boardId, (board) => ({
    ...board,
    updatedAt: nowISO(),
  }))
}

export const deleteBoard = (boardId: string) => {
  const nextBoards = readBoards().filter((board) => board.id !== boardId)
  writeBoards(nextBoards)
  localStorage.removeItem(getBoardStoreKey(boardId))
}
