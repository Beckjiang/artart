import { describe, expect, it } from 'vitest'
import { isAgentRunStale } from './db'

describe('isAgentRunStale', () => {
  it('returns false for fresh runs inside the timeout window', () => {
    const now = Date.parse('2026-03-10T00:55:00.000Z')
    const updatedAt = '2026-03-10T00:53:30.000Z'

    expect(isAgentRunStale(updatedAt, now)).toBe(false)
  })

  it('returns true for stale queued or running runs older than the timeout window', () => {
    const now = Date.parse('2026-03-10T00:55:00.000Z')
    const updatedAt = '2026-03-10T00:51:30.000Z'

    expect(isAgentRunStale(updatedAt, now)).toBe(true)
  })
})
