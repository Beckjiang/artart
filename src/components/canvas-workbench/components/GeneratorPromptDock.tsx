import type { FormEventHandler, KeyboardEventHandler, RefObject } from 'react'
import { ACTION_PRESETS, IMAGE_GENERATOR_MODEL_LABELS } from '../constants'
import { IMAGE_ASPECT_RATIOS, IMAGE_GENERATION_SIZES, IMAGE_GENERATOR_MODELS } from '../../../lib/imageGeneration'
import type { ImageAspectRatio, ImageGenerationSize, ImageGeneratorModel } from '../../../lib/imageGeneration'
import { ToolbarIcon } from './ToolbarIcon'

type GeneratorOverlayLayout = {
  headerLeft: number
  headerTop: number
  headerWidth: number
  promptLeft: number
  promptTop: number
  promptWidth: number
}

type GeneratorPromptDockProps = {
  layout: GeneratorOverlayLayout | null
  visible: boolean
  generatorShapeSizeLabel: string
  generatorPrompt: string
  generatorBusy: boolean
  generatorImageModel: ImageGeneratorModel
  generatorImageSize: ImageGenerationSize
  generatorAspectRatio: ImageAspectRatio
  generatorError: string
  generatorStatusText: string
  generatorTaskFailed: boolean
  canGenerateFromCard: boolean
  promptInputRef: RefObject<HTMLTextAreaElement | null>
  onSubmit: FormEventHandler<HTMLFormElement>
  onPromptChange: (value: string) => void
  onPromptBlur: () => void
  onPromptKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onModelChange: (value: ImageGeneratorModel) => void
  onSizeChange: (value: ImageGenerationSize) => void
  onAspectRatioChange: (value: ImageAspectRatio) => void
  onCancel: () => void
}

export function GeneratorPromptDock({
  layout,
  visible,
  generatorShapeSizeLabel,
  generatorPrompt,
  generatorBusy,
  generatorImageModel,
  generatorImageSize,
  generatorAspectRatio,
  generatorError,
  generatorStatusText,
  generatorTaskFailed,
  canGenerateFromCard,
  promptInputRef,
  onSubmit,
  onPromptChange,
  onPromptBlur,
  onPromptKeyDown,
  onModelChange,
  onSizeChange,
  onAspectRatioChange,
  onCancel,
}: GeneratorPromptDockProps) {
  if (!visible || !layout) return null

  return (
    <>
      <div
        className="generator-card-header"
        style={{
          left: layout.headerLeft,
          top: layout.headerTop,
          width: layout.headerWidth,
        }}
      >
        <span className="generator-card-title">
          <ToolbarIcon icon="generator" />
          <span>Image Generator</span>
        </span>
        <span className="generator-card-size">{generatorShapeSizeLabel}</span>
      </div>

      <form
        className="generator-prompt-dock"
        style={{
          left: layout.promptLeft,
          top: layout.promptTop,
          width: layout.promptWidth,
        }}
        onSubmit={onSubmit}
      >
        <textarea
          ref={promptInputRef}
          value={generatorPrompt}
          disabled={generatorBusy}
          onChange={(event) => onPromptChange(event.target.value)}
          onBlur={onPromptBlur}
          onKeyDown={onPromptKeyDown}
          placeholder={ACTION_PRESETS['text-to-image'].placeholder}
          rows={4}
        />

        <div className="generator-prompt-footer">
          <div className="generator-prompt-toolbar">
            <label className="generator-prompt-field generator-prompt-field--model">
              <span className="generator-prompt-field-label">Model</span>
              <select
                value={generatorImageModel}
                disabled={generatorBusy}
                onChange={(event) => onModelChange(event.target.value as ImageGeneratorModel)}
                aria-label="选择生成模型"
              >
                {IMAGE_GENERATOR_MODELS.map((model) => (
                  <option key={model} value={model}>
                    {IMAGE_GENERATOR_MODEL_LABELS[model]}
                  </option>
                ))}
              </select>
            </label>

            <div className="generator-prompt-actions">
              <select
                className="generator-size-select"
                value={generatorImageSize}
                disabled={generatorBusy}
                aria-label="选择清晰度"
                onChange={(event) => onSizeChange(event.target.value as ImageGenerationSize)}
              >
                {IMAGE_GENERATION_SIZES.map((imageSize) => (
                  <option key={imageSize} value={imageSize}>
                    {imageSize}
                  </option>
                ))}
              </select>

              <label className="generator-prompt-field generator-prompt-field--ratio">
                <span className="generator-prompt-field-label">Ratio</span>
                <select
                  value={generatorAspectRatio}
                  disabled={generatorBusy}
                  onChange={(event) => onAspectRatioChange(event.target.value as ImageAspectRatio)}
                  aria-label="选择生成卡片比例"
                >
                  {IMAGE_ASPECT_RATIOS.map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </select>
              </label>

              {generatorBusy ? (
                <button type="button" className="generator-secondary-button" onClick={onCancel}>
                  Cancel
                </button>
              ) : (
                <button type="submit" disabled={!canGenerateFromCard}>
                  Generate
                </button>
              )}
            </div>
          </div>
        </div>

        <p className={`generator-prompt-status ${generatorTaskFailed ? 'is-error' : ''}`}>
          {generatorError || generatorStatusText}
        </p>
      </form>
    </>
  )
}
