import { useCallback, useEffect, useMemo } from 'react'
import { CameraAngleThreePreview } from './CameraAngleThreePreview'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  CAMERA_AXIS_X_OPTIONS,
  CAMERA_AXIS_Y_OPTIONS,
  CAMERA_AXIS_Z_OPTIONS,
  getCameraPresetMeta,
  snapCameraPreviewToPreset,
} from '../lib/cameraAngle'
import type { CameraRunState, CameraViewDraft } from '../lib/cameraAngle'

type CameraAngleDialogProps = {
  isOpen: boolean
  sourcePreviewUrl: string
  sourceWidth: number
  sourceHeight: number
  sourceLoading: boolean
  cameraView: CameraViewDraft
  runStatus: CameraRunState
  generatedPreviewUrl: string
  error: string
  onChangeView: (nextView: CameraViewDraft) => void
  onRun: () => void
  onClose: () => void
  onConfirm: () => void
  canRun: boolean
  canConfirm: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function CameraAngleDialog({
  isOpen,
  sourcePreviewUrl,
  sourceWidth,
  sourceHeight,
  sourceLoading,
  cameraView,
  runStatus,
  generatedPreviewUrl,
  error,
  onChangeView,
  onRun,
  onClose,
  onConfirm,
  canRun,
  canConfirm,
}: CameraAngleDialogProps) {
  const presetMeta = useMemo(() => getCameraPresetMeta(cameraView), [cameraView])

  const stageImageUrl = generatedPreviewUrl || sourcePreviewUrl
  const stageLabel = generatedPreviewUrl
    ? runStatus === 'failed'
      ? '上次成功结果'
      : '最新结果'
    : '参考原图'

  const statusText = useMemo(() => {
    if (sourceLoading) {
      return '正在准备参考图，请稍候。'
    }

    if (runStatus === 'running') {
      return '正在生成新的视角结果…'
    }

    if (runStatus === 'failed') {
      return generatedPreviewUrl ? `${error}（已保留上次成功结果）` : error
    }

    if (generatedPreviewUrl) {
      return '预览已更新，点击完成会把结果插入到原图右侧。'
    }

    return '调整 X / Y / Z 后点击 RUN 预览新的机位。'
  }, [error, generatedPreviewUrl, runStatus, sourceLoading])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const updateDepthFromPointer = useCallback(
    (clientY: number, rect: DOMRect) => {
      const depthProgress = clamp((clientY - rect.top) / rect.height, 0, 1)
      const snapped = snapCameraPreviewToPreset({
        orbitX: presetMeta.orbitX,
        orbitY: presetMeta.orbitY,
        depthProgress,
      })

      onChangeView({
        ...cameraView,
        z: snapped.z,
      })
    },
    [cameraView, onChangeView, presetMeta.orbitX, presetMeta.orbitY]
  )

  const startPointerDrag = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      onMove: (clientX: number, clientY: number, rect: DOMRect) => void
    ) => {
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()

      const handleMove = (moveEvent: PointerEvent) => {
        onMove(moveEvent.clientX, moveEvent.clientY, rect)
      }

      const stop = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', stop)
        window.removeEventListener('pointercancel', stop)
      }

      onMove(event.clientX, event.clientY, rect)
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', stop)
      window.addEventListener('pointercancel', stop)
    },
    []
  )

  const handleDepthPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      startPointerDrag(event, (_clientX, clientY, rect) => {
        updateDepthFromPointer(clientY, rect)
      })
    },
    [startPointerDrag, updateDepthFromPointer]
  )

  if (!isOpen) return null

  return (
    <div className="camera-angle-overlay" role="dialog" aria-modal="true" aria-label="视角调节">
      <div className="camera-angle-shell">
        <section className="camera-angle-stage">
          <div className="camera-angle-stage__header">
            <div>
              <p className="camera-angle-stage__eyebrow">Camera Angle</p>
              <h2>视角调节</h2>
            </div>
            <span className="camera-angle-stage__size">
              {Math.max(1, Math.round(sourceWidth))} × {Math.max(1, Math.round(sourceHeight))}
            </span>
          </div>

          <div className="camera-angle-stage__viewport">
            {stageImageUrl ? (
              <img src={stageImageUrl} alt={stageLabel} />
            ) : (
              <div className="camera-angle-stage__empty">正在准备参考图…</div>
            )}

            <span className="camera-angle-stage__badge">{stageLabel}</span>

            {sourceLoading || runStatus === 'running' ? (
              <div className="camera-angle-stage__loading">
                <span className="camera-angle-spinner" aria-hidden="true" />
                <span>{sourceLoading ? '准备参考图中…' : '生成视角变化中…'}</span>
              </div>
            ) : null}
          </div>

          <div className="camera-angle-stage__filmstrip">
            <div className="camera-angle-film-card">
              <span>源图</span>
              {sourcePreviewUrl ? <img src={sourcePreviewUrl} alt="源图缩略图" /> : <div>待加载</div>}
            </div>
            <div className="camera-angle-film-card">
              <span>结果</span>
              {generatedPreviewUrl ? (
                <img src={generatedPreviewUrl} alt="生成结果缩略图" />
              ) : (
                <div>等待生成</div>
              )}
            </div>
          </div>
        </section>

        <aside className="camera-angle-panel">
          <div className="camera-angle-panel__header">
            <div>
              <p className="camera-angle-panel__eyebrow">Reference</p>
              <h3>源图设置</h3>
            </div>
            <button type="button" className="camera-angle-close" onClick={onClose} aria-label="关闭视角调节">
              ✕
            </button>
          </div>

          <div className="camera-angle-source-card">
            {sourcePreviewUrl ? <img src={sourcePreviewUrl} alt="参考图片" /> : <div>等待加载</div>}
            <div>
              <strong>当前参考图片</strong>
              <p>
                {Math.max(1, Math.round(sourceWidth))} × {Math.max(1, Math.round(sourceHeight))}
              </p>
            </div>
          </div>

          <div className="camera-angle-summary">
            <span>{presetMeta.x.label}</span>
            <span>{presetMeta.y.label}</span>
            <span>{presetMeta.z.label}</span>
          </div>

          <div className="camera-angle-axis-list">
            <div className="camera-angle-axis-card">
              <div className="camera-angle-axis-card__header">
                <strong>X</strong>
                <span>左右方位</span>
              </div>
              <div className="camera-angle-axis-row">
                {CAMERA_AXIS_X_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cameraView.x === option.value ? 'is-active' : ''}
                    onClick={() => onChangeView({ ...cameraView, x: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="camera-angle-axis-card">
              <div className="camera-angle-axis-card__header">
                <strong>Y</strong>
                <span>俯仰角</span>
              </div>
              <div className="camera-angle-axis-row">
                {CAMERA_AXIS_Y_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cameraView.y === option.value ? 'is-active' : ''}
                    onClick={() => onChangeView({ ...cameraView, y: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="camera-angle-axis-card">
              <div className="camera-angle-axis-card__header">
                <strong>Z</strong>
                <span>景别 / 距离</span>
              </div>
              <div className="camera-angle-axis-row">
                {CAMERA_AXIS_Z_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cameraView.z === option.value ? 'is-active' : ''}
                    onClick={() => onChangeView({ ...cameraView, z: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="camera-angle-gizmo-card">
            <div className="camera-angle-gizmo-card__header">
              <strong>相机预览</strong>
              <span>拖动 3D 画面或右侧滑杆</span>
            </div>

            <div className="camera-angle-gizmo">
              <div className="camera-angle-orbit-wrap">
                <CameraAngleThreePreview
                  sourcePreviewUrl={sourcePreviewUrl}
                  cameraView={cameraView}
                  onChangeView={onChangeView}
                />
              </div>

              <button
                type="button"
                className="camera-angle-depth"
                onPointerDown={handleDepthPointerDown}
                aria-label="拖动调整 Z 景别"
              >
                <span className="camera-angle-depth__label">近</span>
                <span className="camera-angle-depth__track" />
                <span
                  className="camera-angle-depth__knob"
                  style={{ top: `${presetMeta.depthProgress * 100}%` }}
                />
                <span className="camera-angle-depth__label is-bottom">远</span>
              </button>
            </div>
          </div>

          <p className={`camera-angle-status ${runStatus === 'failed' ? 'is-error' : ''}`}>{statusText}</p>

          <div className="camera-angle-actions">
            <button type="button" className="camera-angle-run" onClick={onRun} disabled={!canRun}>
              {runStatus === 'running' ? 'RUNNING…' : 'RUN'}
            </button>
            <button type="button" className="camera-angle-secondary" onClick={onClose}>
              取消
            </button>
            <button type="button" className="camera-angle-confirm" onClick={onConfirm} disabled={!canConfirm}>
              完成
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
