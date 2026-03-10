import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const PAYLOAD_TOKEN_PREFIX = 'agent-payload://'
const INLINE_DATA_URL_CHAR_LIMIT = 256_000

type MaybeExternalizePayloadInput = {
  payloadDir: string
  recordId: string
  field: string
  value?: string | null
  inlineCharLimit?: number
}

const toToken = (fileName: string) => `${PAYLOAD_TOKEN_PREFIX}${fileName}`

const getFilePathFromToken = (payloadDir: string, value: string) => {
  if (!value.startsWith(PAYLOAD_TOKEN_PREFIX)) return null
  return path.join(payloadDir, value.slice(PAYLOAD_TOKEN_PREFIX.length))
}

export const maybeExternalizePayload = ({
  payloadDir,
  recordId,
  field,
  value,
  inlineCharLimit = INLINE_DATA_URL_CHAR_LIMIT,
}: MaybeExternalizePayloadInput): string | null => {
  if (!value) return null
  if (value.startsWith(PAYLOAD_TOKEN_PREFIX)) return value
  if (!value.startsWith('data:') || value.length <= inlineCharLimit) return value

  mkdirSync(payloadDir, { recursive: true })
  const fileName = `${recordId}-${field}.txt`
  writeFileSync(path.join(payloadDir, fileName), value, 'utf8')
  return toToken(fileName)
}

export const resolveExternalizedPayload = ({
  payloadDir,
  value,
}: {
  payloadDir: string
  value?: string | null
}): string | null => {
  if (!value) return null

  const filePath = getFilePathFromToken(payloadDir, value)
  if (!filePath) return value
  if (!existsSync(filePath)) return null

  return readFileSync(filePath, 'utf8')
}
