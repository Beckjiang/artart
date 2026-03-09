import { useEffect, useMemo, useRef } from 'react'
import type { FormEvent, KeyboardEvent, RefObject } from 'react'
import type {
  ChatAttachment,
  ChatMessage,
  ComposerSelectionDraft,
} from '../lib/agentChatTypes'

type WorkbenchChatPanelProps = {
  boardTitle: string
  messages: ChatMessage[]
  loading: boolean
  composerValue: string
  composerPlaceholder: string
  composerDisabled: boolean
  canSubmit: boolean
  selectionDraft: ComposerSelectionDraft | null
  statusText: string
  error?: string
  onComposerChange: (value: string) => void
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onRemoveSelectionDraft: () => void
  onLocateAttachment: (attachment: ChatAttachment) => void
  onReuseAttachment: (attachment: ChatAttachment) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
}

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const getMessageLabel = (message: ChatMessage) => {
  if (message.role === 'user') return '你'
  if (message.role === 'tool') return '工具'
  if (message.role === 'system') return '系统'
  return '助手'
}

const getMessageClassName = (message: ChatMessage) => {
  return [
    'workbench-chat-message',
    `is-${message.role}`,
    `is-${message.status}`,
    message.kind === 'tool' ? 'is-tool' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

const getAttachmentMeta = (attachment: ChatAttachment) => {
  if (attachment.width && attachment.height) {
    return `${attachment.width} × ${attachment.height}`
  }

  if (attachment.kind === 'selection-image') return '参考图'
  if (attachment.kind === 'selection-summary') return '选区摘要'
  return '生成结果'
}

export function WorkbenchChatPanel({
  boardTitle,
  messages,
  loading,
  composerValue,
  composerPlaceholder,
  composerDisabled,
  canSubmit,
  selectionDraft,
  statusText,
  error,
  onComposerChange,
  onComposerKeyDown,
  onSubmit,
  onRemoveSelectionDraft,
  onLocateAttachment,
  onReuseAttachment,
  inputRef,
}: WorkbenchChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messages])

  const latestTime = useMemo(() => {
    const last = messages.at(-1)
    return last ? formatTime(last.createdAt) : '刚刚'
  }, [messages])

  return (
    <div className="workbench-chat-shell">
      <header className="workbench-chat-header">
        <div>
          <p className="eyebrow">Canvas Chat</p>
          <h2>{boardTitle}</h2>
          <p className="workbench-chat-subtitle">固定在画布右侧的单线程 AI 助手会话</p>
        </div>
        <div className="workbench-chat-status-badge">
          <span>{statusText}</span>
          <strong>{latestTime}</strong>
        </div>
      </header>

      <div className="workbench-chat-body" ref={scrollRef}>
        {loading ? <p className="workbench-chat-empty">正在加载会话历史…</p> : null}

        {!loading && messages.length === 0 ? (
          <div className="workbench-chat-empty workbench-chat-empty-card">
            <strong>开始一段新的对话</strong>
            <p>描述你想生成的内容，或者先在画布上选中图片，把它作为本次发送的参考图。</p>
          </div>
        ) : null}

        {messages.map((message) => (
          <article key={message.id} className={getMessageClassName(message)}>
            <div className="workbench-chat-message-meta">
              <strong>{getMessageLabel(message)}</strong>
              <span>{formatTime(message.createdAt)}</span>
            </div>

            {message.text ? <p className="workbench-chat-message-text">{message.text}</p> : null}

            {message.attachments.length > 0 ? (
              <div className="workbench-chat-attachments">
                {message.attachments.map((attachment) => (
                  <div key={attachment.id} className="workbench-chat-attachment-card">
                    {attachment.previewUrl ? (
                      <div className="workbench-chat-attachment-preview">
                        <img src={attachment.previewUrl} alt={attachment.name} draggable={false} />
                      </div>
                    ) : null}

                    <div className="workbench-chat-attachment-meta">
                      <strong>{attachment.name}</strong>
                      <p>{getAttachmentMeta(attachment)}</p>
                    </div>

                    {attachment.kind === 'generated-image' ? (
                      <div className="workbench-chat-attachment-actions">
                        <button type="button" onClick={() => onLocateAttachment(attachment)}>
                          定位到画布
                        </button>
                        <button type="button" onClick={() => onReuseAttachment(attachment)}>
                          作为参考图发送
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <form className="workbench-chat-composer" onSubmit={onSubmit}>
        {selectionDraft ? (
          <div className={`workbench-chat-selection-chip is-${selectionDraft.kind}`}>
            {selectionDraft.previewUrl ? (
              <img src={selectionDraft.previewUrl} alt={selectionDraft.label} draggable={false} />
            ) : null}

            <div>
              <strong>{selectionDraft.label}</strong>
              <span>{selectionDraft.helper}</span>
            </div>

            <button type="button" onClick={onRemoveSelectionDraft} aria-label="移除本次引用">
              ×
            </button>
          </div>
        ) : null}

        <div className="workbench-chat-statusline">
          <span>{statusText}</span>
        </div>

        <textarea
          ref={inputRef}
          value={composerValue}
          onChange={(event) => onComposerChange(event.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder={composerPlaceholder}
          disabled={composerDisabled}
          rows={4}
        />

        <div className="workbench-chat-composer-footer">
          <p className="workbench-chat-composer-hint">
            Enter 发送，Shift + Enter 换行。当前选中的内容会作为本次消息附件发送。
          </p>
          <button type="submit" disabled={!canSubmit}>
            发送
          </button>
        </div>

        {error ? <p className="image-prompt-error">{error}</p> : null}
      </form>
    </div>
  )
}
