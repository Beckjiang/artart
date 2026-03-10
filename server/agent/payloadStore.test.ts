import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { maybeExternalizePayload, resolveExternalizedPayload } from './payloadStore'

describe('payloadStore', () => {
  it('keeps small payloads inline', () => {
    const payloadDir = mkdtempSync(path.join(os.tmpdir(), 'agent-payload-inline-'))
    const value = 'data:image/png;base64,abc123'

    const stored = maybeExternalizePayload({
      payloadDir,
      recordId: 'asset-1',
      field: 'data-url',
      value,
      inlineCharLimit: 128,
    })

    expect(stored).toBe(value)
    expect(
      resolveExternalizedPayload({
        payloadDir,
        value: stored,
      })
    ).toBe(value)
  })

  it('stores large data urls outside sql-friendly inline strings', () => {
    const payloadDir = mkdtempSync(path.join(os.tmpdir(), 'agent-payload-file-'))
    const value = `data:image/png;base64,${'a'.repeat(300_000)}`

    const stored = maybeExternalizePayload({
      payloadDir,
      recordId: 'asset-2',
      field: 'data-url',
      value,
      inlineCharLimit: 128,
    })

    expect(stored).toMatch(/^agent-payload:\/\//)
    expect(
      resolveExternalizedPayload({
        payloadDir,
        value: stored,
      })
    ).toBe(value)
  })
})
