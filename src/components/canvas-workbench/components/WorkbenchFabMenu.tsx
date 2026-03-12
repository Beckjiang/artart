import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { TOOL_ITEMS } from '../constants'
import { ToolbarIcon } from './ToolbarIcon'
import type { ToolId } from '../types'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const getRadius = () => {
  if (typeof window === 'undefined') return 140
  return Math.round(clamp(window.innerWidth * 0.18, 110, 160))
}

const ChatGlyph = ({ active }: { active: boolean }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 12c0 4.4-3.6 8-8 8-1.1 0-2.1-.2-3.1-.6L4 20l.7-3.1A7.9 7.9 0 0 1 4 12c0-4.4 3.6-8 8-8s8 3.6 8 8Z" />
    {active ? <path d="M9 12h6" /> : <path d="M9 12h6M12 9v6" />}
  </svg>
)

type FabAction = {
  id: string
  label: string
  icon: ReactNode
  active?: boolean
  onSelect: () => void
}

type WorkbenchFabMenuProps = {
  assistantMode: string
  isChatOpen: boolean
  getToolIsActive: (toolId: ToolId) => boolean
  onToolSelect: (toolId: ToolId) => void
  onCreateGeneratorCard: () => void
  onToggleChat: () => void
  onToolbarMouseDown: (event: ReactMouseEvent<HTMLElement>) => void
}

export function WorkbenchFabMenu({
  assistantMode,
  isChatOpen,
  getToolIsActive,
  onToolSelect,
  onCreateGeneratorCard,
  onToggleChat,
  onToolbarMouseDown,
}: WorkbenchFabMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [radius, setRadius] = useState(() => getRadius())

  useEffect(() => {
    const handleResize = () => setRadius(getRadius())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!isMenuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMenuOpen])

  const actions: FabAction[] = useMemo(() => {
    const toolActions = TOOL_ITEMS.map((item) => ({
      id: `tool-${item.id}`,
      label: item.label,
      icon: <ToolbarIcon icon={item.icon} />,
      active: getToolIsActive(item.id),
      onSelect: () => onToolSelect(item.id),
    }))

    return [
      ...toolActions,
      {
        id: 'generator',
        label: 'Image Generator',
        icon: <ToolbarIcon icon="generator" />,
        active: assistantMode === 'image-generator',
        onSelect: onCreateGeneratorCard,
      },
      {
        id: 'chat',
        label: isChatOpen ? '关闭 Chat' : '打开 Chat',
        icon: <ChatGlyph active={isChatOpen} />,
        active: isChatOpen,
        onSelect: onToggleChat,
      },
    ]
  }, [assistantMode, getToolIsActive, isChatOpen, onCreateGeneratorCard, onToggleChat, onToolSelect])

  const originLift = Math.round(radius * 0.6)
  const arcStart = -120
  const arcSpan = 240
  const step = actions.length > 1 ? arcSpan / (actions.length - 1) : 0

  return (
    <>
      {isMenuOpen ? (
        <button
          type="button"
          className="workbench-fab-scrim"
          onClick={() => setIsMenuOpen(false)}
          aria-label="关闭菜单"
        />
      ) : null}

      <div className={`workbench-fab-shell ${isMenuOpen ? 'is-open' : ''}`}>
        <div className={`workbench-fab-menu ${isMenuOpen ? 'is-open' : ''}`} aria-hidden={!isMenuOpen}>
          {actions.map((action, index) => {
            const angleDeg = arcStart + step * index
            const angleRad = (angleDeg * Math.PI) / 180
            const x = Math.round(radius * Math.sin(angleRad))
            const y = Math.round(-radius * Math.cos(angleRad) - originLift)

            const style = {
              '--fab-x': `${x}px`,
              '--fab-y': `${y}px`,
              transitionDelay: `${index * 14}ms`,
            } as CSSProperties

            return (
              <button
                key={action.id}
                type="button"
                className={`workbench-fab-item ${action.active ? 'is-active' : ''}`}
                style={style}
                onClick={() => {
                  action.onSelect()
                  setIsMenuOpen(false)
                }}
                onMouseDown={onToolbarMouseDown}
                aria-label={action.label}
                title={action.label}
              >
                {action.icon}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          className="workbench-fab-button"
          onClick={() => setIsMenuOpen((value) => !value)}
          onMouseDown={onToolbarMouseDown}
          aria-label={isMenuOpen ? '关闭菜单' : '打开菜单'}
          title={isMenuOpen ? '关闭菜单' : '打开菜单'}
        >
          <span aria-hidden="true">{isMenuOpen ? '×' : '◎'}</span>
        </button>
      </div>
    </>
  )
}

