import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CAMERA_VIEW,
  buildCameraAnglePrompt,
  getCameraPresetMeta,
  snapCameraPreviewToPreset,
} from './cameraAngle'

describe('getCameraPresetMeta', () => {
  it('returns stable preset metadata for the default camera view', () => {
    expect(getCameraPresetMeta(DEFAULT_CAMERA_VIEW)).toMatchObject({
      orbitX: 0,
      orbitY: 0,
      depthProgress: 0.5,
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
})

describe('snapCameraPreviewToPreset', () => {
  it('snaps orbit and depth values to the nearest semantic preset', () => {
    expect(
      snapCameraPreviewToPreset({
        orbitX: 0.48,
        orbitY: -0.36,
        depthProgress: 0.29,
      })
    ).toEqual({
      x: 'front-right-quarter',
      y: 'low-angle',
      z: 'medium-close-up',
    })
  })
})

describe('buildCameraAnglePrompt', () => {
  it('includes bilingual camera semantics and composition constraints', () => {
    const prompt = buildCameraAnglePrompt(
      {
        x: 'front-right-quarter',
        y: 'low-angle',
        z: 'medium-shot',
      },
      {
        width: 1280,
        height: 720,
      }
    )

    expect(prompt).toContain('front-right three-quarter view / 正前偏右四分之三视角')
    expect(prompt).toContain('low-angle shot / 低机位仰拍')
    expect(prompt).toContain('medium shot / 中景景别')
    expect(prompt).toContain('只改变机位，不改变主体身份、服装、发型、主体数量、场景主题、主光线风格。')
    expect(prompt).toContain('主体保持在画面主要区域，构图自然完整。')
    expect(prompt).toContain('禁止拼贴、多视图、额外人物、额外肢体、重复主体。')
    expect(prompt).toContain('Keep the same source aspect ratio (1280 × 720).')
  })
})
