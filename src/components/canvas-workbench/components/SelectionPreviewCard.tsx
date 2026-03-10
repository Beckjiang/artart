import type { PointerEventHandler, RefObject } from 'react'

type SelectedImagePreview = {
  src: string
  width: number
  height: number
}

type SelectionPreviewCardProps = {
  selectedImagePreview: SelectedImagePreview | null
  selectionCardTitle: string
  selectionMessage: string
  assistantMode: string
  maskEnabled: boolean
  showMaskOverlay: boolean
  maskPreviewStageRef: RefObject<HTMLDivElement | null>
  maskPreviewCanvasRef: RefObject<HTMLCanvasElement | null>
  onPreviewImageError: () => void
  onMaskPointerDown: PointerEventHandler<HTMLCanvasElement>
  onMaskPointerMove: PointerEventHandler<HTMLCanvasElement>
  onMaskPointerEnd: PointerEventHandler<HTMLCanvasElement>
}

export function SelectionPreviewCard({
  selectedImagePreview,
  selectionCardTitle,
  selectionMessage,
  assistantMode,
  maskEnabled,
  showMaskOverlay,
  maskPreviewStageRef,
  maskPreviewCanvasRef,
  onPreviewImageError,
  onMaskPointerDown,
  onMaskPointerMove,
  onMaskPointerEnd,
}: SelectionPreviewCardProps) {
  return (
    <div className="workbench-selection-card">
      {selectedImagePreview ? (
        <>
          <div className="workbench-selection-preview-shell">
            <div
              ref={maskPreviewStageRef}
              className={`workbench-selection-preview ${maskEnabled ? 'is-mask-enabled' : ''}`}
              style={{ aspectRatio: `${selectedImagePreview.width} / ${selectedImagePreview.height}` }}
            >
              <img
                src={selectedImagePreview.src}
                alt="当前选中图片预览"
                onError={onPreviewImageError}
                draggable={false}
              />
              <canvas
                ref={maskPreviewCanvasRef}
                className={`workbench-selection-mask-canvas ${maskEnabled && showMaskOverlay ? 'is-interactive' : ''}`}
                onPointerDown={onMaskPointerDown}
                onPointerMove={onMaskPointerMove}
                onPointerUp={onMaskPointerEnd}
                onPointerCancel={onMaskPointerEnd}
              />
            </div>
          </div>
          <div className="workbench-selection-meta">
            <strong>{selectionCardTitle}</strong>
            <p>
              {selectedImagePreview.width} × {selectedImagePreview.height}
            </p>
            {assistantMode === 'image-edit' ? (
              <p>{maskEnabled ? '局部蒙版已开启' : '可直接整图编辑，也可开启蒙版只改局部。'}</p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="workbench-selection-empty">
          <strong>{selectionCardTitle}</strong>
          <p>{selectionMessage}</p>
        </div>
      )}
    </div>
  )
}
