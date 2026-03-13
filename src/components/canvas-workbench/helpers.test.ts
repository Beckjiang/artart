import { describe, expect, it } from 'vitest'
import { toRichText } from 'tldraw'
import type { TLShape, TLTextShape } from 'tldraw'
import {
  WORKBENCH_TEXT_TOOL_SCALE,
  clampSidebarWidth,
  createGeneratorMeta,
  formatTaskStatus,
  getMaxSidebarWidth,
  normalizeCreatedTextShapeForWorkbench,
  shouldBringCreatedArrowToFrontInWorkbench,
  shouldRemoveArrowImageBindingInWorkbench,
} from './helpers'

const createTextShape = (props: Record<string, unknown> = {}) =>
  ({
    type: 'text',
    props: {
      color: 'black',
      size: 'm',
      font: 'draw',
      textAlign: 'start',
      w: 20,
      richText: toRichText(''),
      scale: 1,
      autoSize: true,
      ...props,
    },
  }) as unknown as TLTextShape

const createGeoShape = () =>
  ({
    type: 'geo',
    props: {
      geo: 'rectangle',
      size: 'm',
    },
  }) as unknown as TLShape

const createArrowShape = () =>
  ({
    type: 'arrow',
    props: {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 100 },
    },
  }) as unknown as TLShape

const createArrowBinding = () =>
  ({
    type: 'arrow',
  }) as unknown as Parameters<typeof shouldRemoveArrowImageBindingInWorkbench>[0]

const createImageShape = () =>
  ({
    type: 'image',
    props: {
      w: 100,
      h: 100,
    },
  }) as unknown as TLShape

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
    expect(meta.imageCount).toBe(1)
  })

  it('clamps generator image counts into 1..4', () => {
    expect(createGeneratorMeta('1:1', '', undefined, undefined, 0).imageCount).toBe(1)
    expect(createGeneratorMeta('1:1', '', undefined, undefined, 999).imageCount).toBe(4)
  })

  it('normalizes new text-tool text shapes to 16px', () => {
    const shape = createTextShape()

    const normalized = normalizeCreatedTextShapeForWorkbench(shape, 'user', 'text') as TLTextShape

    expect(normalized).not.toBe(shape)
    expect(normalized.props.size).toBe('s')
    expect(normalized.props.scale).toBe(WORKBENCH_TEXT_TOOL_SCALE)
  })

  it('does not affect non-text shapes', () => {
    const shape = createGeoShape()

    expect(normalizeCreatedTextShapeForWorkbench(shape, 'user', 'text')).toBe(shape)
  })

  it('does not affect text created outside the text tool or with custom props', () => {
    const remoteShape = createTextShape()
    const otherToolShape = createTextShape()
    const customizedShape = createTextShape({ richText: toRichText('Hello') })

    expect(normalizeCreatedTextShapeForWorkbench(remoteShape, 'remote', 'text')).toBe(remoteShape)
    expect(normalizeCreatedTextShapeForWorkbench(otherToolShape, 'user', 'select')).toBe(otherToolShape)
    expect(normalizeCreatedTextShapeForWorkbench(customizedShape, 'user', 'text')).toBe(
      customizedShape
    )
  })

  it('brings arrows to front only when created from the arrow tool', () => {
    const arrowShape = createArrowShape()
    const geoShape = createGeoShape()

    expect(shouldBringCreatedArrowToFrontInWorkbench(arrowShape, 'user', 'arrow')).toBe(true)
    expect(shouldBringCreatedArrowToFrontInWorkbench(arrowShape, 'user', 'select')).toBe(false)
    expect(shouldBringCreatedArrowToFrontInWorkbench(arrowShape, 'remote', 'arrow')).toBe(false)
    expect(shouldBringCreatedArrowToFrontInWorkbench(geoShape, 'user', 'arrow')).toBe(false)
  })

  it('removes arrow bindings that target images', () => {
    const binding = createArrowBinding()
    const arrowShape = createArrowShape()
    const imageShape = createImageShape()
    const geoShape = createGeoShape()

    expect(shouldRemoveArrowImageBindingInWorkbench(binding, 'user', arrowShape, imageShape)).toBe(
      true
    )
    expect(shouldRemoveArrowImageBindingInWorkbench(binding, 'remote', arrowShape, imageShape)).toBe(
      false
    )
    expect(shouldRemoveArrowImageBindingInWorkbench(binding, 'user', arrowShape, geoShape)).toBe(
      false
    )
    expect(shouldRemoveArrowImageBindingInWorkbench(binding, 'user', geoShape, imageShape)).toBe(
      false
    )
  })
})
