import { describe, expect, it } from 'vitest'
import {
  getSelectionImagineSourceImage,
  getGeneratorCardPlacement,
  getGeneratorCardSize,
  getInsertPlacement,
  resolveAssistantMode,
  shouldRecreateTaskTarget,
} from './workbenchGeneration'

describe('resolveAssistantMode', () => {
  it('uses neutral when nothing is selected', () => {
    expect(
      resolveAssistantMode({
        selectedCount: 0,
        hasAnySelectedImage: false,
        singleSelectedImageIsLocked: false,
        singleSelectedImageIsGenerator: false,
      })
    ).toBe('neutral')
  })

  it('uses neutral for a single non-image selection', () => {
    expect(
      resolveAssistantMode({
        selectedCount: 1,
        hasAnySelectedImage: false,
        singleSelectedImageIsLocked: false,
        singleSelectedImageIsGenerator: false,
      })
    ).toBe('neutral')
  })

  it('uses image-edit for one unlocked plain image', () => {
    expect(
      resolveAssistantMode({
        selectedCount: 1,
        hasAnySelectedImage: true,
        singleSelectedImageIsLocked: false,
        singleSelectedImageIsGenerator: false,
      })
    ).toBe('image-edit')
  })

  it('uses image-generator for one unlocked generator card', () => {
    expect(
      resolveAssistantMode({
        selectedCount: 1,
        hasAnySelectedImage: true,
        singleSelectedImageIsLocked: false,
        singleSelectedImageIsGenerator: true,
      })
    ).toBe('image-generator')
  })

  it('disables generation for one locked image', () => {
    expect(
      resolveAssistantMode({
        selectedCount: 1,
        hasAnySelectedImage: true,
        singleSelectedImageIsLocked: true,
        singleSelectedImageIsGenerator: false,
      })
    ).toBe('disabled')
  })

  it('uses selection-imagine for multi-selects that include images', () => {
    expect(
      resolveAssistantMode({
        selectedCount: 3,
        hasAnySelectedImage: true,
        singleSelectedImageIsLocked: false,
        singleSelectedImageIsGenerator: false,
      })
    ).toBe('selection-imagine')
  })

  it('uses disabled for multi-selects without images', () => {
    expect(
      resolveAssistantMode({
        selectedCount: 2,
        hasAnySelectedImage: false,
        singleSelectedImageIsLocked: false,
        singleSelectedImageIsGenerator: false,
      })
    ).toBe('disabled')
  })
})

describe('getSelectionImagineSourceImage', () => {
  it('uses the first non-generator image in selection order', () => {
    expect(
      getSelectionImagineSourceImage([
        {
          shapeId: 'shape:generator',
          width: 640,
          height: 640,
          isGenerator: true,
        },
        {
          shapeId: 'shape:photo',
          width: 321.4,
          height: 180.2,
        },
        {
          shapeId: 'shape:poster',
          width: 500,
          height: 700,
        },
      ])
    ).toEqual({
      shapeId: 'shape:photo',
      width: 321,
      height: 180,
      isGenerator: false,
    })
  })

  it('returns null when there is no usable plain image', () => {
    expect(
      getSelectionImagineSourceImage([
        {
          shapeId: 'shape:generator',
          width: 640,
          height: 640,
          isGenerator: true,
        },
      ])
    ).toBeNull()
  })
})

describe('getGeneratorCardSize', () => {
  it('uses a fixed 1:1 generator card size', () => {
    expect(getGeneratorCardSize('1:1')).toEqual({
      width: 1024,
      height: 1024,
    })
  })

  it('uses the long edge for landscape ratios', () => {
    expect(getGeneratorCardSize('16:9')).toEqual({
      width: 1024,
      height: 576,
    })
  })

  it('uses the long edge for portrait ratios', () => {
    expect(getGeneratorCardSize('9:16')).toEqual({
      width: 576,
      height: 1024,
    })
  })
})

describe('getGeneratorCardPlacement', () => {
  it('centers a generator card in the viewport', () => {
    expect(
      getGeneratorCardPlacement(
        {
          x: 100,
          y: 200,
          w: 1600,
          h: 1200,
        },
        '1:1'
      )
    ).toEqual({
      width: 1024,
      height: 1024,
      insertX: 388,
      insertY: 288,
    })
  })
})

describe('getInsertPlacement', () => {
  it('places image-edit results to the right of the reference image', () => {
    expect(
      getInsertPlacement('image-edit', {
        viewportBounds: {
          x: 0,
          y: 0,
          w: 1200,
          h: 800,
        },
        selectedImage: {
          shapeId: 'shape:1',
          x: 50,
          y: 60,
          width: 240,
          height: 180,
          bounds: {
            minY: 58,
            maxX: 310,
          },
        },
        insertGap: 40,
      })
    ).toEqual({
      width: 240,
      height: 180,
      insertX: 350,
      insertY: 58,
      referenceImage: {
        sourceShapeId: 'shape:1',
      },
    })
  })

  it('places selection-imagine results to the right of the selection bounds', () => {
    expect(
      getInsertPlacement('selection-imagine', {
        viewportBounds: {
          x: 0,
          y: 0,
          w: 1200,
          h: 800,
        },
        selectionBounds: {
          x: 80,
          y: 120,
          width: 360,
          height: 220,
          minY: 118,
          maxX: 446,
        },
        insertGap: 40,
      })
    ).toEqual({
      width: 360,
      height: 220,
      insertX: 486,
      insertY: 118,
    })
  })

  it('uses the first selected image size for selection-imagine output when provided', () => {
    expect(
      getInsertPlacement('selection-imagine', {
        viewportBounds: {
          x: 0,
          y: 0,
          w: 1200,
          h: 800,
        },
        selectionBounds: {
          x: 80,
          y: 120,
          width: 360,
          height: 220,
          minY: 118,
          maxX: 446,
        },
        selectionOutputSize: {
          width: 300,
          height: 500,
        },
        insertGap: 40,
      })
    ).toEqual({
      width: 300,
      height: 500,
      insertX: 486,
      insertY: 118,
    })
  })
})

describe('shouldRecreateTaskTarget', () => {
  it('recreates targets for sidebar image-edit tasks', () => {
    expect(shouldRecreateTaskTarget('image-edit-sidebar')).toBe(true)
  })

  it('recreates targets for selection imagine tasks', () => {
    expect(shouldRecreateTaskTarget('selection-imagine-actionbar')).toBe(true)
  })

  it('recreates targets for generator batch tasks', () => {
    expect(shouldRecreateTaskTarget('image-generator-batch')).toBe(true)
  })

  it('does not recreate targets for generator cards', () => {
    expect(shouldRecreateTaskTarget('image-generator-card')).toBe(false)
  })
})
