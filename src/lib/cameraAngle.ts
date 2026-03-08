export type CameraAxisX =
  | 'left-profile'
  | 'front-left-quarter'
  | 'front'
  | 'front-right-quarter'
  | 'right-profile'

export type CameraAxisY = 'bird-eye' | 'high-angle' | 'eye-level' | 'low-angle' | 'worm-eye'

export type CameraAxisZ =
  | 'close-up'
  | 'medium-close-up'
  | 'medium-shot'
  | 'medium-full-shot'
  | 'full-shot'

export type CameraViewDraft = {
  x: CameraAxisX
  y: CameraAxisY
  z: CameraAxisZ
}

export type CameraRunState = 'idle' | 'running' | 'succeeded' | 'failed'

type CameraAxisOptionBase<TValue extends string> = {
  value: TValue
  label: string
  englishLabel: string
  promptChinese: string
  promptEnglish: string
}

export type CameraAxisXOption = CameraAxisOptionBase<CameraAxisX> & {
  yawDeg: number
  orbitX: number
}

export type CameraAxisYOption = CameraAxisOptionBase<CameraAxisY> & {
  pitchDeg: number
  orbitY: number
}

export type CameraAxisZOption = CameraAxisOptionBase<CameraAxisZ> & {
  distanceScale: number
  depthProgress: number
}

export type CameraViewPresetMeta = {
  x: CameraAxisXOption
  y: CameraAxisYOption
  z: CameraAxisZOption
  orbitX: number
  orbitY: number
  depthProgress: number
}

export type CameraPreviewPointerState = {
  orbitX: number
  orbitY: number
  depthProgress: number
}

export const DEFAULT_CAMERA_VIEW: CameraViewDraft = {
  x: 'front',
  y: 'eye-level',
  z: 'medium-shot',
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const createOrbitValue = (degrees: number, maxAbsDegrees: number) =>
  clamp(degrees / maxAbsDegrees, -1, 1)

export const CAMERA_AXIS_X_OPTIONS: CameraAxisXOption[] = [
  {
    value: 'left-profile',
    label: '左侧面',
    englishLabel: 'Left Profile',
    promptChinese: '左侧面视角',
    promptEnglish: 'left profile view',
    yawDeg: -90,
    orbitX: -1,
  },
  {
    value: 'front-left-quarter',
    label: '左前四分之三',
    englishLabel: 'Front-Left 3/4',
    promptChinese: '正前偏左四分之三视角',
    promptEnglish: 'front-left three-quarter view',
    yawDeg: -40,
    orbitX: createOrbitValue(-40, 90),
  },
  {
    value: 'front',
    label: '正面',
    englishLabel: 'Front',
    promptChinese: '正面视角',
    promptEnglish: 'front view',
    yawDeg: 0,
    orbitX: 0,
  },
  {
    value: 'front-right-quarter',
    label: '右前四分之三',
    englishLabel: 'Front-Right 3/4',
    promptChinese: '正前偏右四分之三视角',
    promptEnglish: 'front-right three-quarter view',
    yawDeg: 40,
    orbitX: createOrbitValue(40, 90),
  },
  {
    value: 'right-profile',
    label: '右侧面',
    englishLabel: 'Right Profile',
    promptChinese: '右侧面视角',
    promptEnglish: 'right profile view',
    yawDeg: 90,
    orbitX: 1,
  },
]

export const CAMERA_AXIS_Y_OPTIONS: CameraAxisYOption[] = [
  {
    value: 'bird-eye',
    label: '鸟瞰',
    englishLabel: 'Bird-Eye',
    promptChinese: '鸟瞰俯拍',
    promptEnglish: 'bird-eye shot',
    pitchDeg: 55,
    orbitY: 1,
  },
  {
    value: 'high-angle',
    label: '高机位',
    englishLabel: 'High Angle',
    promptChinese: '高机位俯拍',
    promptEnglish: 'high-angle shot',
    pitchDeg: 25,
    orbitY: createOrbitValue(25, 55),
  },
  {
    value: 'eye-level',
    label: '平视',
    englishLabel: 'Eye Level',
    promptChinese: '平视机位',
    promptEnglish: 'eye-level shot',
    pitchDeg: 0,
    orbitY: 0,
  },
  {
    value: 'low-angle',
    label: '低机位',
    englishLabel: 'Low Angle',
    promptChinese: '低机位仰拍',
    promptEnglish: 'low-angle shot',
    pitchDeg: -25,
    orbitY: createOrbitValue(-25, 55),
  },
  {
    value: 'worm-eye',
    label: '极低仰视',
    englishLabel: 'Worm-Eye',
    promptChinese: '极低机位仰视',
    promptEnglish: 'worm-eye shot',
    pitchDeg: -55,
    orbitY: -1,
  },
]

export const CAMERA_AXIS_Z_OPTIONS: CameraAxisZOption[] = [
  {
    value: 'close-up',
    label: '特写',
    englishLabel: 'Close-Up',
    promptChinese: '特写景别',
    promptEnglish: 'close-up shot',
    distanceScale: 0.68,
    depthProgress: 0,
  },
  {
    value: 'medium-close-up',
    label: '近景',
    englishLabel: 'Medium Close-Up',
    promptChinese: '近景景别',
    promptEnglish: 'medium close-up shot',
    distanceScale: 0.84,
    depthProgress: 0.25,
  },
  {
    value: 'medium-shot',
    label: '中景',
    englishLabel: 'Medium Shot',
    promptChinese: '中景景别',
    promptEnglish: 'medium shot',
    distanceScale: 1,
    depthProgress: 0.5,
  },
  {
    value: 'medium-full-shot',
    label: '中全景',
    englishLabel: 'Medium Full Shot',
    promptChinese: '中全景景别',
    promptEnglish: 'medium full shot',
    distanceScale: 1.2,
    depthProgress: 0.75,
  },
  {
    value: 'full-shot',
    label: '全景',
    englishLabel: 'Full Shot',
    promptChinese: '全景景别',
    promptEnglish: 'full shot',
    distanceScale: 1.42,
    depthProgress: 1,
  },
]

const nearestBy = <TValue extends string, TOption extends CameraAxisOptionBase<TValue>>(
  options: TOption[],
  readValue: (option: TOption) => number,
  target: number
) => {
  return options.reduce((best, option) => {
    const nextDistance = Math.abs(readValue(option) - target)
    const bestDistance = Math.abs(readValue(best) - target)
    return nextDistance < bestDistance ? option : best
  })
}

const getXOption = (value: CameraAxisX) =>
  CAMERA_AXIS_X_OPTIONS.find((option) => option.value === value) ?? CAMERA_AXIS_X_OPTIONS[2]

const getYOption = (value: CameraAxisY) =>
  CAMERA_AXIS_Y_OPTIONS.find((option) => option.value === value) ?? CAMERA_AXIS_Y_OPTIONS[2]

const getZOption = (value: CameraAxisZ) =>
  CAMERA_AXIS_Z_OPTIONS.find((option) => option.value === value) ?? CAMERA_AXIS_Z_OPTIONS[2]

export const getCameraPresetMeta = (cameraView: CameraViewDraft): CameraViewPresetMeta => {
  const x = getXOption(cameraView.x)
  const y = getYOption(cameraView.y)
  const z = getZOption(cameraView.z)

  return {
    x,
    y,
    z,
    orbitX: x.orbitX,
    orbitY: y.orbitY,
    depthProgress: z.depthProgress,
  }
}

export const snapCameraPreviewToPreset = (
  pointerState: CameraPreviewPointerState
): CameraViewDraft => {
  const orbitX = clamp(pointerState.orbitX, -1, 1)
  const orbitY = clamp(pointerState.orbitY, -1, 1)
  const depthProgress = clamp(pointerState.depthProgress, 0, 1)

  return {
    x: nearestBy(CAMERA_AXIS_X_OPTIONS, (option) => option.orbitX, orbitX).value,
    y: nearestBy(CAMERA_AXIS_Y_OPTIONS, (option) => option.orbitY, orbitY).value,
    z: nearestBy(CAMERA_AXIS_Z_OPTIONS, (option) => option.depthProgress, depthProgress).value,
  }
}

export const buildCameraAnglePrompt = (
  cameraView: CameraViewDraft,
  sourceSize: { width: number; height: number }
) => {
  const meta = getCameraPresetMeta(cameraView)
  const width = Math.max(1, Math.round(sourceSize.width))
  const height = Math.max(1, Math.round(sourceSize.height))

  return [
    '任务目标 / Goal:',
    '基于参考图做单张图生图，仅调整镜头机位、拍摄角度、镜头距离和构图。',
    'Generate a single edited image from the reference image while only changing the camera angle, shot angle, camera distance, and composition.',
    '',
    '约束 / Constraints:',
    '只改变机位，不改变主体身份、服装、发型、主体数量、场景主题、主光线风格。',
    'Keep the same subject identity, outfit, hairstyle, subject count, scene theme, and main lighting style.',
    '',
    '机位 / Camera View:',
    `${meta.x.promptEnglish} / ${meta.x.promptChinese}`,
    `${meta.y.promptEnglish} / ${meta.y.promptChinese}`,
    `${meta.z.promptEnglish} / ${meta.z.promptChinese}`,
    `Keep the same source aspect ratio (${width} × ${height}).`,
    '',
    '构图 / Composition:',
    '主体保持在画面主要区域，构图自然完整。',
    'Keep the main subject in the primary area of the frame with a natural complete composition.',
    '禁止拼贴、多视图、额外人物、额外肢体、重复主体。',
    'Avoid collage, split view, extra people, extra limbs, and duplicated subjects.',
  ].join('\n')
}
