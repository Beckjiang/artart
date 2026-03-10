import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CAMERA_VIEW,
  buildCameraAnglePrompt,
  getNearestPresets,
} from './cameraAngle'

describe('getNearestPresets', () => {
  it('returns stable preset metadata for the default camera view', () => {
    expect(getNearestPresets(DEFAULT_CAMERA_VIEW)).toMatchObject({
      x: {
        value: 'front',
        promptChinese: '正面视角',
        promptEnglish: 'front view',
      },
      y: {
        value: 'eye-level',
        promptChinese: '平视机位',
        promptEnglish: 'eye-level shot',
      },
      z: {
        value: 'medium-shot',
        promptChinese: '中景景别',
        promptEnglish: 'medium shot',
      },
    })
  })

  it('snaps continuous values to the nearest semantic presets', () => {
    expect(
      getNearestPresets({
        yawDeg: 40,
        pitchDeg: -25,
        depthProgress: 0.29,
      })
    ).toMatchObject({
      x: { value: 'front-right-quarter' },
      y: { value: 'low-angle' },
      z: { value: 'medium-close-up' },
    })
  })
})

describe('buildCameraAnglePrompt', () => {
  it('includes camera mode semantics and precise degrees', () => {
    const prompt = buildCameraAnglePrompt(
      {
        yawDeg: 40,
        pitchDeg: -25,
        depthProgress: 0.5,
      },
      {
        width: 1280,
        height: 720,
      },
      'camera'
    )

    expect(prompt).toContain('Only change the camera position')
    expect(prompt).toContain('front-right three-quarter view / 正前偏右四分之三视角')
    expect(prompt).toContain('low-angle shot / 低机位仰拍')
    expect(prompt).toContain('medium shot / 中景景别')
    expect(prompt).toContain('Yaw (rotate): 40°; Pitch (tilt): -25°;')
    expect(prompt).toContain('Keep the same source aspect ratio (1280 × 720).')
  })

  it('switches key copy for subject mode', () => {
    const prompt = buildCameraAnglePrompt(
      {
        yawDeg: 0,
        pitchDeg: 0,
        depthProgress: 0.5,
      },
      {
        width: 512,
        height: 512,
      },
      'subject'
    )

    expect(prompt).toContain('Rotate/tilt the subject')
    expect(prompt).toContain('Keep the same source aspect ratio (512 × 512).')
  })
})

