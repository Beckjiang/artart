import { useCallback, useEffect, useMemo } from 'react'
import { CameraAngleOrbitPreview } from './CameraAngleOrbitPreview'
import { CameraAngleThreePreview } from './CameraAngleThreePreview'
import {
  DEFAULT_CAMERA_VIEW,
  getNearestPresets,
} from '../lib/cameraAngle'
import type { CameraRunState, CameraViewDraft, MultiAngleMode } from '../lib/cameraAngle'

type CameraAngleDialogProps = {
  isOpen: boolean
  sourcePreviewUrl: string
  sourceLoading: boolean
  cameraView: CameraViewDraft
  mode: MultiAngleMode
  runStatus: CameraRunState
  error: string
  onChangeView: (nextView: CameraViewDraft) => void
  onChangeMode: (nextMode: MultiAngleMode) => void
  onReset: () => void
  onApply: () => void
  onClose: () => void
  canApply: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function CameraAngleDialog({
  isOpen,
  sourcePreviewUrl,
  sourceLoading,
  cameraView,
  mode,
  runStatus,
  error,
  onChangeView,
  onChangeMode,
  onReset,
  onApply,
  onClose,
  canApply,
}: CameraAngleDialogProps) {
  const meta = useMemo(() => getNearestPresets(cameraView), [cameraView])

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

  const handleRangeChange = useCallback(
    (
      key: keyof CameraViewDraft,
      value: number,
      normalize?: (value: number) => number
    ) => {
      const nextValue = normalize ? normalize(value) : value
      onChangeView({
        ...cameraView,
        [key]: nextValue,
      })
    },
    [cameraView, onChangeView]
  )

  const handleReset = useCallback(() => {
    onChangeView(DEFAULT_CAMERA_VIEW)
    onReset()
  }, [onChangeView, onReset])

  if (!isOpen) return null

  const statusText =
    runStatus === 'running'
      ? '生成中…'
      : runStatus === 'failed'
        ? error || '生成失败，请重试'
        : ''

  return (
    <div className="multi-angle-panel" role="dialog" aria-modal="false" aria-label="多角度">
      <header className="multi-angle-header">
        <div>
          <h3 className="multi-angle-title">多角度</h3>
        </div>
        <button
          type="button"
          className="multi-angle-reset"
          onClick={handleReset}
          aria-label="重置"
          title="重置"
        >
          ↻
        </button>
      </header>

      <div className="multi-angle-tabs" role="tablist" aria-label="多角度模式">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'subject'}
          className={mode === 'subject' ? 'is-active' : ''}
          onClick={() => onChangeMode('subject')}
        >
          主体
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'camera'}
          className={mode === 'camera' ? 'is-active' : ''}
          onClick={() => onChangeMode('camera')}
        >
          摄像头
        </button>
      </div>

      <div className="multi-angle-cube">
        {mode === 'subject' ? (
          <CameraAngleThreePreview
            sourcePreviewUrl={sourcePreviewUrl}
            cameraView={cameraView}
            onChangeView={onChangeView}
          />
        ) : (
          <CameraAngleOrbitPreview
            sourcePreviewUrl={sourcePreviewUrl}
            cameraView={cameraView}
            onChangeView={onChangeView}
          />
        )}

        {sourceLoading ? <div className="multi-angle-loading">准备参考图中…</div> : null}
      </div>

      <div className="multi-angle-sliders">
        <label className="multi-angle-slider">
          <div className="multi-angle-slider__row">
            <span>旋转</span>
            <span className="multi-angle-slider__value">{Math.round(cameraView.yawDeg)}</span>
          </div>
          <input
            type="range"
            min={-90}
            max={90}
            step={1}
            value={cameraView.yawDeg}
            onChange={(event) =>
              handleRangeChange('yawDeg', Number(event.target.value), (v) => clamp(v, -90, 90))
            }
          />
        </label>

        <label className="multi-angle-slider">
          <div className="multi-angle-slider__row">
            <span>倾斜</span>
            <span className="multi-angle-slider__value">{Math.round(cameraView.pitchDeg)}</span>
          </div>
          <input
            type="range"
            min={-55}
            max={55}
            step={1}
            value={cameraView.pitchDeg}
            onChange={(event) =>
              handleRangeChange('pitchDeg', Number(event.target.value), (v) => clamp(v, -55, 55))
            }
          />
        </label>

        <label className="multi-angle-slider">
          <div className="multi-angle-slider__row">
            <span>缩放</span>
            <span className="multi-angle-slider__value">{meta.z.label}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={cameraView.depthProgress}
            onChange={(event) =>
              handleRangeChange('depthProgress', Number(event.target.value), (v) => clamp(v, 0, 1))
            }
          />
        </label>
      </div>

      {statusText ? (
        <p className={`multi-angle-status ${runStatus === 'failed' ? 'is-error' : ''}`}>{statusText}</p>
      ) : null}

      <footer className="multi-angle-actions">
        <button type="button" className="multi-angle-secondary" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="multi-angle-primary"
          onClick={onApply}
          disabled={!canApply}
        >
          {runStatus === 'running' ? '生成中…' : '立即使用'}
        </button>
      </footer>
    </div>
  )
}
