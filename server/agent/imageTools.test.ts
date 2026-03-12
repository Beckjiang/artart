import { afterEach, describe, expect, it, vi } from 'vitest'
import { runImageToImageTool, runTextToImageTool } from './imageTools'

afterEach(() => {
  vi.unstubAllGlobals()

  delete process.env.VITE_GEMINI_API_KEY
  delete process.env.VITE_GEMINI_BASE_URL
  delete process.env.VITE_GEMINI_IMAGE_MODEL
  delete process.env.VITE_GEMINI_IMAGE_SIZE
})

const mockOkResponse = () =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                inline_data: {
                  mime_type: 'image/png',
                  data: 'Zm9v',
                },
              },
            ],
          },
        },
      ],
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )

describe('imageTools gemini headers', () => {
  it('uses Bearer auth for custom gateways', async () => {
    process.env.VITE_GEMINI_API_KEY = 'test-key'
    process.env.VITE_GEMINI_BASE_URL = 'http://zx2.52youxi.cc:3000'
    process.env.VITE_GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview'
    process.env.VITE_GEMINI_IMAGE_SIZE = '1K'

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(mockOkResponse())
    vi.stubGlobal('fetch', fetchMock)

    await runTextToImageTool({
      prompt: 'draw a cat',
    })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    })
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBeUndefined()
  })

  it('uses x-goog-api-key for official Gemini endpoints', async () => {
    process.env.VITE_GEMINI_API_KEY = 'test-key'
    process.env.VITE_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com'
    process.env.VITE_GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview'
    process.env.VITE_GEMINI_IMAGE_SIZE = '1K'

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(mockOkResponse())
    vi.stubGlobal('fetch', fetchMock)

    await runTextToImageTool({
      prompt: 'draw a cat',
    })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.headers).toMatchObject({
      'x-goog-api-key': 'test-key',
      'Content-Type': 'application/json',
    })
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('prefers request-scoped overrides over env defaults', async () => {
    process.env.VITE_GEMINI_API_KEY = 'env-key'
    process.env.VITE_GEMINI_BASE_URL = 'http://zx2.52youxi.cc:3000'
    process.env.VITE_GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview'
    process.env.VITE_GEMINI_IMAGE_SIZE = '1K'

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(mockOkResponse())
    vi.stubGlobal('fetch', fetchMock)

    await runTextToImageTool({
      prompt: 'draw a cat',
      geminiConnectionOverride: {
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'local-key',
      },
    })

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent'
    )
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.headers).toMatchObject({
      'x-goog-api-key': 'local-key',
      'Content-Type': 'application/json',
    })
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('treats /api/gemini as an official proxy', async () => {
    process.env.VITE_GEMINI_API_KEY = 'test-key'
    process.env.VITE_GEMINI_BASE_URL = '/api/gemini'
    process.env.VITE_GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview'
    process.env.VITE_GEMINI_IMAGE_SIZE = '1K'

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(mockOkResponse())
    vi.stubGlobal('fetch', fetchMock)

    await runTextToImageTool({
      prompt: 'draw a cat',
    })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.headers).toMatchObject({
      'x-goog-api-key': 'test-key',
      'Content-Type': 'application/json',
    })
  })
})

describe('imageTools image-to-image errors', () => {
  it('surfaces a helpful message when image editing is unsupported', async () => {
    process.env.VITE_GEMINI_API_KEY = 'test-key'
    process.env.VITE_GEMINI_BASE_URL = 'http://zx2.52youxi.cc:3000'
    process.env.VITE_GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview'
    process.env.VITE_GEMINI_IMAGE_SIZE = '1K'

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: 'task failed :\u56fe\u751f\u56fe\u670d\u52a1\u8c03\u7528\u5931\u8d25!',
            type: 'upstream_error',
            code: 500,
          },
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const promise = runImageToImageTool({
      prompt: 'edit this image',
      referenceDataUrls: ['data:image/png;base64,Zm9v'],
    })

    await expect(promise).rejects.toThrow('reference-image editing')
    await expect(promise).rejects.toThrow('endpoint=')
  })
})
