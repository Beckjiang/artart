import type { MouseEvent as ReactMouseEvent } from 'react'
import { TOOL_ITEMS } from '../constants'
import { ToolbarIcon } from './ToolbarIcon'
import type { ToolId } from '../types'

type WorkbenchToolbarProps = {
  assistantMode: string
  getToolIsActive: (toolId: ToolId) => boolean
  onToolSelect: (toolId: ToolId) => void
  onCreateGeneratorCard: () => void
  onToolbarMouseDown: (event: ReactMouseEvent<HTMLElement>) => void
}

export function WorkbenchToolbar({
  assistantMode,
  getToolIsActive,
  onToolSelect,
  onCreateGeneratorCard,
  onToolbarMouseDown,
}: WorkbenchToolbarProps) {
  return (
    <div className="canvas-workbench-toolbar">
      {TOOL_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`workbench-tool-button ${getToolIsActive(item.id) ? 'is-active' : ''}`}
          onClick={() => onToolSelect(item.id)}
          onMouseDown={onToolbarMouseDown}
          aria-label={item.label}
          title={item.label}
        >
          <ToolbarIcon icon={item.icon} />
        </button>
      ))}

      <div className="workbench-toolbar-divider" aria-hidden="true" />

      <button
        type="button"
        className={`workbench-tool-button workbench-generator-button ${assistantMode === 'image-generator' ? 'is-active' : ''}`}
        onClick={onCreateGeneratorCard}
        onMouseDown={onToolbarMouseDown}
        aria-label="Image Generator"
        title="Image Generator"
      >
        <ToolbarIcon icon="generator" />
      </button>
    </div>
  )
}
