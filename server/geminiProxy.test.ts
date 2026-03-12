import { afterEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createGeminiProxyHandler } from './geminiProxy'

type MockResponse = ServerResponse & {
  body?: string
  headers: Record<string, string>
}

const createMockResponse = (): MockResponse => {
  const response = {} as MockResponse
  response.body = undefined
  response.statusCode = 200
  response.headers = {}
  response.setHeader = function (key: string, value: string | number | readonly string[]) {
    this.headers[key] = Array.isArray(value) ? value.join(', ') : String(value)
    return this
  }
  response.end = function (chunk?: unknown) {
    this.body =
      typeof chunk === 'string'
        ? chunk
        : chunk instanceof Buffer
          ? chunk.toString('utf8')
          : undefined
    Object.defineProperty(this, 'writableEnded', {
      value: true,
      writable: true,
      configurable: true,
    })
    return this
  }

  Object.defineProperty(response, 'writableEnded', {
    value: false,
    writable: true,
    configurable: true,
  })

  return response
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.VITE_GEMINI_API_KEY
  delete process.env.VITE_GEMINI_BASE_URL
})

describe('createGeminiProxyHandler', () => {
  it('prefers request-scoped override headers and does not forward private override headers upstream', async () => {
    process.env.VITE_GEMINI_API_KEY = 'env-key'
    process.env.VITE_GEMINI_BASE_URL = 'https://env.example'

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('{}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const handler = createGeminiProxyHandler()
    const request = Object.assign(Readable.from([Buffer.from('{}')]), {
      method: 'POST',
      url: '/api/gemini/models/test-model:generateContent',
      headers: {
        'x-canvas-gemini-base-url': 'https://override.example',
        'x-canvas-gemini-api-key': 'local-key',
      },
    }) as unknown as IncomingMessage
    const response = createMockResponse()

    await handler(request, response, vi.fn())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://override.example/v1beta/models/test-model:generateContent'
    )
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer local-key',
      'Content-Type': 'application/json',
    })
    expect(
      (fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)['x-canvas-gemini-api-key']
    ).toBeUndefined()
  })
})
