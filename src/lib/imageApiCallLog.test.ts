import { describe, expect, it } from 'vitest'

import { redactHeaders, redactImageApiPayload } from './imageApiCallLog'

describe('redactHeaders', () => {
  it('redacts known sensitive header keys', () => {
    const result = redactHeaders({
      Authorization: 'Bearer secret-token',
      'x-goog-api-key': 'gemini-key',
      'Content-Type': 'application/json',
    })

    expect(result.Authorization).toBe('<redacted>')
    expect(result['x-goog-api-key']).toBe('<redacted>')
    expect(result['Content-Type']).toBe('application/json')
  })

  it('supports Headers instances (fetch)', () => {
    const headers = new Headers({
      Authorization: 'Bearer secret-token',
      'x-goog-api-key': 'gemini-key',
      'Content-Type': 'application/json',
    })

    const result = redactHeaders(headers)
    expect(result.authorization).toBe('<redacted>')
    expect(result['x-goog-api-key']).toBe('<redacted>')
    expect(result['content-type']).toBe('application/json')
  })
})

describe('redactImageApiPayload', () => {
  it('omits base64 image data in known fields and data URLs', () => {
    const payload = {
      inlineData: {
        mimeType: 'image/png',
        data: 'Z m 9 v',
      },
      inline_data: {
        mime_type: 'image/png',
        data: 'YmFy',
      },
      b64_json: 'Zm9v',
      b64Json: 'YmFy',
      dataUrl: 'data:image/png;base64,Zm9v',
      nested: {
        url: 'data:image/png;base64,YmFy',
      },
    }

    const redacted = redactImageApiPayload(payload) as Record<string, unknown>
    const inlineData = redacted.inlineData as Record<string, unknown>
    const inlineSnake = redacted.inline_data as Record<string, unknown>
    const nested = redacted.nested as Record<string, unknown>

    expect(inlineData.data).toBe('<omitted base64 length=4>')
    expect(inlineSnake.data).toBe('<omitted base64 length=4>')
    expect(redacted.b64_json).toBe('<omitted base64 length=4>')
    expect(redacted.b64Json).toBe('<omitted base64 length=4>')
    expect(redacted.dataUrl).toBe('<omitted base64 length=4>')
    expect(nested.url).toBe('<omitted base64 length=4>')

    const serialized = JSON.stringify(redacted)
    expect(serialized).not.toContain('Zm9v')
    expect(serialized).not.toContain('YmFy')
  })
})
