import { describe, expect, it } from 'vitest'
import {
  blurMaskAlpha,
  buildSemanticMaskPrompt,
  compositeMaskedRegion,
  expandMaskBounds,
  findMaskBounds,
} from './maskedImageEdit'

describe('findMaskBounds', () => {
  it('returns null for an empty mask', () => {
    const mask = new Uint8ClampedArray(4 * 3 * 4)

    expect(findMaskBounds(mask, 4, 3)).toBeNull()
  })

  it('detects bounds from rgba mask data', () => {
    const width = 5
    const height = 4
    const mask = new Uint8ClampedArray(width * height * 4)
    const firstPixel = (1 * width + 2) * 4
    const secondPixel = (2 * width + 3) * 4

    mask[firstPixel + 3] = 255
    mask[secondPixel + 3] = 255

    expect(findMaskBounds(mask, width, height)).toEqual({
      x: 2,
      y: 1,
      width: 2,
      height: 2,
    })
  })

  it('supports a full alpha mask array', () => {
    const mask = new Uint8ClampedArray(6 * 4).fill(255)

    expect(findMaskBounds(mask, 6, 4)).toEqual({
      x: 0,
      y: 0,
      width: 6,
      height: 4,
    })
  })
})

describe('expandMaskBounds', () => {
  it('applies padding and the minimum crop edge', () => {
    expect(expandMaskBounds({ x: 4, y: 6, width: 8, height: 8 }, 120, 80)).toEqual({
      x: 0,
      y: 0,
      width: 96,
      height: 80,
    })
  })
})

describe('blurMaskAlpha', () => {
  it('softens hard edges and spreads nearby alpha', () => {
    const mask = new Uint8ClampedArray(9)
    mask[4] = 255

    const blurred = blurMaskAlpha(mask, 3, 3, 1)

    expect(blurred[4]).toBeLessThan(255)
    expect(blurred[4]).toBeGreaterThan(0)
    expect(blurred[1]).toBeGreaterThan(0)
    expect(blurred[0]).toBeGreaterThan(0)
  })
})

describe('compositeMaskedRegion', () => {
  it('keeps unmasked pixels unchanged and only replaces masked pixels', () => {
    const base = new Uint8ClampedArray(4 * 4 * 4)
    const patch = new Uint8ClampedArray(2 * 2 * 4)

    for (let index = 0; index < base.length; index += 4) {
      base[index] = 10
      base[index + 1] = 20
      base[index + 2] = 30
      base[index + 3] = 255
    }

    for (let index = 0; index < patch.length; index += 4) {
      patch[index] = 200
      patch[index + 1] = 10
      patch[index + 2] = 20
      patch[index + 3] = 255
    }

    const maskAlpha = new Uint8ClampedArray([
      255,
      0,
      0,
      0,
    ])

    const composed = compositeMaskedRegion({
      baseImage: {
        width: 4,
        height: 4,
        data: base,
      },
      patchImage: {
        width: 2,
        height: 2,
        data: patch,
      },
      maskAlpha,
      bounds: {
        x: 1,
        y: 1,
        width: 2,
        height: 2,
      },
    })

    const maskedPixel = ((1 * 4 + 1) * 4)
    const untouchedPixel = ((1 * 4 + 2) * 4)
    const outsidePixel = ((0 * 4 + 0) * 4)

    expect(Array.from(composed.data.slice(maskedPixel, maskedPixel + 4))).toEqual([200, 10, 20, 255])
    expect(Array.from(composed.data.slice(untouchedPixel, untouchedPixel + 4))).toEqual([10, 20, 30, 255])
    expect(Array.from(composed.data.slice(outsidePixel, outsidePixel + 4))).toEqual([10, 20, 30, 255])
  })
})

describe('buildSemanticMaskPrompt', () => {
  it('wraps the user prompt with semantic masking instructions', () => {
    const prompt = buildSemanticMaskPrompt('把高亮区域里的 logo 换成极简风格')

    expect(prompt).toContain('第 2 张中高亮的洋红区域是唯一允许修改的区域')
    expect(prompt).toContain('用户要求：把高亮区域里的 logo 换成极简风格')
  })
})
