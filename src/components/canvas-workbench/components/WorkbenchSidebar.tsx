import type { FormEventHandler, KeyboardEventHandler, MouseEvent as ReactMouseEvent, PointerEventHandler, ReactNode, RefObject } from 'react'
import type { ImageAspectRatio } from '../../../lib/imageGeneration'
import type { MaskStrokeMode } from '../../../lib/maskedImageEdit'
import type { ChatAttachment, ChatMessage, ComposerSelectionDraft } from '../../../lib/agentChatTypes'
import { WorkbenchChatPanel } from '../../WorkbenchChatPanel'
import { SelectionPreviewCard } from './SelectionPreviewCard'
import { MaskPanel } from './MaskPanel'
import { SidebarPromptForm } from './SidebarPromptForm'
import { TaskHistoryPanel } from './TaskHistoryPanel'
import type { GenerationTask } from '../types'

type SelectedImagePreview = {
  src: string
  width: number
  height: number
}

type WorkbenchSidebarProps = {
  boardTitle: string
  tasks: GenerationTask[]
  chatMessages: ChatMessage[]
  chatLoading: boolean
  sidebarPrompt: string
  chatComposerPlaceholder: string
  chatComposerDisabled: boolean
  canSubmitChat: boolean
  composerSelectionDraft: ComposerSelectionDraft | null
  chatStatusText: string
  combinedError: string
  selectedImagePreview: SelectedImagePreview | null
  selectionCardTitle: string
  selectionMessage: string
  assistantMode: string
  maskEnabled: boolean
  showMaskOverlay: boolean
  maskStatusText: string
  canUseMaskEditor: boolean
  maskTool: MaskStrokeMode
  maskBrushSize: number
  maskStrokeCount: number
  activePresetLabel: string
  presetHelperText: string
  sidebarAspectRatio: ImageAspectRatio
  emptyTaskMessage: string
  runningCount: number
  queueCount: number
  successCount: number
  canSubmitSidebarPrompt: boolean
  canGenerateSidebar: boolean
  activePlaceholder: string
  chatInputRef: RefObject<HTMLTextAreaElement | null>
  maskPreviewStageRef: RefObject<HTMLDivElement | null>
  maskPreviewCanvasRef: RefObject<HTMLCanvasElement | null>
  onResizePointerDown: PointerEventHandler<HTMLDivElement>
  onChatComposerChange: (value: string) => void
  onChatComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onChatSubmit: FormEventHandler<HTMLFormElement>
  onRemoveSelectionDraft: () => void
  onLocateAttachment: (attachment: ChatAttachment) => void
  onReuseAttachment: (attachment: ChatAttachment) => void
  onPreviewImageError: () => void
  onMaskPointerDown: PointerEventHandler<HTMLCanvasElement>
  onMaskPointerMove: PointerEventHandler<HTMLCanvasElement>
  onMaskPointerEnd: PointerEventHandler<HTMLCanvasElement>
  onToggleMaskEnabled: () => void
  onSelectMaskTool: (tool: MaskStrokeMode) => void
  onBrushSizeChange: (size: number) => void
  onToggleMaskOverlay: () => void
  onClearMask: () => void
  onToolbarMouseDown: (event: ReactMouseEvent<HTMLElement>) => void
  onSelectTaskResult: (task: GenerationTask) => void
  renderTaskActionButton: (task: GenerationTask) => ReactNode
  onSidebarSubmit: FormEventHandler<HTMLFormElement>
  onSidebarPromptChange: (value: string) => void
  onSidebarPromptKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onSidebarAspectRatioChange: (ratio: ImageAspectRatio) => void
}

export function WorkbenchSidebar({
  boardTitle,
  tasks,
  chatMessages,
  chatLoading,
  sidebarPrompt,
  chatComposerPlaceholder,
  chatComposerDisabled,
  canSubmitChat,
  composerSelectionDraft,
  chatStatusText,
  combinedError,
  selectedImagePreview,
  selectionCardTitle,
  selectionMessage,
  assistantMode,
  maskEnabled,
  showMaskOverlay,
  maskStatusText,
  canUseMaskEditor,
  maskTool,
  maskBrushSize,
  maskStrokeCount,
  activePresetLabel,
  presetHelperText,
  sidebarAspectRatio,
  emptyTaskMessage,
  runningCount,
  queueCount,
  successCount,
  canSubmitSidebarPrompt,
  canGenerateSidebar,
  activePlaceholder,
  chatInputRef,
  maskPreviewStageRef,
  maskPreviewCanvasRef,
  onResizePointerDown,
  onChatComposerChange,
  onChatComposerKeyDown,
  onChatSubmit,
  onRemoveSelectionDraft,
  onLocateAttachment,
  onReuseAttachment,
  onPreviewImageError,
  onMaskPointerDown,
  onMaskPointerMove,
  onMaskPointerEnd,
  onToggleMaskEnabled,
  onSelectMaskTool,
  onBrushSizeChange,
  onToggleMaskOverlay,
  onClearMask,
  onToolbarMouseDown,
  onSelectTaskResult,
  renderTaskActionButton,
  onSidebarSubmit,
  onSidebarPromptChange,
  onSidebarPromptKeyDown,
  onSidebarAspectRatioChange,
}: WorkbenchSidebarProps) {
  return (
    <aside className="canvas-workbench-sidebar">
      <div className="canvas-workbench-sidebar-resizer" onPointerDown={onResizePointerDown} aria-hidden="true" />
      <WorkbenchChatPanel
        boardTitle={boardTitle}
        messages={chatMessages}
        loading={chatLoading}
        composerValue={sidebarPrompt}
        composerPlaceholder={chatComposerPlaceholder}
        composerDisabled={chatComposerDisabled}
        canSubmit={canSubmitChat}
        selectionDraft={composerSelectionDraft}
        statusText={chatStatusText}
        error={combinedError}
        onComposerChange={onChatComposerChange}
        onComposerKeyDown={onChatComposerKeyDown}
        onSubmit={onChatSubmit}
        onRemoveSelectionDraft={onRemoveSelectionDraft}
        onLocateAttachment={onLocateAttachment}
        onReuseAttachment={onReuseAttachment}
        inputRef={chatInputRef}
      />

      <div hidden aria-hidden="true">
        <div className="workbench-sidebar-header">
          <div>
            <p className="eyebrow">Agent</p>
            <h2>图片任务助手</h2>
          </div>
          <span className="task-count-pill">{tasks.length} 个任务</span>
        </div>

        <SelectionPreviewCard
          selectedImagePreview={selectedImagePreview}
          selectionCardTitle={selectionCardTitle}
          selectionMessage={selectionMessage}
          assistantMode={assistantMode}
          maskEnabled={maskEnabled}
          showMaskOverlay={showMaskOverlay}
          maskPreviewStageRef={maskPreviewStageRef}
          maskPreviewCanvasRef={maskPreviewCanvasRef}
          onPreviewImageError={onPreviewImageError}
          onMaskPointerDown={onMaskPointerDown}
          onMaskPointerMove={onMaskPointerMove}
          onMaskPointerEnd={onMaskPointerEnd}
        />

        <div className="workbench-sidebar-note">{selectionMessage}</div>

        <MaskPanel
          visible={assistantMode === 'image-edit'}
          maskStatusText={maskStatusText}
          maskEnabled={maskEnabled}
          canUseMaskEditor={canUseMaskEditor}
          maskTool={maskTool}
          maskBrushSize={maskBrushSize}
          showMaskOverlay={showMaskOverlay}
          maskStrokeCount={maskStrokeCount}
          onToggleMaskEnabled={onToggleMaskEnabled}
          onSelectMaskTool={onSelectMaskTool}
          onBrushSizeChange={onBrushSizeChange}
          onToggleMaskOverlay={onToggleMaskOverlay}
          onClearMask={onClearMask}
          onToolbarMouseDown={onToolbarMouseDown}
        />

        <div className="workbench-preset-card">
          <div className="workbench-preset-card__top">
            <span className="active-preset-badge">{activePresetLabel}</span>
            <span>比例 {sidebarAspectRatio}</span>
          </div>
          <p>{presetHelperText}</p>
        </div>

        <TaskHistoryPanel
          tasks={tasks}
          emptyTaskMessage={emptyTaskMessage}
          runningCount={runningCount}
          queueCount={queueCount}
          successCount={successCount}
          onSelectTaskResult={onSelectTaskResult}
          renderTaskActionButton={renderTaskActionButton}
        />

        <SidebarPromptForm
          sidebarPrompt={sidebarPrompt}
          sidebarError={combinedError}
          sidebarAspectRatio={sidebarAspectRatio}
          canSubmitSidebarPrompt={canSubmitSidebarPrompt}
          canGenerateSidebar={canGenerateSidebar}
          activePlaceholder={activePlaceholder}
          inputRef={chatInputRef}
          onSubmit={onSidebarSubmit}
          onPromptChange={onSidebarPromptChange}
          onPromptKeyDown={onSidebarPromptKeyDown}
          onAspectRatioChange={onSidebarAspectRatioChange}
        />
      </div>
    </aside>
  )
}
