import { useCallback, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getCameraPresetMeta, snapCameraPreviewToPreset } from '../lib/cameraAngle'
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
  startOrbitX: number
  startOrbitY: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function CameraAngleThreePreview({
  sourcePreviewUrl,
  cameraView,
  onChangeView,
}: CameraAngleThreePreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const planeMeshRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> | null>(null)
  const cameraMarkerRef = useRef<THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> | null>(null)
  const cameraLineRef = useRef<THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> | null>(null)
  const textureRef = useRef<THREE.Texture | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const presetMeta = useMemo(() => getCameraPresetMeta(cameraView), [cameraView])

  const renderScene = useCallback(() => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current
    const planeMesh = planeMeshRef.current
    const cameraMarker = cameraMarkerRef.current
    const cameraLine = cameraLineRef.current
    if (!renderer || !scene || !camera || !planeMesh || !cameraMarker || !cameraLine) return

    const orbitRadius = 2.35 + presetMeta.z.depthProgress * 1.6
    const theta = presetMeta.x.yawDeg * (Math.PI / 180)
    const phi = THREE.MathUtils.degToRad(90 - presetMeta.y.pitchDeg)
    const radiusXZ = Math.sin(phi) * orbitRadius
    const cameraX = Math.sin(theta) * radiusXZ
    const cameraY = Math.cos(phi) * orbitRadius * 0.92 + 0.08
    const cameraZ = Math.cos(theta) * radiusXZ

    camera.position.set(cameraX, cameraY, cameraZ)
    camera.lookAt(0, 0.02, 0)
    planeMesh.rotation.y = THREE.MathUtils.degToRad(-presetMeta.x.yawDeg * 0.38)
    planeMesh.rotation.x = THREE.MathUtils.degToRad(presetMeta.y.pitchDeg * 0.16)
    planeMesh.scale.setScalar(1.02 - presetMeta.z.depthProgress * 0.16)
    cameraMarker.position.set(cameraX, cameraY, cameraZ)

    const positions = cameraLine.geometry.attributes.position.array as Float32Array
    positions[0] = cameraX
    positions[1] = cameraY
    positions[2] = cameraZ
    positions[3] = 0
    positions[4] = -0.72
    positions[5] = 0
    cameraLine.geometry.attributes.position.needsUpdate = true

    renderer.render(scene, camera)
  }, [presetMeta])

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
    scene.fog = new THREE.Fog('#f7fbff', 5.5, 12)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(0, 0, 4.8)
    cameraRef.current = camera

    const ambient = new THREE.AmbientLight('#ffffff', 1.35)
    scene.add(ambient)

    const keyLight = new THREE.DirectionalLight('#cfe5ff', 2.2)
    keyLight.position.set(2.8, 3.6, 4.8)
    scene.add(keyLight)

    const rimLight = new THREE.DirectionalLight('#ffd2e6', 1.25)
    rimLight.position.set(-3.2, 1.4, -2.2)
    scene.add(rimLight)

    const grid = new THREE.GridHelper(7, 12, '#d57cc5', '#cfdcf0')
    grid.position.y = -1.35
    ;(grid.material as THREE.Material).opacity = 0.42
    ;(grid.material as THREE.Material).transparent = true
    scene.add(grid)

    const ringGeometry = new THREE.TorusGeometry(1.95, 0.05, 16, 80)
    const ringMaterial = new THREE.MeshBasicMaterial({ color: '#e055a6', transparent: true, opacity: 0.88 })
    const orbitRing = new THREE.Mesh(ringGeometry, ringMaterial)
    orbitRing.rotation.x = Math.PI / 2
    orbitRing.position.y = -0.72
    scene.add(orbitRing)

    const planeGeometry = new THREE.PlaneGeometry(1.72, 2.28)
    const planeMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.72,
      metalness: 0.05,
      side: THREE.DoubleSide,
    })
    const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial)
    planeMesh.position.set(0, 0.08, 0)
    planeMeshRef.current = planeMesh
    scene.add(planeMesh)

    const planeOutline = new THREE.LineSegments(
      new THREE.EdgesGeometry(planeGeometry),
      new THREE.LineBasicMaterial({ color: '#ff4f9e' })
    )
    planeMesh.add(planeOutline)

    const focusSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 24, 24),
      new THREE.MeshStandardMaterial({ color: '#f5b400', emissive: '#7a5900', emissiveIntensity: 0.25 })
    )
    focusSphere.position.set(0, -0.72, 0)
    scene.add(focusSphere)

    const cameraMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 24, 24),
      new THREE.MeshStandardMaterial({ color: '#27d6c4', emissive: '#0b544f', emissiveIntensity: 0.22 })
    )
    cameraMarkerRef.current = cameraMarker
    scene.add(cameraMarker)

    const cameraLineMaterial = new THREE.LineBasicMaterial({ color: '#20c5c3' })
    const cameraLineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ])
    const cameraLine = new THREE.Line(cameraLineGeometry, cameraLineMaterial)
    cameraLineRef.current = cameraLine
    scene.add(cameraLine)

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
      textureRef.current?.dispose()
      planeMaterial.map?.dispose()
      planeMaterial.dispose()
      planeGeometry.dispose()
      ringGeometry.dispose()
      ringMaterial.dispose()
      grid.geometry.dispose()
      ;(grid.material as THREE.Material).dispose()
      focusSphere.geometry.dispose()
      ;(focusSphere.material as THREE.Material).dispose()
      cameraMarker.geometry.dispose()
      ;(cameraMarker.material as THREE.Material).dispose()
      planeOutline.geometry.dispose()
      ;(planeOutline.material as THREE.Material).dispose()
      cameraLine.geometry.dispose()
      cameraLineMaterial.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
      planeMeshRef.current = null
      cameraMarkerRef.current = null
      cameraLineRef.current = null
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
    }
  }, [renderScene])

  useEffect(() => {
    const planeMesh = planeMeshRef.current
    if (!sourcePreviewUrl || !planeMesh) return

    const loader = new THREE.TextureLoader()
    let disposed = false
    loader.load(
      sourcePreviewUrl,
      (texture) => {
        if (disposed || !planeMeshRef.current) {
          texture.dispose()
          return
        }
        texture.colorSpace = THREE.SRGBColorSpace
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        const material = planeMeshRef.current.material
        textureRef.current?.dispose()
        material.map?.dispose()
        textureRef.current = texture
        material.map = texture
        material.needsUpdate = true
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
    renderScene()
  }, [renderScene])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const host = hostRef.current
      if (!host) return

      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOrbitX: presetMeta.orbitX,
        startOrbitY: presetMeta.orbitY,
      }
      host.setPointerCapture(event.pointerId)
    },
    [presetMeta.orbitX, presetMeta.orbitY]
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current
      const host = hostRef.current
      if (!dragState || dragState.pointerId !== event.pointerId || !host) return

      const rect = host.getBoundingClientRect()
      const deltaX = (event.clientX - dragState.startX) / Math.max(1, rect.width)
      const deltaY = (event.clientY - dragState.startY) / Math.max(1, rect.height)
      const orbitX = clamp(dragState.startOrbitX + deltaX * 2.1, -1, 1)
      const orbitY = clamp(dragState.startOrbitY - deltaY * 2.1, -1, 1)
      const snapped = snapCameraPreviewToPreset({
        orbitX,
        orbitY,
        depthProgress: presetMeta.depthProgress,
      })

      onChangeView({
        ...cameraView,
        x: snapped.x,
        y: snapped.y,
      })
    },
    [cameraView, onChangeView, presetMeta.depthProgress]
  )

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const host = hostRef.current
    const dragState = dragStateRef.current
    if (host && dragState?.pointerId === event.pointerId) {
      host.releasePointerCapture(event.pointerId)
    }
    dragStateRef.current = null
  }, [])

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault()
      const depthProgress = clamp(presetMeta.depthProgress + event.deltaY * 0.0016, 0, 1)
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
    [cameraView, onChangeView, presetMeta.depthProgress, presetMeta.orbitX, presetMeta.orbitY]
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
      aria-label="Three.js 3D 相机预览"
    >
      <div className="camera-angle-three-hint">拖动调整 X/Y，滚轮调整 Z</div>
    </div>
  )
}
