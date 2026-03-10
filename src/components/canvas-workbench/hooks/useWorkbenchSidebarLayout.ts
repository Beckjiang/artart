import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { SIDEBAR_WIDTH_STORAGE_KEY } from '../constants'
import { clampSidebarWidth, getInitialViewportWidth, readStoredSidebarWidth } from '../helpers'

export function useWorkbenchSidebarLayout() {
  const [viewportWidth, setViewportWidth] = useState(() => getInitialViewportWidth())
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readStoredSidebarWidth(getInitialViewportWidth())
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

  const hasDesktopSidebar = viewportWidth > 720
  const showSidebar = hasDesktopSidebar

  const persistSidebarWidth = useCallback((nextSidebarWidth: number) => {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(nextSidebarWidth))
    } catch {
      return
    }
  }, [])

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
      if (!showSidebar || event.button !== 0) return

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
    [showSidebar, stopSidebarResize, handleSidebarResizePointerMove, handleSidebarResizePointerUp]
  )

  useEffect(() => {
    return () => {
      stopSidebarResize()
    }
  }, [stopSidebarResize])

  const workbenchStyle = useMemo(
    () =>
      ({
        '--assistant-panel-width': showSidebar ? `${sidebarWidth}px` : '0px',
      }) as CSSProperties,
    [showSidebar, sidebarWidth]
  )

  return {
    viewportWidth,
    sidebarWidth,
    hasDesktopSidebar,
    showSidebar,
    workbenchStyle,
    handleSidebarResizePointerDown,
  }
}
