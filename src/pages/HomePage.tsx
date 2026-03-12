import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GeminiSettingsPanel } from '../components/GeminiSettingsPanel'
import {
  createBoard,
  deleteBoard,
  listBoards,
  renameBoard,
} from '../lib/boards'
import type { BoardMeta } from '../lib/boards'

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

export function HomePage() {
  const [boards, setBoards] = useState<BoardMeta[]>(() => listBoards())
  const [title, setTitle] = useState('')
  const navigate = useNavigate()

  const hasBoards = boards.length > 0

  const reloadBoards = () => {
    setBoards(listBoards())
  }

  const handleCreateBoard = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const board = createBoard(title)
    setTitle('')
    reloadBoards()
    navigate(`/board/${board.id}`)
  }

  const handleRenameBoard = (board: BoardMeta) => {
    const input = window.prompt('重命名画布', board.title)
    if (!input) return

    renameBoard(board.id, input)
    reloadBoards()
  }

  const handleDeleteBoard = (board: BoardMeta) => {
    const shouldDelete = window.confirm(`删除画布 “${board.title}”？该操作不可恢复。`)
    if (!shouldDelete) return

    deleteBoard(board.id)
    reloadBoards()
  }

  return (
    <main className="home-page">
      <section className="hero">
        <p className="eyebrow">Canvas MVP</p>
        <h1>从 tldraw 起步的画布应用</h1>
        <p className="subtitle">
          当前版本包含：画布创建、文档列表、重命名、删除与本地自动保存。
        </p>
        <form className="create-form" onSubmit={handleCreateBoard}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="输入画布名称（可选）"
          />
          <button type="submit">新建画布</button>
        </form>

        <GeminiSettingsPanel />
      </section>

      <section className="board-list">
        <div className="list-header">
          <h2>我的画布</h2>
          <span>{boards.length} 个文档</span>
        </div>

        {hasBoards ? (
          <ul>
            {boards.map((board) => (
              <li key={board.id} className="board-item">
                <div>
                  <h3>{board.title}</h3>
                  <p>更新于 {formatDate(board.updatedAt)}</p>
                </div>
                <div className="board-actions">
                  <Link to={`/board/${board.id}`}>打开</Link>
                  <button type="button" onClick={() => handleRenameBoard(board)}>
                    重命名
                  </button>
                  <button type="button" onClick={() => handleDeleteBoard(board)}>
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <p>还没有画布。先创建一个开始绘制。</p>
          </div>
        )}
      </section>
    </main>
  )
}
