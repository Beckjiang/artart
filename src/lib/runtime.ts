type CanvasDesktopRuntime = {
  runtimeTarget: 'desktop'
  apiBaseUrl: string
}

declare global {
  interface Window {
    canvasDesktop?: CanvasDesktopRuntime
  }
}

const normalizeApiPath = (value: string) => (value.startsWith('/') ? value : `/${value}`)

export const isDesktopRuntime = () =>
  typeof window !== 'undefined' && window.canvasDesktop?.runtimeTarget === 'desktop'

export const getRuntimeTarget = (): 'web' | 'desktop' =>
  isDesktopRuntime() ? 'desktop' : 'web'

export const buildApiUrl = (path: string) => {
  const normalizedPath = normalizeApiPath(path)
  const apiBaseUrl =
    typeof window !== 'undefined' ? window.canvasDesktop?.apiBaseUrl?.trim() : undefined

  if (!apiBaseUrl) return normalizedPath
  return new URL(normalizedPath, apiBaseUrl).toString()
}
