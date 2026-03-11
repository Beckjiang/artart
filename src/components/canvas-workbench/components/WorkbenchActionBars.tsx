import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import { Rotate3d } from 'lucide-react'
import { ACTION_PRESETS, IMAGE_EDIT_PRESETS } from '../constants'
import type { ImageEditActionPreset } from '../types'

type WorkbenchActionBarsProps = {
  floatingActionStyle: CSSProperties | null
  selectionImagineStyle: CSSProperties | null
  activePreset: ImageEditActionPreset
  selectionImagineBusy: boolean
  selectionImagineError: string
  onSelectPreset: (preset: ImageEditActionPreset) => void
  onOpenCameraAngle: () => void
  onEnqueueSelectionImagineTask: () => void
  onToolbarMouseDown: (event: ReactMouseEvent<HTMLElement>) => void
}

export function WorkbenchActionBars({
  floatingActionStyle,
  selectionImagineStyle,
  activePreset,
  selectionImagineBusy,
  selectionImagineError,
  onSelectPreset,
  onOpenCameraAngle,
  onEnqueueSelectionImagineTask,
  onToolbarMouseDown,
}: WorkbenchActionBarsProps) {
  return (
    <>
      {floatingActionStyle ? (
        <div className="canvas-workbench-actionbar" style={floatingActionStyle}>
          {IMAGE_EDIT_PRESETS.map((preset) => {
            const { icon: PresetIcon, label } = ACTION_PRESETS[preset]
            return (
              <button
                key={preset}
                type="button"
                className={activePreset === preset ? 'is-active' : ''}
                onClick={() => onSelectPreset(preset)}
                onMouseDown={onToolbarMouseDown}
              >
                <PresetIcon size={14} />
                {label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={onOpenCameraAngle}
            onMouseDown={onToolbarMouseDown}
          >
            <Rotate3d size={14} />
            多角度
          </button>
        </div>
      ) : null}

      {selectionImagineStyle ? (
        <div className="canvas-workbench-imaginebar" style={selectionImagineStyle}>
          <button
            type="button"
            onClick={onEnqueueSelectionImagineTask}
            onMouseDown={onToolbarMouseDown}
            disabled={selectionImagineBusy}
          >
            {selectionImagineBusy ? 'Imagining…' : 'imagine'}
          </button>
          {selectionImagineError ? (
            <p className="canvas-workbench-imagine-status is-error">{selectionImagineError}</p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
