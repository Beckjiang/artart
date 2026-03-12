import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendAgentMessage } from './agentChatClient'
import {
  GEMINI_API_KEY_OVERRIDE_HEADER,
  GEMINI_BASE_URL_OVERRIDE_HEADER,
} from './geminiConnection'
import { saveGeminiConnectionSettings } from './geminiConnectionSettings'

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

describe('sendAgentMessage', () => {
  it('attaches local Gemini connection overrides to the request headers', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    saveGeminiConnectionSettings({
      baseUrl: '/api/gemini',
      apiKey: 'local-key',
    })

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          session: {
            id: 'session-1',
            boardId: 'board-1',
            createdAt: '2026-03-12T00:00:00.000Z',
            updatedAt: '2026-03-12T00:00:00.000Z',
          },
          runId: 'run-1',
          acceptedMessage: {
            id: 'msg-1',
            sessionId: 'session-1',
            boardId: 'board-1',
            role: 'user',
            kind: 'text',
            text: 'hello',
            status: 'completed',
            attachments: [],
            createdAt: '2026-03-12T00:00:00.000Z',
            updatedAt: '2026-03-12T00:00:00.000Z',
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await sendAgentMessage('board-1', {
      text: 'hello',
      clientMessageId: 'client-1',
    })

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers[GEMINI_BASE_URL_OVERRIDE_HEADER]).toBe('/api/gemini')
    expect(headers[GEMINI_API_KEY_OVERRIDE_HEADER]).toBe('local-key')
  })
})
