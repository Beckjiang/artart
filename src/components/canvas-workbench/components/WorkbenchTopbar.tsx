import type { MouseEvent as ReactMouseEvent } from 'react'
import { Link } from 'react-router-dom'

type WorkbenchTopbarProps = {
  zoomPercent: number
  onZoomOut: () => void
  onResetZoom: () => void
  onZoomIn: () => void
  onToolbarMouseDown: (event: ReactMouseEvent<HTMLElement>) => void
}

export function WorkbenchTopbar({
  zoomPercent,
  onZoomOut,
  onResetZoom,
  onZoomIn,
  onToolbarMouseDown,
}: WorkbenchTopbarProps) {
  return (
    <div className="canvas-workbench-topbar">
      <div className="canvas-workbench-brand">
        <Link to="/" className="workbench-chip workbench-chip--ghost">
          ← 返回
        </Link>
      </div>

      <div className="canvas-workbench-zoom workbench-chip">
        <button type="button" onClick={onZoomOut} onMouseDown={onToolbarMouseDown} aria-label="缩小">
          −
        </button>
        <button
          type="button"
          className="zoom-readout"
          onClick={onResetZoom}
          onMouseDown={onToolbarMouseDown}
          aria-label="重置缩放"
        >
          {zoomPercent}%
        </button>
        <button type="button" onClick={onZoomIn} onMouseDown={onToolbarMouseDown} aria-label="放大">
          +
        </button>
      </div>
    </div>
  )
}
