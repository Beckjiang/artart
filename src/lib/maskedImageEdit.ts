import type { EditMarker } from './imageEditMarkers'

export type MaskStrokeMode = 'paint' | 'erase'

export type NormalizedMaskPoint = {
  x: number
  y: number
}

export type NormalizedMaskStroke = {
  mode: MaskStrokeMode
  sizeRatio: number
  points: NormalizedMaskPoint[]
}

export type MaskBounds = {
  x: number
  y: number
  width: number
  height: number
}

type PixelImage = {
  width: number
  height: number
  data: Uint8ClampedArray
}

type DrawMaskStrokesOptions = {
  paintColor?: string
}

type PrepareMaskedEditAssetsOptions = {
  sourceImageUrl: string
  strokes: NormalizedMaskStroke[]
  signal?: AbortSignal
}

type PreparePointMarkerEditAssetsOptions = {
  sourceImageUrl: string
  markers: EditMarker[]
  activeMarkerTokens: string[]
  signal?: AbortSignal
}

type CompositeMaskedEditResultOptions = {
  baseImageUrl: string
  patchImageUrl: string
  maskImageUrl: string
  maskBounds: MaskBounds
  featherPx?: number
  signal?: AbortSignal
}

export type PreparedMaskedEditAssets = {
  sourceWidth: number
  sourceHeight: number
  maskBounds: MaskBounds
  sourceCropUrl: string
  highlightCropUrl: string
  maskCropUrl: string
  fullMaskUrl: string
}

export type PreparedPointMarkerEditAssets = PreparedMaskedEditAssets & {
  labeledCropUrl: string
  activeMarkerTokens: string[]
}

export const MASK_PADDING_RATIO = 0.08
export const MASK_PADDING_MIN = 24
export const MASK_PADDING_MAX = 96
export const MASK_MIN_CROP_EDGE = 96
export const DEFAULT_MASK_FEATHER_PX = 2
export const POINT_MARKER_RADIUS_RATIO = 0.12
export const POINT_MARKER_MIN_RADIUS_PX = 24
export const POINT_MARKER_MAX_RADIUS_PX = 90

const HIGHLIGHT_OVERLAY = 'rgba(217, 70, 239, 0.45)'
const MASK_PAINT_COLOR = 'rgba(255, 255, 255, 1)'
const MARKER_BADGE_FILL = 'rgba(15, 101, 216, 0.94)'
const MARKER_BADGE_STROKE = 'rgba(255, 255, 255, 0.96)'
const MARKER_BADGE_TEXT = '#ffffff'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const getMaskValue = (data: Uint8ClampedArray, index: number, isRgba: boolean) =>
  (isRgba ? data[index * 4 + 3] : data[index]) || 0

const createCanvas = (width: number, height: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

const canvasToDataUrl = (canvas: HTMLCanvasElement) => canvas.toDataURL('image/png')

const loadImageElement = (source: string, signal?: AbortSignal): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new window.Image()
    let done = false

    const cleanup = () => {
      image.onload = null
      image.onerror = null
      signal?.removeEventListener('abort', handleAbort)
    }

    const finish = () => {
      if (done) return
      done = true
      cleanup()
      resolve(image)
    }

    const fail = (error: Error) => {
      if (done) return
      done = true
      cleanup()
      reject(error)
    }

    const handleAbort = () => {
      fail(new DOMException('The operation was aborted', 'AbortError'))
    }

    if (signal?.aborted) {
      handleAbort()
      return
    }

    image.onload = finish
    image.onerror = () => fail(new Error('读取图片失败'))
    signal?.addEventListener('abort', handleAbort, { once: true })
    image.decoding = 'async'
    image.src = source
  })

const getImageData = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('无法创建画布上下文')
  }
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

const createPixelImage = (width: number, height: number, data: Uint8ClampedArray): PixelImage => ({
  width,
  height,
  data,
})

export const getMaskPadding = (
  width: number,
  height: number,
  ratio = MASK_PADDING_RATIO,
  min = MASK_PADDING_MIN,
  max = MASK_PADDING_MAX
) => clamp(Math.round(Math.max(width, height) * ratio), min, max)

export const extractMaskAlpha = (data: Uint8ClampedArray, width: number, height: number) => {
  const total = width * height
  const alpha = new Uint8ClampedArray(total)
  const isRgba = data.length === total * 4

  for (let index = 0; index < total; index += 1) {
    alpha[index] = getMaskValue(data, index, isRgba)
  }

  return alpha
}

export const findMaskBounds = (
  maskData: Uint8ClampedArray,
  width: number,
  height: number
): MaskBounds | null => {
  if (width <= 0 || height <= 0) return null

  const expectedAlpha = width * height
  const expectedRgba = expectedAlpha * 4

  if (maskData.length !== expectedAlpha && maskData.length !== expectedRgba) {
    throw new Error('maskData 尺寸与宽高不匹配')
  }

  const isRgba = maskData.length === expectedRgba

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (getMaskValue(maskData, index, isRgba) <= 0) continue

      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0 || maxY < 0) return null

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

export const expandMaskBounds = (
  bounds: MaskBounds,
  imageWidth: number,
  imageHeight: number,
  minEdge = MASK_MIN_CROP_EDGE
) => {
  const padding = getMaskPadding(bounds.width, bounds.height)
  let minX = Math.max(0, bounds.x - padding)
  let minY = Math.max(0, bounds.y - padding)
  let maxX = Math.min(imageWidth, bounds.x + bounds.width + padding)
  let maxY = Math.min(imageHeight, bounds.y + bounds.height + padding)

  const expandAxis = (min: number, max: number, limit: number) => {
    const current = max - min
    if (current >= minEdge) {
      return { min, max }
    }

    const deficit = minEdge - current
    const addBefore = Math.min(min, Math.floor(deficit / 2))
    const addAfter = Math.min(limit - max, deficit - addBefore)

    let nextMin = min - addBefore
    let nextMax = max + addAfter
    const remaining = minEdge - (nextMax - nextMin)

    if (remaining > 0) {
      const extraBefore = Math.min(nextMin, remaining)
      nextMin -= extraBefore
      nextMax = Math.min(limit, nextMax + (remaining - extraBefore))
    }

    return {
      min: Math.max(0, nextMin),
      max: Math.min(limit, nextMax),
    }
  }

  const horizontal = expandAxis(minX, maxX, imageWidth)
  const vertical = expandAxis(minY, maxY, imageHeight)

  minX = horizontal.min
  maxX = horizontal.max
  minY = vertical.min
  maxY = vertical.max

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  }
}

export const blurMaskAlpha = (
  maskAlpha: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
) => {
  if (radius <= 0) {
    return new Uint8ClampedArray(maskAlpha)
  }

  const horizontal = new Float32Array(maskAlpha.length)
  const output = new Uint8ClampedArray(maskAlpha.length)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0
      let count = 0

      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleX = x + offset
        if (sampleX < 0 || sampleX >= width) continue
        total += maskAlpha[y * width + sampleX] || 0
        count += 1
      }

      horizontal[y * width + x] = count > 0 ? total / count : 0
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0
      let count = 0

      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleY = y + offset
        if (sampleY < 0 || sampleY >= height) continue
        total += horizontal[sampleY * width + x] || 0
        count += 1
      }

      output[y * width + x] = Math.round(count > 0 ? total / count : 0)
    }
  }

  return output
}

export const compositeMaskedRegion = ({
  baseImage,
  patchImage,
  maskAlpha,
  bounds,
}: {
  baseImage: PixelImage
  patchImage: PixelImage
  maskAlpha: Uint8ClampedArray
  bounds: MaskBounds
}) => {
  if (patchImage.width !== bounds.width || patchImage.height !== bounds.height) {
    throw new Error('补丁图片尺寸与 maskBounds 不匹配')
  }

  if (maskAlpha.length !== bounds.width * bounds.height) {
    throw new Error('maskAlpha 尺寸与 maskBounds 不匹配')
  }

  const composed = new Uint8ClampedArray(baseImage.data)

  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const maskIndex = y * bounds.width + x
      const blend = (maskAlpha[maskIndex] || 0) / 255
      if (blend <= 0) continue

      const baseIndex = ((bounds.y + y) * baseImage.width + (bounds.x + x)) * 4
      const patchIndex = (maskIndex || 0) * 4
      const patchAlpha = (patchImage.data[patchIndex + 3] || 0) / 255
      const factor = blend * patchAlpha

      if (factor <= 0) continue

      for (let channel = 0; channel < 3; channel += 1) {
        const baseValue = composed[baseIndex + channel] || 0
        const patchValue = patchImage.data[patchIndex + channel] || 0
        composed[baseIndex + channel] = Math.round(baseValue * (1 - factor) + patchValue * factor)
      }

      const baseAlpha = composed[baseIndex + 3] || 0
      const patchAlphaByte = patchImage.data[patchIndex + 3] || 0
      composed[baseIndex + 3] = Math.round(baseAlpha * (1 - factor) + patchAlphaByte * factor)
    }
  }

  return createPixelImage(baseImage.width, baseImage.height, composed)
}

export const buildSemanticMaskPrompt = (prompt: string) => {
  const basePrompt =
    '你将收到两张局部参考图。第 1 张是原始局部裁剪图，第 2 张中高亮的洋红区域是唯一允许修改的区域。仅根据用户要求编辑高亮区域，保持未高亮区域的结构、文字、风格、光影和边缘连续性不变。输出一张完整自然的局部编辑结果，不要额外添加边框或留白。'

  const normalizedPrompt = prompt.trim()
  return normalizedPrompt ? `${basePrompt}\n用户要求：${normalizedPrompt}` : basePrompt
}

const getPointMarkerRadiusPx = (sourceWidth: number, sourceHeight: number) =>
  clamp(
    Math.round(Math.min(sourceWidth, sourceHeight) * POINT_MARKER_RADIUS_RATIO),
    POINT_MARKER_MIN_RADIUS_PX,
    POINT_MARKER_MAX_RADIUS_PX
  )

export const createPointMarkerMaskStrokes = (
  markers: EditMarker[],
  sourceWidth: number,
  sourceHeight: number
) => {
  if (markers.length === 0) return []

  const minEdge = Math.max(1, Math.min(sourceWidth, sourceHeight))
  const brushSize = getPointMarkerRadiusPx(sourceWidth, sourceHeight) * 2
  const sizeRatio = brushSize / minEdge

  return markers.map((marker) => ({
    mode: 'paint' as const,
    sizeRatio,
    points: [
      {
        x: clamp(marker.normalizedX, 0, 1),
        y: clamp(marker.normalizedY, 0, 1),
      },
    ],
  }))
}

export const buildPointMarkerEditPrompt = (prompt: string, activeMarkerTokens: string[]) => {
  const markerLine = activeMarkerTokens.join('、')
  const basePrompt = [
    '你将收到三张局部参考图。',
    '第 1 张是原始局部裁剪图。',
    '第 2 张中高亮的洋红区域是允许修改的范围。',
    '第 3 张是在同一局部图上叠加编号标注的参考图。',
    '仅修改用户明确引用的 [标注N] 附近区域；每个 [标注N] 都对应第 3 张参考图中的同号标记。',
    '不要修改未被引用的区域，不要改变主体身份、文字内容、构图、光影、风格和边缘连续性。',
    '输出一张完整自然的局部编辑结果，不要额外添加边框、留白或新的标号。',
    markerLine ? `本次允许修改的标注：${markerLine}` : '',
  ]
    .filter(Boolean)
    .join('')

  const normalizedPrompt = prompt.trim()
  return normalizedPrompt ? `${basePrompt}\n用户要求：${normalizedPrompt}` : basePrompt
}

const drawMarkerBadge = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  radius = 18
) => {
  context.save()
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fillStyle = MARKER_BADGE_FILL
  context.fill()
  context.lineWidth = 2
  context.strokeStyle = MARKER_BADGE_STROKE
  context.stroke()
  context.fillStyle = MARKER_BADGE_TEXT
  context.font = '700 16px Segoe UI, PingFang SC, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label, x, y + 0.5)
  context.restore()
}

export const preparePointMarkerEditAssets = async ({
  sourceImageUrl,
  markers,
  activeMarkerTokens,
  signal,
}: PreparePointMarkerEditAssetsOptions): Promise<PreparedPointMarkerEditAssets> => {
  const activeSet = new Set(activeMarkerTokens)
  const activeMarkers = markers.filter((marker) => activeSet.has(marker.token))

  if (activeMarkers.length === 0) {
    throw new Error('请先按住 Alt 点击图片添加标注，或删除无效的 [标注N] 占位符')
  }

  const sourceImage = await loadImageElement(sourceImageUrl, signal)
  const sourceWidth = Math.max(1, sourceImage.naturalWidth || sourceImage.width || 1)
  const sourceHeight = Math.max(1, sourceImage.naturalHeight || sourceImage.height || 1)
  const strokes = createPointMarkerMaskStrokes(activeMarkers, sourceWidth, sourceHeight)
  const prepared = await prepareMaskedEditAssets({
    sourceImageUrl,
    strokes,
    signal,
  })

  const labeledCropCanvas = createCanvas(prepared.maskBounds.width, prepared.maskBounds.height)
  const labeledCropContext = labeledCropCanvas.getContext('2d')
  if (!labeledCropContext) {
    throw new Error('无法创建标注预览画布上下文')
  }

  labeledCropContext.drawImage(
    sourceImage,
    prepared.maskBounds.x,
    prepared.maskBounds.y,
    prepared.maskBounds.width,
    prepared.maskBounds.height,
    0,
    0,
    prepared.maskBounds.width,
    prepared.maskBounds.height
  )

  for (const marker of activeMarkers) {
    const x = clamp(marker.normalizedX, 0, 1) * sourceWidth - prepared.maskBounds.x
    const y = clamp(marker.normalizedY, 0, 1) * sourceHeight - prepared.maskBounds.y
    drawMarkerBadge(labeledCropContext, x, y, String(marker.id))
  }

  return {
    ...prepared,
    labeledCropUrl: canvasToDataUrl(labeledCropCanvas),
    activeMarkerTokens: activeMarkers.map((marker) => marker.token),
  }
}

export const drawMaskStrokes = (
  context: CanvasRenderingContext2D,
  strokes: NormalizedMaskStroke[],
  width: number,
  height: number,
  options: DrawMaskStrokesOptions = {}
) => {
  context.clearRect(0, 0, width, height)
  const paintColor = options.paintColor || MASK_PAINT_COLOR

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue

    const brushSize = Math.max(1, stroke.sizeRatio * Math.min(width, height))
    const radius = brushSize / 2

    context.save()
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = brushSize
    context.strokeStyle = paintColor
    context.fillStyle = paintColor
    context.globalCompositeOperation = stroke.mode === 'paint' ? 'source-over' : 'destination-out'

    if (stroke.points.length === 1) {
      const point = stroke.points[0]
      context.beginPath()
      context.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2)
      context.fill()
      context.restore()
      continue
    }

    context.beginPath()
    context.moveTo(stroke.points[0].x * width, stroke.points[0].y * height)
    for (let index = 1; index < stroke.points.length; index += 1) {
      const point = stroke.points[index]
      context.lineTo(point.x * width, point.y * height)
    }
    context.stroke()
    context.restore()
  }
}

export const prepareMaskedEditAssets = async ({
  sourceImageUrl,
  strokes,
  signal,
}: PrepareMaskedEditAssetsOptions): Promise<PreparedMaskedEditAssets> => {
  if (strokes.length === 0) {
    throw new Error('请先涂抹需要编辑的区域')
  }

  const sourceImage = await loadImageElement(sourceImageUrl, signal)
  const sourceWidth = Math.max(1, sourceImage.naturalWidth || sourceImage.width || 1)
  const sourceHeight = Math.max(1, sourceImage.naturalHeight || sourceImage.height || 1)

  const fullMaskCanvas = createCanvas(sourceWidth, sourceHeight)
  const fullMaskContext = fullMaskCanvas.getContext('2d')
  if (!fullMaskContext) {
    throw new Error('无法创建蒙版画布上下文')
  }

  drawMaskStrokes(fullMaskContext, strokes, sourceWidth, sourceHeight, {
    paintColor: MASK_PAINT_COLOR,
  })

  const fullMaskImageData = getImageData(fullMaskCanvas)
  const rawBounds = findMaskBounds(fullMaskImageData.data, sourceWidth, sourceHeight)
  if (!rawBounds) {
    throw new Error('请先涂抹需要编辑的区域')
  }

  const maskBounds = expandMaskBounds(rawBounds, sourceWidth, sourceHeight)

  const sourceCropCanvas = createCanvas(maskBounds.width, maskBounds.height)
  const sourceCropContext = sourceCropCanvas.getContext('2d')
  if (!sourceCropContext) {
    throw new Error('无法创建局部裁剪画布上下文')
  }

  sourceCropContext.drawImage(
    sourceImage,
    maskBounds.x,
    maskBounds.y,
    maskBounds.width,
    maskBounds.height,
    0,
    0,
    maskBounds.width,
    maskBounds.height
  )

  const maskCropCanvas = createCanvas(maskBounds.width, maskBounds.height)
  const maskCropContext = maskCropCanvas.getContext('2d')
  if (!maskCropContext) {
    throw new Error('无法创建蒙版裁剪画布上下文')
  }

  maskCropContext.drawImage(
    fullMaskCanvas,
    maskBounds.x,
    maskBounds.y,
    maskBounds.width,
    maskBounds.height,
    0,
    0,
    maskBounds.width,
    maskBounds.height
  )

  const highlightCanvas = createCanvas(maskBounds.width, maskBounds.height)
  const highlightContext = highlightCanvas.getContext('2d')
  if (!highlightContext) {
    throw new Error('无法创建高亮裁剪画布上下文')
  }

  highlightContext.drawImage(sourceCropCanvas, 0, 0)

  const tintCanvas = createCanvas(maskBounds.width, maskBounds.height)
  const tintContext = tintCanvas.getContext('2d')
  if (!tintContext) {
    throw new Error('无法创建高亮蒙版画布上下文')
  }

  tintContext.fillStyle = HIGHLIGHT_OVERLAY
  tintContext.fillRect(0, 0, tintCanvas.width, tintCanvas.height)
  tintContext.globalCompositeOperation = 'destination-in'
  tintContext.drawImage(maskCropCanvas, 0, 0)
  highlightContext.drawImage(tintCanvas, 0, 0)

  return {
    sourceWidth,
    sourceHeight,
    maskBounds,
    sourceCropUrl: canvasToDataUrl(sourceCropCanvas),
    highlightCropUrl: canvasToDataUrl(highlightCanvas),
    maskCropUrl: canvasToDataUrl(maskCropCanvas),
    fullMaskUrl: canvasToDataUrl(fullMaskCanvas),
  }
}

export const compositeMaskedEditResult = async ({
  baseImageUrl,
  patchImageUrl,
  maskImageUrl,
  maskBounds,
  featherPx = DEFAULT_MASK_FEATHER_PX,
  signal,
}: CompositeMaskedEditResultOptions) => {
  const [baseImage, patchImage, maskImage] = await Promise.all([
    loadImageElement(baseImageUrl, signal),
    loadImageElement(patchImageUrl, signal),
    loadImageElement(maskImageUrl, signal),
  ])

  const baseWidth = Math.max(1, baseImage.naturalWidth || baseImage.width || 1)
  const baseHeight = Math.max(1, baseImage.naturalHeight || baseImage.height || 1)

  const baseCanvas = createCanvas(baseWidth, baseHeight)
  const baseContext = baseCanvas.getContext('2d')
  if (!baseContext) {
    throw new Error('无法创建底图画布上下文')
  }

  baseContext.drawImage(baseImage, 0, 0, baseWidth, baseHeight)

  const patchCanvas = createCanvas(maskBounds.width, maskBounds.height)
  const patchContext = patchCanvas.getContext('2d')
  if (!patchContext) {
    throw new Error('无法创建补丁画布上下文')
  }

  patchContext.drawImage(patchImage, 0, 0, maskBounds.width, maskBounds.height)

  const maskCanvas = createCanvas(maskBounds.width, maskBounds.height)
  const maskContext = maskCanvas.getContext('2d')
  if (!maskContext) {
    throw new Error('无法创建蒙版画布上下文')
  }

  maskContext.drawImage(maskImage, 0, 0, maskBounds.width, maskBounds.height)

  const baseImageData = baseContext.getImageData(0, 0, baseWidth, baseHeight)
  const patchImageData = patchContext.getImageData(0, 0, maskBounds.width, maskBounds.height)
  const maskImageData = maskContext.getImageData(0, 0, maskBounds.width, maskBounds.height)

  const maskAlpha = extractMaskAlpha(maskImageData.data, maskBounds.width, maskBounds.height)
  const featheredMask = blurMaskAlpha(maskAlpha, maskBounds.width, maskBounds.height, featherPx)
  const composed = compositeMaskedRegion({
    baseImage: createPixelImage(baseWidth, baseHeight, baseImageData.data),
    patchImage: createPixelImage(maskBounds.width, maskBounds.height, patchImageData.data),
    maskAlpha: featheredMask,
    bounds: maskBounds,
  })

  baseImageData.data.set(composed.data)
  baseContext.putImageData(baseImageData, 0, 0)

  return {
    imageUrl: canvasToDataUrl(baseCanvas),
    width: baseWidth,
    height: baseHeight,
    mimeType: 'image/png',
  }
}
