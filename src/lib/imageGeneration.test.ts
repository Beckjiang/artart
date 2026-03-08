import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildGeminiGenerateContentEndpoint,
  buildGeminiGenerateContentRequest,
  buildNetworkErrorMessage,
  ensureGeminiApiBaseUrl,
  generateImageFromPrompt,
  getGeminiRequestStyleOrder,
  readGeminiResponse,
  resolveGeminiConfig,
} from './imageGeneration'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('resolveGeminiConfig', () => {
  it('supports a bare custom domain and appends /v1beta', () => {
    const config = resolveGeminiConfig(
      {
        VITE_GEMINI_API_KEY: 'test-key',
        VITE_GEMINI_BASE_URL: 'http://zx2.52youxi.cc:3000',
      },
      true
    )

    expect(config.baseUrl).toBe('http://zx2.52youxi.cc:3000/v1beta')
    expect(config.apiKey).toBe('test-key')
  })

  it('maps the legacy uniapi proxy to the gemini proxy', () => {
    const config = resolveGeminiConfig(
      {
        VITE_UNIAPI_API_KEY: 'legacy-key',
        VITE_UNIAPI_BASE_URL: '/api/uniapi',
      },
      true
    )

    expect(config.baseUrl).toBe('/api/gemini')
    expect(config.apiKey).toBe('legacy-key')
  })

  it('falls back to supported defaults when env model or size is unsupported', () => {
    const config = resolveGeminiConfig(
      {
        VITE_GEMINI_API_KEY: 'test-key',
        VITE_GEMINI_IMAGE_MODEL: 'custom-image-model',
        VITE_GEMINI_IMAGE_SIZE: '8K',
      },
      true
    )

    expect(config.imageModel).toBe('gemini-3.1-flash-image-preview')
    expect(config.imageSize).toBe('2K')
  })
})

describe('gemini request construction', () => {
  it('uses generateContent for image editing too', () => {
    const endpoint = buildGeminiGenerateContentEndpoint(
      'http://zx2.52youxi.cc:3000',
      'gemini-3.1-flash-image-preview'
    )
    const request = buildGeminiGenerateContentRequest({
      prompt: '把背景换成白色',
      aspectRatio: '1:1',
      imageSize: '2K',
      style: 'camel',
      referenceParts: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: 'Zm9v',
          },
        },
      ],
    })

    expect(endpoint).toBe(
      'http://zx2.52youxi.cc:3000/v1beta/models/gemini-3.1-flash-image-preview:generateContent'
    )
    expect(request.contents[0].parts).toEqual([
      { text: '把背景换成白色' },
      {
        inlineData: {
          mimeType: 'image/png',
          data: 'Zm9v',
        },
      },
    ])
  })

  it('supports snake_case fallback payloads', () => {
    const request = buildGeminiGenerateContentRequest({
      prompt: 'generate',
      aspectRatio: '16:9',
      imageSize: '2K',
      style: 'snake',
      referenceParts: [],
    })

    expect(request).toMatchObject({
      generation_config: {
        response_modalities: ['TEXT', 'IMAGE'],
        image_config: {
          aspect_ratio: '16:9',
          image_size: '2K',
        },
      },
    })
  })

  it('sends only text prompt and aspect ratio when no reference image is provided', () => {
    const request = buildGeminiGenerateContentRequest({
      prompt: '生成一张极简风海报',
      aspectRatio: '4:3',
      imageSize: '2K',
      style: 'camel',
      referenceParts: [],
    })

    expect(request.contents[0].parts).toEqual([{ text: '生成一张极简风海报' }])
    expect(request).toMatchObject({
      generationConfig: {
        imageConfig: {
          aspectRatio: '4:3',
          imageSize: '2K',
        },
      },
    })
  })
})


describe('request style selection', () => {
  it('uses camelCase for custom gateways to match the relay doc', () => {
    expect(getGeminiRequestStyleOrder('http://zx2.52youxi.cc:3000/v1beta')).toEqual(['camel'])
  })

  it('uses camelCase for official Gemini endpoints', () => {
    expect(getGeminiRequestStyleOrder('https://generativelanguage.googleapis.com/v1beta')).toEqual([
      'camel',
    ])
  })
})

describe('network diagnostics', () => {
  it('explains proxy timeout errors clearly', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:5173',
        protocol: 'http:',
      },
    })

    const message = buildNetworkErrorMessage(
      '/api/gemini/models/gemini-3.1-flash-image-preview:generateContent',
      new TypeError('Failed to fetch')
    )

    expect(message).toContain('当前请求仍在走 Vite 代理 `/api/gemini`')
    expect(message).toContain('需要重启 `npm run dev`')
    expect(message).toContain('ETIMEDOUT')
  })

  it('explains html responses from a misconfigured base url', async () => {
    const response = new Response('<!doctype html><html><body>home</body></html>', {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })

    await expect(readGeminiResponse(response)).rejects.toThrow('接口返回了 HTML 页面而不是 JSON')
  })
})

describe('generateImageFromPrompt', () => {
  it('uses env-configured image options when request overrides are absent', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key')
    vi.stubEnv('VITE_GEMINI_BASE_URL', 'http://zx2.52youxi.cc:3000')
    vi.stubEnv('VITE_GEMINI_IMAGE_MODEL', 'gemini-3-pro-image-preview')
    vi.stubEnv('VITE_GEMINI_IMAGE_SIZE', '1K')

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
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
    )

    vi.stubGlobal('fetch', fetchMock)

    await generateImageFromPrompt({
      prompt: '生成一只猫',
      width: 1024,
      height: 1024,
    })

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/models/gemini-3-pro-image-preview:generateContent'
    )
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(requestBody.generationConfig.imageConfig.imageSize).toBe('1K')
  })

  it('prefers per-request image options over env defaults', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key')
    vi.stubEnv('VITE_GEMINI_BASE_URL', 'http://zx2.52youxi.cc:3000')
    vi.stubEnv('VITE_GEMINI_IMAGE_MODEL', 'gemini-3.1-flash-image-preview')
    vi.stubEnv('VITE_GEMINI_IMAGE_SIZE', '2K')

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
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
    )

    vi.stubGlobal('fetch', fetchMock)

    await generateImageFromPrompt({
      prompt: '生成一只猫',
      width: 1024,
      height: 1024,
      imageModel: 'gemini-3-pro-image-preview',
      imageSize: '4K',
    })

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/models/gemini-3-pro-image-preview:generateContent'
    )
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(requestBody.generationConfig.imageConfig.imageSize).toBe('4K')
  })

  it('uses camelCase body and Bearer auth for custom gateways', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key')
    vi.stubEnv('VITE_GEMINI_BASE_URL', 'http://zx2.52youxi.cc:3000')

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
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
    )

    vi.stubGlobal('fetch', fetchMock)

    const result = await generateImageFromPrompt({
      prompt: '生成一只猫',
      width: 1024,
      height: 1024,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    })
    expect(firstBody.generationConfig).toBeTruthy()
    expect(firstBody.generation_config).toBeFalsy()
    expect(result).toMatchObject({
      route: 'gemini-generate-content',
      mimeType: 'image/png',
      imageUrl: 'data:image/png;base64,Zm9v',
    })
  })

  it('uses camelCase body and api-key auth for the official Gemini endpoint', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key')
    vi.stubEnv('VITE_GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com')

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
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
    )

    vi.stubGlobal('fetch', fetchMock)

    await generateImageFromPrompt({
      prompt: '生成一只猫',
      width: 1024,
      height: 1024,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-goog-api-key': 'test-key',
      'Content-Type': 'application/json',
    })
    expect(firstBody.generationConfig).toBeTruthy()
    expect(firstBody.generation_config).toBeFalsy()
  })

  it('surfaces a clear message when the gateway does not support image editing', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key')
    vi.stubEnv('VITE_GEMINI_BASE_URL', 'http://zx2.52youxi.cc:3000')

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'task failed :图生图服务调用失败!',
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
    vi.stubGlobal(
      'FileReader',
      class {
        result = 'data:image/png;base64,Zm9v'
        onerror: null | (() => void) = null
        onload: null | (() => void) = null
        readAsDataURL() {
          this.onload?.()
        }
      }
    )

    await expect(
      generateImageFromPrompt({
        prompt: '编辑一下图片',
        width: 256,
        height: 256,
        referenceImageUrl: 'data:image/png;base64,Zm9v',
      })
    ).rejects.toThrow('当前 Gemini 网关返回“图生图服务调用失败”')
  })

  it('sends multiple reference images through generateContent without a mask field', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key')
    vi.stubEnv('VITE_GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com')

    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = String(input)

      if (url.startsWith('data:image/')) {
        return Promise.resolve(
          new Response(new Uint8Array([137, 80, 78, 71]), {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
            },
          })
        )
      }

      return Promise.resolve(
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
      )
    })

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal(
      'FileReader',
      class {
        result = 'data:image/png;base64,Zm9v'
        onerror: null | (() => void) = null
        onload: null | (() => void) = null
        readAsDataURL() {
          this.onload?.()
        }
      }
    )

    await generateImageFromPrompt({
      prompt: '只修改高亮区域',
      width: 512,
      height: 512,
      referenceImageUrls: ['data:image/png;base64,Zm9v', 'data:image/png;base64,YmFy'],
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)

    const requestBody = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))
    expect(requestBody.contents[0].parts).toHaveLength(3)
    expect(requestBody.contents[0].parts[1].inlineData).toBeTruthy()
    expect(requestBody.contents[0].parts[2].inlineData).toBeTruthy()
    expect(requestBody.mask).toBeUndefined()
  })
})

describe('ensureGeminiApiBaseUrl', () => {
  it('keeps existing versioned paths intact', () => {
    expect(ensureGeminiApiBaseUrl('http://zx2.52youxi.cc:3000/v1beta')).toBe(
      'http://zx2.52youxi.cc:3000/v1beta'
    )
  })
})
