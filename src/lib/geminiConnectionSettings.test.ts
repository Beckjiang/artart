import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearLocalGeminiApiKey,
  readGeminiConnectionSettings,
  resetGeminiConnectionSettings,
  saveGeminiConnectionSettings,
} from './geminiConnectionSettings'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()

  get length() {
    return this.data.size
  }

  clear() {
    this.data.clear()
  }

  getItem(key: string) {
    return this.data.get(key) ?? null
  }

  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.data.delete(key)
  }

  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('geminiConnectionSettings', () => {
  it('returns an empty default state when nothing is stored', () => {
    vi.stubGlobal('localStorage', new MemoryStorage())

    expect(readGeminiConnectionSettings()).toEqual({
      hasLocalApiKey: false,
    })
  })

  it('saves base url and preserves the existing key when the next submit leaves it blank', () => {
    vi.stubGlobal('localStorage', new MemoryStorage())

    const saved = saveGeminiConnectionSettings({
      baseUrl: '/api/gemini',
      apiKey: 'local-key',
    })
    const preserved = saveGeminiConnectionSettings({
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: '',
      preserveExistingApiKey: true,
    })

    expect(saved).toMatchObject({
      baseUrl: '/api/gemini',
      apiKey: 'local-key',
      hasLocalApiKey: true,
    })
    expect(preserved).toMatchObject({
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'local-key',
      hasLocalApiKey: true,
    })
  })

  it('clears the local key and can restore the default state', () => {
    vi.stubGlobal('localStorage', new MemoryStorage())

    saveGeminiConnectionSettings({
      baseUrl: '/api/gemini',
      apiKey: 'local-key',
    })

    expect(clearLocalGeminiApiKey()).toEqual({
      baseUrl: '/api/gemini',
      hasLocalApiKey: false,
    })

    expect(resetGeminiConnectionSettings()).toEqual({
      hasLocalApiKey: false,
    })
  })
})
