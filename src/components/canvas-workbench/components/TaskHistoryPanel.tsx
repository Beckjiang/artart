import type { KeyboardEventHandler, ReactNode } from 'react'
import { ACTION_PRESETS } from '../constants'
import { formatTaskStatus } from '../helpers'
import type { GenerationTask } from '../types'

type TaskHistoryPanelProps = {
  tasks: GenerationTask[]
  emptyTaskMessage: string
  runningCount: number
  queueCount: number
  successCount: number
  onSelectTaskResult: (task: GenerationTask) => void
  renderTaskActionButton: (task: GenerationTask) => ReactNode
}

export function TaskHistoryPanel({
  tasks,
  emptyTaskMessage,
  runningCount,
  queueCount,
  successCount,
  onSelectTaskResult,
  renderTaskActionButton,
}: TaskHistoryPanelProps) {
  return (
    <>
      <div className="workbench-task-summary">
        <span>运行中 {runningCount}</span>
        <span>排队 {queueCount}</span>
        <span>成功 {successCount}</span>
      </div>

      <div className="workbench-task-panel">
        <div className="workbench-panel-heading">
          <h3>任务历史</h3>
          <span>点击成功任务可重新选中结果</span>
        </div>

        <div className="workbench-task-list">
          {tasks.length === 0 ? (
            <p className="image-task-empty">{emptyTaskMessage}</p>
          ) : (
            tasks.map((task) => {
              const taskPreset = ACTION_PRESETS[task.sourceAction]
              const isClickable = task.status === 'succeeded' && !!task.resultShapeId
              const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
                if (!isClickable) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectTaskResult(task)
                }
              }

              return (
                <div
                  key={task.id}
                  className={`workbench-task-item task-${task.status} ${isClickable ? 'is-clickable' : ''}`}
                  onClick={() => onSelectTaskResult(task)}
                  onKeyDown={handleKeyDown}
                  role={isClickable ? 'button' : undefined}
                  tabIndex={isClickable ? 0 : -1}
                >
                  <div className="task-main">
                    <div className="task-headline-row">
                      <span className="task-action-pill">{taskPreset.label}</span>
                      <span className="task-status-pill">{formatTaskStatus(task.status)}</span>
                    </div>
                    <p className="task-prompt">{task.prompt}</p>
                    <p className="task-meta">
                      <span>{task.retries > 0 ? `重试 ${task.retries} 次` : '首次任务'}</span>
                      <span>比例 {task.aspectRatio}</span>
                    </p>
                    {task.error ? <p className="task-error">{task.error}</p> : null}
                  </div>

                  <div className="task-actions">{renderTaskActionButton(task)}</div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
