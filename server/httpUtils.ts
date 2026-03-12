import type { IncomingMessage, ServerResponse } from 'node:http'

export type NextHandleFunction = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void | Promise<void>
) => void | Promise<void>

export const readJsonBody = async (req: IncomingMessage): Promise<unknown> => {
  const raw = await readRequestBody(req)
  if (!raw || raw.length === 0) return {}

  const text = raw.toString('utf8')
  if (!text.trim()) return {}
  return JSON.parse(text)
}

export const readRequestBody = async (req: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}
