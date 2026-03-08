import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Tldraw } from 'tldraw'
import { CanvasWorkbench } from '../components/CanvasWorkbench'
import { getBoardById, getBoardStoreKey } from '../lib/boards'
import type { BoardMeta } from '../lib/boards'

export function BoardPage() {
  const { boardId } = useParams()
  const [, setVersion] = useState(0)

  const board: BoardMeta | null = boardId ? getBoardById(boardId) : null

  if (!boardId || !board) {
    return (
      <main className="board-not-found">
        <h1>画布不存在</h1>
        <p>链接可能无效，或者画布已被删除。</p>
        <Link to="/">返回首页</Link>
      </main>
    )
  }

  return (
    <main className="board-page">
      <section className="board-canvas board-canvas--workbench">
        <Tldraw persistenceKey={getBoardStoreKey(board.id)} autoFocus hideUi>
          <CanvasWorkbench
            board={board}
            onBoardMetaChange={() => setVersion((value) => value + 1)}
          />
        </Tldraw>
      </section>
    </main>
  )
}
