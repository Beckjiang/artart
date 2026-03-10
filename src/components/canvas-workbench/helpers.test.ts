import { describe, expect, it } from 'vitest'
import { clampSidebarWidth, createGeneratorMeta, formatTaskStatus, getMaxSidebarWidth } from './helpers'

describe('canvas workbench helpers', () => {
  it('clamps sidebar width into available viewport bounds', () => {
    expect(getMaxSidebarWidth(1200)).toBe(560)
    expect(clampSidebarWidth(100, 1200)).toBe(340)
    expect(clampSidebarWidth(999, 1200)).toBe(560)
    expect(clampSidebarWidth(500, 1200)).toBe(500)
  })

  it('formats task status labels', () => {
    expect(formatTaskStatus('queued')).toBe('Queued')
    expect(formatTaskStatus('running')).toBe('Running')
    expect(formatTaskStatus('succeeded')).toBe('Done')
    expect(formatTaskStatus('failed')).toBe('Failed')
    expect(formatTaskStatus('cancelled')).toBe('Cancelled')
  })

  it('creates generator metadata with defaults', () => {
    const meta = createGeneratorMeta('16:9')
    expect(meta.canvasRole).toBe('image-generator')
    expect(meta.aspectRatio).toBe('16:9')
    expect(meta.lastPrompt).toBe('')
  })
})
