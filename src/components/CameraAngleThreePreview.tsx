import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import * as THREE from 'three'
import { clampCameraView } from '../lib/cameraAngle'
import type { CameraViewDraft } from '../lib/cameraAngle'

type CameraAngleThreePreviewProps = {
  sourcePreviewUrl: string
  cameraView: CameraViewDraft
  onChangeView: (nextView: CameraViewDraft) => void
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  startYawDeg: number
  startPitchDeg: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const lerp = (from: number, to: number, alpha: number) => from + (to - from) * alpha

export function CameraAngleThreePreview({ sourcePreviewUrl, cameraView, onChangeView }: CameraAngleThreePreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const cubeRef = useRef<THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial[]> | null>(null)
  const textureRef = useRef<THREE.Texture | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const renderRafRef = useRef<number | null>(null)
  const commitRafRef = useRef<number | null>(null)
  const viewTargetRef = useRef<CameraViewDraft>(clampCameraView(cameraView))
  const viewCurrentRef = useRef<CameraViewDraft>(clampCameraView(cameraView))
  const lastCommittedRef = useRef<CameraViewDraft>(clampCameraView(cameraView))
  const pendingCommitRef = useRef<CameraViewDraft | null>(null)

  useEffect(() => {
    const next = clampCameraView(cameraView)
    viewTargetRef.current = next
    lastCommittedRef.current = next
  }, [cameraView])

  const scheduleCommit = useCallback(() => {
    pendingCommitRef.current = viewTargetRef.current
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

  const renderScene = useCallback(() => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current
    if (!renderer || !scene || !camera) return
    renderer.render(scene, camera)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    rendererRef.current = renderer
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#f7fbff')
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100)
    camera.position.set(0, 0, 4.5)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    scene.add(new THREE.AmbientLight('#ffffff', 1.2))
    const key = new THREE.DirectionalLight('#d7ebff', 1.75)
    key.position.set(2.2, 2.8, 3.4)
    scene.add(key)
    const rim = new THREE.DirectionalLight('#ffd2e6', 0.9)
    rim.position.set(-3.2, 1.1, -2.2)
    scene.add(rim)

    const geometry = new THREE.BoxGeometry(1.8, 1.8, 1.8)
    const faceMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.86,
      metalness: 0.02,
    })
    const sideMaterial = new THREE.MeshStandardMaterial({
      color: '#f3f6fb',
      roughness: 0.92,
      metalness: 0.02,
    })
    const materials: THREE.MeshStandardMaterial[] = [
      sideMaterial,
      sideMaterial,
      sideMaterial,
      sideMaterial,
      faceMaterial,
      sideMaterial,
    ]
    const cube = new THREE.Mesh(geometry, materials)
    cubeRef.current = cube
    scene.add(cube)

    const edges = new THREE.EdgesGeometry(geometry)
    const edgeMaterial = new THREE.LineBasicMaterial({ color: '#b8c6dd' })
    const cubeEdges = new THREE.LineSegments(edges, edgeMaterial)
    cube.add(cubeEdges)

    const resize = () => {
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    const observer = new ResizeObserver(() => {
      resize()
      renderScene()
    })
    observer.observe(host)

    resize()
    renderScene()

    return () => {
      observer.disconnect()
      if (renderRafRef.current !== null) {
        cancelAnimationFrame(renderRafRef.current)
        renderRafRef.current = null
      }
      if (commitRafRef.current !== null) {
        cancelAnimationFrame(commitRafRef.current)
        commitRafRef.current = null
      }

      textureRef.current?.dispose()
      faceMaterial.map?.dispose()
      geometry.dispose()
      materials.forEach((material) => material.dispose())
      edges.dispose()
      edgeMaterial.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
      cubeRef.current = null
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
    }
  }, [renderScene])

  useEffect(() => {
    const cube = cubeRef.current
    if (!sourcePreviewUrl || !cube) return

    const loader = new THREE.TextureLoader()
    let disposed = false

    loader.load(
      sourcePreviewUrl,
      (texture) => {
        if (disposed || !cubeRef.current) {
          texture.dispose()
          return
        }

        texture.colorSpace = THREE.SRGBColorSpace
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter

        const faceMaterial = cubeRef.current.material[4]
        const previousMap = faceMaterial.map
        if (previousMap && previousMap !== texture) {
          previousMap.dispose()
        }

        textureRef.current?.dispose()
        textureRef.current = texture
        faceMaterial.map = texture
        faceMaterial.needsUpdate = true
        renderScene()
      },
      undefined,
      () => {}
    )

    return () => {
      disposed = true
    }
  }, [renderScene, sourcePreviewUrl])

  useEffect(() => {
    const animate = () => {
      renderRafRef.current = requestAnimationFrame(animate)

      const cube = cubeRef.current
      const renderer = rendererRef.current
      const scene = sceneRef.current
      const camera = cameraRef.current
      if (!cube || !renderer || !scene || !camera) return

      const target = viewTargetRef.current
      const current = viewCurrentRef.current
      const alpha = 0.14

      const nextYaw = lerp(current.yawDeg, target.yawDeg, alpha)
      const nextPitch = lerp(current.pitchDeg, target.pitchDeg, alpha)
      const nextDepth = lerp(current.depthProgress, target.depthProgress, alpha)

      viewCurrentRef.current = {
        yawDeg: nextYaw,
        pitchDeg: nextPitch,
        depthProgress: nextDepth,
      }

      cube.rotation.y = THREE.MathUtils.degToRad(nextYaw)
      cube.rotation.x = THREE.MathUtils.degToRad(nextPitch)
      const scale = 1.05 - nextDepth * 0.12
      cube.scale.setScalar(scale)

      renderer.render(scene, camera)
    }

    animate()
    return () => {
      if (renderRafRef.current !== null) {
        cancelAnimationFrame(renderRafRef.current)
        renderRafRef.current = null
      }
    }
  }, [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const host = hostRef.current
      if (!host) return

      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startYawDeg: viewTargetRef.current.yawDeg,
        startPitchDeg: viewTargetRef.current.pitchDeg,
      }
      host.setPointerCapture(event.pointerId)
    },
    []
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current
      const host = hostRef.current
      if (!dragState || dragState.pointerId !== event.pointerId || !host) return

      const rect = host.getBoundingClientRect()
      const deltaX = (event.clientX - dragState.startX) / Math.max(1, rect.width)
      const deltaY = (event.clientY - dragState.startY) / Math.max(1, rect.height)

      const yawDeg = dragState.startYawDeg + deltaX * 180
      const pitchDeg = dragState.startPitchDeg - deltaY * 110
      const next = clampCameraView({
        yawDeg,
        pitchDeg,
        depthProgress: viewTargetRef.current.depthProgress,
      })

      viewTargetRef.current = next
      scheduleCommit()
    },
    [scheduleCommit]
  )

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const host = hostRef.current
    const dragState = dragStateRef.current
    if (host && dragState?.pointerId === event.pointerId) {
      host.releasePointerCapture(event.pointerId)
    }
    dragStateRef.current = null
  }, [])

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault()
      const depthProgress = clamp(viewTargetRef.current.depthProgress + event.deltaY * 0.0016, 0, 1)
      const next = clampCameraView({
        yawDeg: viewTargetRef.current.yawDeg,
        pitchDeg: viewTargetRef.current.pitchDeg,
        depthProgress,
      })
      viewTargetRef.current = next
      scheduleCommit()
    },
    [scheduleCommit]
  )

  return (
    <div
      ref={hostRef}
      className="camera-angle-three-preview"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      aria-label="Three.js 立方体视角预览"
    >
      <div className="camera-angle-three-hint">拖动旋转，滚轮缩放</div>
    </div>
  )
}

