import { describe, expect, it } from 'vitest'
import {
  createMarkerToken,
  findMissingMarkerTokens,
  getNextMarkerId,
  getReferencedMarkerIds,
  insertMarkerToken,
  removeMarkerTokenAtCaret,
  syncMarkersWithPrompt,
  type EditMarker,
} from './imageEditMarkers'

describe('getNextMarkerId', () => {
  it('reuses the smallest available marker id', () => {
    expect(getNextMarkerId([{ id: 1 }, { id: 3 }, { id: 4 }])).toBe(2)
  })
})

describe('insertMarkerToken', () => {
  it('appends a marker token when no caret is provided', () => {
    const result = insertMarkerToken({ value: '将主体改亮一点', token: '[标注1]' })

    expect(result.value).toBe('将主体改亮一点 [标注1]')
    expect(result.selectionStart).toBe(result.value.length)
    expect(result.selectionEnd).toBe(result.value.length)
  })

  it('inserts a marker token at the current caret position', () => {
    expect(
      insertMarkerToken({
        value: '将改为一个苹果',
        token: '[标注1]',
        selectionStart: 1,
        selectionEnd: 1,
      })
    ).toEqual({
      value: '将 [标注1] 改为一个苹果',
      selectionStart: 8,
      selectionEnd: 8,
    })
  })
})

describe('removeMarkerTokenAtCaret', () => {
  it('removes the whole token on backspace', () => {
    const value = '将 [标注1] 改为苹果'

    expect(
      removeMarkerTokenAtCaret({
        value,
        selectionStart: 8,
        selectionEnd: 8,
        key: 'Backspace',
      })
    ).toEqual({
      value: '将 改为苹果',
      selectionStart: 2,
      selectionEnd: 2,
      removedToken: '[标注1]',
    })
  })

  it('removes the whole token on delete', () => {
    expect(
      removeMarkerTokenAtCaret({
        value: '[标注1] 改为苹果',
        selectionStart: 0,
        selectionEnd: 0,
        key: 'Delete',
      })
    ).toEqual({
      value: '改为苹果',
      selectionStart: 0,
      selectionEnd: 0,
      removedToken: '[标注1]',
    })
  })
})

describe('marker prompt sync', () => {
  const marker1: EditMarker = {
    id: 1,
    normalizedX: 0.1,
    normalizedY: 0.2,
    token: createMarkerToken(1),
  }
  const marker2: EditMarker = {
    id: 2,
    normalizedX: 0.5,
    normalizedY: 0.6,
    token: createMarkerToken(2),
  }

  it('keeps only markers still referenced by the prompt', () => {
    expect(syncMarkersWithPrompt([marker1, marker2], '将[标注2]改为苹果')).toEqual([marker2])
  })

  it('returns marker ids in prompt order', () => {
    expect(getReferencedMarkerIds('先处理[标注2]，再处理[标注1]')).toEqual([2, 1])
  })

  it('reports placeholder tokens that have no matching marker', () => {
    expect(findMissingMarkerTokens('将[标注1]和[标注3]变亮', [marker1, marker2])).toEqual(['[标注3]'])
  })
})
