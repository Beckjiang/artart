import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl, getRuntimeTarget, isDesktopRuntime } from './runtime'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runtime helpers', () => {
  it('defaults to web runtime when no desktop bridge exists', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:5173',
      },
    })

    expect(isDesktopRuntime()).toBe(false)
    expect(getRuntimeTarget()).toBe('web')
    expect(buildApiUrl('/api/agent/assets')).toBe('/api/agent/assets')
  })

  it('builds absolute API urls in desktop runtime', () => {
    vi.stubGlobal('window', {
      canvasDesktop: {
        runtimeTarget: 'desktop',
        apiBaseUrl: 'http://127.0.0.1:45123',
      },
      location: {
        origin: 'http://127.0.0.1:45123',
      },
    })

    expect(isDesktopRuntime()).toBe(true)
    expect(getRuntimeTarget()).toBe('desktop')
    expect(buildApiUrl('/api/gemini')).toBe('http://127.0.0.1:45123/api/gemini')
  })
})
