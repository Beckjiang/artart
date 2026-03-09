export type EditMarker = {
  id: number
  normalizedX: number
  normalizedY: number
  token: string
}

type MarkerTokenRange = {
  token: string
  start: number
  end: number
}

const MARKER_TOKEN_REGEX = /\[标注(\d+)\]/g

const getMarkerTokenRanges = (value: string): MarkerTokenRange[] => {
  const ranges: MarkerTokenRange[] = []

  for (const match of value.matchAll(MARKER_TOKEN_REGEX)) {
    const token = match[0]
    const start = match.index ?? -1
    if (start < 0) continue

    ranges.push({
      token,
      start,
      end: start + token.length,
    })
  }

  return ranges
}

export const createMarkerToken = (id: number) => `[标注${id}]`

export const getNextMarkerId = (markers: Array<Pick<EditMarker, 'id'>>) => {
  const used = new Set(markers.map((marker) => marker.id).filter((id) => Number.isInteger(id) && id > 0))

  let nextId = 1
  while (used.has(nextId)) {
    nextId += 1
  }

  return nextId
}

export const getReferencedMarkerTokens = (value: string) => {
  const seen = new Set<string>()
  const tokens: string[] = []

  for (const range of getMarkerTokenRanges(value)) {
    if (seen.has(range.token)) continue
    seen.add(range.token)
    tokens.push(range.token)
  }

  return tokens
}

export const getReferencedMarkerIds = (value: string) =>
  getReferencedMarkerTokens(value).map((token) => Number(token.match(/\d+/)?.[0] ?? 0)).filter((id) => id > 0)

export const syncMarkersWithPrompt = (markers: EditMarker[], prompt: string) => {
  const referenced = new Set(getReferencedMarkerTokens(prompt))
  return markers.filter((marker) => referenced.has(marker.token))
}

export const findMissingMarkerTokens = (
  prompt: string,
  markers: Array<Pick<EditMarker, 'token'>>
) => {
  const existing = new Set(markers.map((marker) => marker.token))
  return getReferencedMarkerTokens(prompt).filter((token) => !existing.has(token))
}

type InsertMarkerTokenOptions = {
  value: string
  token: string
  selectionStart?: number | null
  selectionEnd?: number | null
}

type MarkerInputResult = {
  value: string
  selectionStart: number
  selectionEnd: number
}

const shouldPadBefore = (value: string, index: number) => {
  if (index <= 0) return false
  const previous = value[index - 1]
  return !!previous && !/[\s([{-]/.test(previous)
}

const shouldPadAfter = (value: string, index: number) => {
  if (index >= value.length) return false
  const next = value[index]
  return !!next && !/[\s.,;:!?)]/u.test(next)
}

export const insertMarkerToken = ({
  value,
  token,
  selectionStart,
  selectionEnd,
}: InsertMarkerTokenOptions): MarkerInputResult => {
  const start = selectionStart ?? value.length
  const end = selectionEnd ?? start

  const prefixPad = shouldPadBefore(value, start) ? ' ' : ''
  const suffixPad = shouldPadAfter(value, end) ? ' ' : ''
  const insertion = `${prefixPad}${token}${suffixPad}`
  const nextValue = `${value.slice(0, start)}${insertion}${value.slice(end)}`
  const caret = start + insertion.length

  return {
    value: nextValue,
    selectionStart: caret,
    selectionEnd: caret,
  }
}

type RemoveMarkerTokenOptions = {
  value: string
  selectionStart?: number | null
  selectionEnd?: number | null
  key: 'Backspace' | 'Delete'
}

type RemoveMarkerTokenResult = MarkerInputResult & {
  removedToken?: string
}

const shouldRemoveRange = (
  range: MarkerTokenRange,
  value: string,
  selectionStart: number,
  selectionEnd: number,
  key: 'Backspace' | 'Delete'
) => {
  if (selectionStart !== selectionEnd) {
    return selectionStart < range.end && selectionEnd > range.start
  }

  if (key === 'Backspace') {
    return (
      (selectionStart > range.start && selectionStart <= range.end) ||
      (selectionStart === range.end + 1 && value[range.end] === ' ')
    )
  }

  return (
    (selectionStart >= range.start && selectionStart < range.end) ||
    (selectionStart === range.start - 1 && value[selectionStart] === ' ')
  )
}

export const removeMarkerTokenAtCaret = ({
  value,
  selectionStart,
  selectionEnd,
  key,
}: RemoveMarkerTokenOptions): RemoveMarkerTokenResult => {
  const start = selectionStart ?? value.length
  const end = selectionEnd ?? start
  const target = getMarkerTokenRanges(value).find((range) =>
    shouldRemoveRange(range, value, start, end, key)
  )

  if (!target) {
    return {
      value,
      selectionStart: start,
      selectionEnd: end,
    }
  }

  let removeStart = target.start
  let removeEnd = target.end

  if (removeStart > 0 && removeEnd < value.length && value[removeStart - 1] === ' ' && value[removeEnd] === ' ') {
    removeEnd += 1
  } else if (removeStart === 0 && value[removeEnd] === ' ') {
    removeEnd += 1
  } else if (removeEnd === value.length && removeStart > 0 && value[removeStart - 1] === ' ') {
    removeStart -= 1
  }

  const nextValue = `${value.slice(0, removeStart)}${value.slice(removeEnd)}`

  return {
    value: nextValue,
    selectionStart: removeStart,
    selectionEnd: removeStart,
    removedToken: target.token,
  }
}
