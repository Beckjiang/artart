import { readGeminiConnectionOverrideFromHeaders } from '../src/lib/geminiConnection'
import { buildGeminiRequestHeaders, resolveServerGeminiConnection } from './geminiConfig'
import { readRequestBody, sendJson, type NextHandleFunction } from './httpUtils'

const PROXY_PREFIXES = ['/api/gemini', '/api/uniapi']
const RESPONSE_HEADER_BLOCKLIST = new Set(['connection', 'content-length', 'transfer-encoding'])

const matchProxyPrefix = (pathname: string) =>
  PROXY_PREFIXES.find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ?? null

const forwardHeaders = (response: Response, res: import('node:http').ServerResponse) => {
  response.headers.forEach((value, key) => {
    if (RESPONSE_HEADER_BLOCKLIST.has(key.toLowerCase())) return
    res.setHeader(key, value)
  })
}

export const createGeminiProxyHandler = (): NextHandleFunction => {
  return async (req, res, next) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost')
    const matchedPrefix = matchProxyPrefix(requestUrl.pathname)

    if (!matchedPrefix) {
      await next()
      return
    }

    const connectionOverride = readGeminiConnectionOverrideFromHeaders(
      req.headers as Record<string, unknown>
    )
    const { apiKey, baseUrl } = resolveServerGeminiConnection(connectionOverride)

    if (!apiKey) {
      sendJson(res, 500, {
        error:
          '未配置 Gemini API key。请设置 `VITE_GEMINI_API_KEY` / `GEMINI_API_KEY`，或在桌面版 `config.json` 中提供。',
      })
      return
    }
    const upstreamPath = requestUrl.pathname.slice(matchedPrefix.length)
    const endpoint = `${baseUrl}${upstreamPath || ''}${requestUrl.search}`

    try {
      const requestHeaders = buildGeminiRequestHeaders(baseUrl, apiKey)
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readRequestBody(req)
      const response = await fetch(endpoint, {
        method: req.method,
        headers: requestHeaders,
        body,
      })

      res.statusCode = response.status
      forwardHeaders(response, res)
      const arrayBuffer = await response.arrayBuffer()
      res.end(Buffer.from(arrayBuffer))
    } catch (error) {
      sendJson(res, 502, {
        error: error instanceof Error ? error.message : 'gemini_proxy_failed',
      })
    }
  }
}
