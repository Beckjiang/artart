import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  CAMERA_AXIS_Z_OPTIONS,
  clampCameraView,
  DEFAULT_CAMERA_VIEW,
} from '../lib/cameraAngle'
import type { CameraViewDraft } from '../lib/cameraAngle'

type CameraAngleOrbitPreviewProps = {
  sourcePreviewUrl: string
  cameraView: CameraViewDraft
  onChangeView: (nextView: CameraViewDraft) => void
}

type DragState = {
  pointerId: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const lerp = (from: number, to: number, alpha: number) => from + (to - from) * alpha

const depthProgressToDistanceScale = (depthProgress: number) => {
  const progress = clamp(depthProgress, 0, 1)

  const options = CAMERA_AXIS_Z_OPTIONS
  if (options.length === 0) return 1
  if (progress <= options[0].depthProgress) return options[0].distanceScale

  for (let index = 1; index < options.length; index += 1) {
    const next = options[index]
    const previous = options[index - 1]
    if (progress <= next.depthProgress) {
      const span = Math.max(1e-6, next.depthProgress - previous.depthProgress)
      const alpha = (progress - previous.depthProgress) / span
      return lerp(previous.distanceScale, next.distanceScale, alpha)
    }
  }

  return options[options.length - 1].distanceScale
}

const mapPointerToCameraView = (
  rect: DOMRect,
  clientX: number,
  clientY: number,
  previousYawDeg: number,
  depthProgress: number
) => {
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const radius = Math.max(1, Math.min(rect.width, rect.height) / 2)

  let nx = (clientX - centerX) / radius
  let ny = -(clientY - centerY) / radius
  const len = Math.hypot(nx, ny)

  if (len > 1) {
    nx /= len
    ny /= len
  }

  const pitchDegRaw = clamp(ny * 55, -55, 55)
  const ratio = pitchDegRaw / 55
  const xLimit = Math.sqrt(Math.max(0, 1 - ratio * ratio))

  const yawDegRaw = xLimit < 1e-3 ? previousYawDeg : clamp((nx / xLimit) * 90, -90, 90)

  return clampCameraView({
    yawDeg: yawDegRaw,
    pitchDeg: pitchDegRaw,
    depthProgress,
  })
}

export function CameraAngleOrbitPreview({ sourcePreviewUrl, cameraView, onChangeView }: CameraAngleOrbitPreviewProps) {
  const orbitRef = useRef<HTMLDivElement>(null)
  const cameraHandleRef = useRef<HTMLButtonElement>(null)
  const commitRafRef = useRef<number | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const pendingCommitRef = useRef<CameraViewDraft | null>(null)
  const lastCommittedRef = useRef<CameraViewDraft>(clampCameraView(cameraView))

  const [draftView, setDraftView] = useState(() => clampCameraView(cameraView))

  useEffect(() => {
    const next = clampCameraView(cameraView)
    lastCommittedRef.current = next
    if (!dragStateRef.current) {
      setDraftView(next)
    }
  }, [cameraView])

  useEffect(() => {
    return () => {
      if (commitRafRef.current !== null) {
        cancelAnimationFrame(commitRafRef.current)
        commitRafRef.current = null
      }
    }
  }, [])

  const scheduleCommit = useCallback(() => {
    if (commitRafRef.current !== null) return

    commitRafRef.current = requestAnimationFrame(() => {
      commitRafRef.current = null
      const next = pendingCommitRef.current
      pendingCommitRef.current = null
      if (!next) return

      const last = lastCommittedRef.current
      if (
        last.yawDeg === next.yawDeg &&
        last.pitchDeg === next.pitchDeg &&
        last.depthProgress === next.depthProgress
      ) {
        return
      }

      lastCommittedRef.current = next
      onChangeView(next)
    })
  }, [onChangeView])

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const orbit = orbitRef.current
      if (!orbit) return

      const rect = orbit.getBoundingClientRect()
      const next = mapPointerToCameraView(
        rect,
        clientX,
        clientY,
        pendingCommitRef.current?.yawDeg ?? draftView.yawDeg,
        draftView.depthProgress
      )

      pendingCommitRef.current = next
      setDraftView(next)
      scheduleCommit()
    },
    [draftView.depthProgress, draftView.yawDeg, scheduleCommit]
  )

  const handleCameraPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      const handle = cameraHandleRef.current
      if (!handle) return

      dragStateRef.current = { pointerId: event.pointerId }
      handle.setPointerCapture(event.pointerId)
      updateFromPointer(event.clientX, event.clientY)
    },
    [updateFromPointer]
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) return
      event.preventDefault()
      updateFromPointer(event.clientX, event.clientY)
    },
    [updateFromPointer]
  )

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    const handle = cameraHandleRef.current
    if (dragState && dragState.pointerId === event.pointerId && handle) {
      handle.releasePointerCapture(event.pointerId)
    }

    dragStateRef.current = null
  }, [])

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    // Zoom is controlled only via the slider.
    event.preventDefault()
  }, [])

  const cameraPosition = useMemo(() => {
    const ny = clamp(draftView.pitchDeg / 55, -1, 1)
    const xLimit = Math.sqrt(Math.max(0, 1 - ny * ny))
    const nx = clamp(draftView.yawDeg / 90, -1, 1) * xLimit
    return { nx, ny }
  }, [draftView.pitchDeg, draftView.yawDeg])

  const photoScale = useMemo(() => {
    const distanceScale = depthProgressToDistanceScale(draftView.depthProgress || DEFAULT_CAMERA_VIEW.depthProgress)
    return 1 / Math.max(1e-6, distanceScale)
  }, [draftView.depthProgress])

  return (
    <div
      className="camera-angle-orbit-preview"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      aria-label="摄像头绕拍预览"
    >
      <div className="camera-angle-orbit-disk" ref={orbitRef} aria-hidden="true">
        <svg className="camera-angle-orbit-grid" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="92" />
          <ellipse cx="100" cy="100" rx="92" ry="60" />
          <ellipse cx="100" cy="100" rx="92" ry="34" />
          <ellipse cx="100" cy="100" rx="60" ry="92" />
          <ellipse cx="100" cy="100" rx="34" ry="92" />
          <ellipse cx="100" cy="100" rx="92" ry="60" transform="rotate(45 100 100)" />
          <ellipse cx="100" cy="100" rx="92" ry="60" transform="rotate(-45 100 100)" />
        </svg>

        <div
          className="camera-angle-orbit-photo"
          style={{ transform: `translate(-50%, -50%) scale(${photoScale.toFixed(3)})` }}
        >
          {sourcePreviewUrl ? <img src={sourcePreviewUrl} alt="" draggable={false} /> : null}
        </div>

        <button
          ref={cameraHandleRef}
          type="button"
          className="camera-angle-orbit-camera"
          style={{
            ['--camera-x' as string]: `${cameraPosition.nx * 92}px`,
            ['--camera-y' as string]: `${-cameraPosition.ny * 92}px`,
          }}
          onPointerDown={handleCameraPointerDown}
          aria-label="拖动摄像头移动"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 7L10.2 5.6C10.5 5.2 11 5 11.5 5H12.5C13 5 13.5 5.2 13.8 5.6L15 7" />
            <rect x="4.8" y="7" width="14.4" height="11" rx="2.4" />
            <circle cx="12" cy="12.5" r="2.6" />
          </svg>
        </button>

        <div className="camera-angle-three-hint">拖动摄像头移动</div>
      </div>
    </div>
  )
}

