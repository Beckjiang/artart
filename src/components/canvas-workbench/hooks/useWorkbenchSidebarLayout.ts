import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { SIDEBAR_OPEN_STORAGE_KEY, SIDEBAR_WIDTH_STORAGE_KEY } from '../constants'
import {
  clampSidebarWidth,
  getInitialViewportWidth,
  readStoredSidebarOpenPreference,
  readStoredSidebarWidth,
} from '../helpers'

const COMPACT_WORKBENCH_BREAKPOINT = 900

export function useWorkbenchSidebarLayout() {
  const [viewportWidth, setViewportWidth] = useState(() => getInitialViewportWidth())
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readStoredSidebarWidth(getInitialViewportWidth())
  )
  const [sidebarOpenPreference, setSidebarOpenPreference] = useState<boolean | null>(() =>
    readStoredSidebarOpenPreference()
  )

  const sidebarWidthRef = useRef(sidebarWidth)
  const sidebarResizeStateRef = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleResize = () => {
      const nextViewportWidth = window.innerWidth
      setViewportWidth(nextViewportWidth)
      setSidebarWidth((currentWidth) => clampSidebarWidth(currentWidth, nextViewportWidth))
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const isCompactWorkbench = viewportWidth <= COMPACT_WORKBENCH_BREAKPOINT
  const sidebarPresentation = isCompactWorkbench ? ('overlay' as const) : ('docked' as const)
  const defaultSidebarOpen = !isCompactWorkbench
  const isSidebarOpen = sidebarOpenPreference ?? defaultSidebarOpen
  const hasDockedSidebar = sidebarPresentation === 'docked'
  const showDockedSidebar = hasDockedSidebar && isSidebarOpen

  const persistSidebarWidth = useCallback((nextSidebarWidth: number) => {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(nextSidebarWidth))
    } catch {
      return
    }
  }, [])

  const persistSidebarOpen = useCallback((nextValue: boolean) => {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, nextValue ? '1' : '0')
    } catch {
      return
    }
  }, [])

  const openSidebar = useCallback(() => {
    setSidebarOpenPreference(true)
    persistSidebarOpen(true)
  }, [persistSidebarOpen])

  const closeSidebar = useCallback(() => {
    setSidebarOpenPreference(false)
    persistSidebarOpen(false)
  }, [persistSidebarOpen])

  const toggleSidebar = useCallback(() => {
    const nextValue = !(sidebarOpenPreference ?? defaultSidebarOpen)
    setSidebarOpenPreference(nextValue)
    persistSidebarOpen(nextValue)
  }, [defaultSidebarOpen, persistSidebarOpen, sidebarOpenPreference])

  const handleSidebarResizePointerMove = useCallback((event: PointerEvent) => {
    const resizeState = sidebarResizeStateRef.current
    if (!resizeState || event.pointerId !== resizeState.pointerId) return

    event.preventDefault()
    const deltaX = event.clientX - resizeState.startX
    const nextSidebarWidth = clampSidebarWidth(resizeState.startWidth - deltaX, window.innerWidth)
    setSidebarWidth(nextSidebarWidth)
  }, [])

  const handleSidebarResizePointerUp = useCallback(
    function handleSidebarResizePointerUp(event: PointerEvent) {
      const resizeState = sidebarResizeStateRef.current
      if (!resizeState || event.pointerId !== resizeState.pointerId) return

      persistSidebarWidth(sidebarWidthRef.current)
      sidebarResizeStateRef.current = null
      document.body.classList.remove('is-resizing-workbench-sidebar')
      window.removeEventListener('pointermove', handleSidebarResizePointerMove)
      window.removeEventListener('pointerup', handleSidebarResizePointerUp)
      window.removeEventListener('pointercancel', handleSidebarResizePointerUp)
    },
    [handleSidebarResizePointerMove, persistSidebarWidth]
  )

  const stopSidebarResize = useCallback(() => {
    sidebarResizeStateRef.current = null
    document.body.classList.remove('is-resizing-workbench-sidebar')
    window.removeEventListener('pointermove', handleSidebarResizePointerMove)
    window.removeEventListener('pointerup', handleSidebarResizePointerUp)
    window.removeEventListener('pointercancel', handleSidebarResizePointerUp)
  }, [handleSidebarResizePointerMove, handleSidebarResizePointerUp])

  const handleSidebarResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!showDockedSidebar || event.button !== 0) return

      stopSidebarResize()
      sidebarResizeStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: sidebarWidthRef.current,
      }

      document.body.classList.add('is-resizing-workbench-sidebar')
      window.addEventListener('pointermove', handleSidebarResizePointerMove)
      window.addEventListener('pointerup', handleSidebarResizePointerUp)
      window.addEventListener('pointercancel', handleSidebarResizePointerUp)
      event.preventDefault()
    },
    [showDockedSidebar, stopSidebarResize, handleSidebarResizePointerMove, handleSidebarResizePointerUp]
  )

  useEffect(() => {
    return () => {
      stopSidebarResize()
    }
  }, [stopSidebarResize])

  const workbenchStyle = useMemo(
    () =>
      ({
        '--assistant-panel-width': showDockedSidebar ? `${sidebarWidth}px` : '0px',
      }) as CSSProperties,
    [showDockedSidebar, sidebarWidth]
  )

  return {
    viewportWidth,
    sidebarWidth,
    isCompactWorkbench,
    sidebarPresentation,
    hasDockedSidebar,
    isSidebarOpen,
    openSidebar,
    closeSidebar,
    toggleSidebar,
    workbenchStyle,
    handleSidebarResizePointerDown,
  }
}
