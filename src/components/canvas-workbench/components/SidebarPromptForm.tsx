import type { FormEventHandler, KeyboardEventHandler, RefObject } from 'react'
import { IMAGE_ASPECT_RATIOS } from '../../../lib/imageGeneration'
import type { ImageAspectRatio } from '../../../lib/imageGeneration'

type SidebarPromptFormProps = {
  sidebarPrompt: string
  sidebarError: string
  sidebarAspectRatio: ImageAspectRatio
  canSubmitSidebarPrompt: boolean
  canGenerateSidebar: boolean
  activePlaceholder: string
  inputRef: RefObject<HTMLTextAreaElement | null>
  onSubmit: FormEventHandler<HTMLFormElement>
  onPromptChange: (value: string) => void
  onPromptKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onAspectRatioChange: (ratio: ImageAspectRatio) => void
}

export function SidebarPromptForm({
  sidebarPrompt,
  sidebarError,
  sidebarAspectRatio,
  canSubmitSidebarPrompt,
  canGenerateSidebar,
  activePlaceholder,
  inputRef,
  onSubmit,
  onPromptChange,
  onPromptKeyDown,
  onAspectRatioChange,
}: SidebarPromptFormProps) {
  return (
    <form className="workbench-prompt-form" onSubmit={onSubmit}>
      <label className="workbench-prompt-label" htmlFor="workbench-prompt-input">
        编辑提示词
      </label>
      <textarea
        id="workbench-prompt-input"
        ref={inputRef}
        value={sidebarPrompt}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={onPromptKeyDown}
        placeholder={
          canSubmitSidebarPrompt ? activePlaceholder : '请先调整当前选择后再输入提示词'
        }
        disabled={!canSubmitSidebarPrompt}
        rows={4}
      />

      <div className="workbench-prompt-actions">
        <select
          value={sidebarAspectRatio}
          onChange={(event) => onAspectRatioChange(event.target.value as ImageAspectRatio)}
          disabled={!canSubmitSidebarPrompt}
          aria-label="选择图片比例"
        >
          {IMAGE_ASPECT_RATIOS.map((ratio) => (
            <option key={ratio} value={ratio}>
              {ratio}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!canGenerateSidebar}>
          加入队列
        </button>
      </div>

      <p className="workbench-submit-hint">Enter 提交，Shift + Enter 换行</p>
      {sidebarError ? <p className="image-prompt-error">{sidebarError}</p> : null}
    </form>
  )
}
