import type { MouseEvent as ReactMouseEvent } from 'react'
import { MASK_BRUSH_SIZES } from '../constants'
import type { MaskStrokeMode } from '../../../lib/maskedImageEdit'

type MaskPanelProps = {
  visible: boolean
  maskStatusText: string
  maskEnabled: boolean
  canUseMaskEditor: boolean
  maskTool: MaskStrokeMode
  maskBrushSize: number
  showMaskOverlay: boolean
  maskStrokeCount: number
  onToggleMaskEnabled: () => void
  onSelectMaskTool: (tool: MaskStrokeMode) => void
  onBrushSizeChange: (size: number) => void
  onToggleMaskOverlay: () => void
  onClearMask: () => void
  onToolbarMouseDown: (event: ReactMouseEvent<HTMLElement>) => void
}

export function MaskPanel({
  visible,
  maskStatusText,
  maskEnabled,
  canUseMaskEditor,
  maskTool,
  maskBrushSize,
  showMaskOverlay,
  maskStrokeCount,
  onToggleMaskEnabled,
  onSelectMaskTool,
  onBrushSizeChange,
  onToggleMaskOverlay,
  onClearMask,
  onToolbarMouseDown,
}: MaskPanelProps) {
  if (!visible) return null

  return (
    <div className="workbench-mask-panel">
      <div className="workbench-mask-panel__header">
        <div>
          <strong>语义蒙版</strong>
          <p>{maskStatusText}</p>
        </div>
        <button
          type="button"
          className={`workbench-mask-toggle ${maskEnabled ? 'is-active' : ''}`}
          onClick={onToggleMaskEnabled}
          onMouseDown={onToolbarMouseDown}
          disabled={!canUseMaskEditor}
        >
          {maskEnabled ? '已开启' : '开启蒙版'}
        </button>
      </div>

      <div className="workbench-mask-controls">
        <button
          type="button"
          className={maskTool === 'paint' ? 'is-active' : ''}
          onClick={() => onSelectMaskTool('paint')}
          onMouseDown={onToolbarMouseDown}
          disabled={!maskEnabled || !canUseMaskEditor}
        >
          画笔
        </button>
        <button
          type="button"
          className={maskTool === 'erase' ? 'is-active' : ''}
          onClick={() => onSelectMaskTool('erase')}
          onMouseDown={onToolbarMouseDown}
          disabled={!maskEnabled || !canUseMaskEditor}
        >
          橡皮擦
        </button>
        <select
          value={maskBrushSize}
          onChange={(event) => onBrushSizeChange(Number(event.target.value))}
          disabled={!maskEnabled || !canUseMaskEditor}
          aria-label="选择蒙版笔刷大小"
        >
          {MASK_BRUSH_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onToggleMaskOverlay}
          onMouseDown={onToolbarMouseDown}
          disabled={!maskEnabled || !canUseMaskEditor}
        >
          {showMaskOverlay ? '隐藏遮罩' : '显示遮罩'}
        </button>
        <button
          type="button"
          onClick={onClearMask}
          onMouseDown={onToolbarMouseDown}
          disabled={!maskEnabled || !canUseMaskEditor || maskStrokeCount === 0}
        >
          清空
        </button>
      </div>
    </div>
  )
}
