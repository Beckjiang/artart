import { useEffect, useMemo, useRef } from 'react'
import type { FormEvent, KeyboardEvent, RefObject } from 'react'
import type {
  ChatAttachment,
  ChatMessage,
  ComposerSelectionDraft,
} from '../lib/agentChatTypes'

const REFERENCE_SKILLS = [
  { label: 'Carousel', accent: 'coral' },
  { label: 'Social Media', accent: 'blue' },
  { label: 'Logo & Branding', accent: 'orange' },
  { label: 'Storyboard', accent: 'violet' },
  { label: 'Brochures', accent: 'teal' },
  { label: 'Amazon Product Listing', accent: 'pink' },
] as const

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

function ComposerGlyph({
  kind,
}: {
  kind: 'reference' | 'attach' | 'sparkle' | 'bulb' | 'bolt' | 'globe' | 'cube' | 'send'
}) {
  const commonProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'workbench-chat-icon-svg',
    'aria-hidden': true,
  }

  switch (kind) {
    case 'reference':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8.25" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M12 3.75v3.1M12 17.15v3.1M20.25 12h-3.1M6.85 12h-3.1" />
        </svg>
      )
    case 'attach':
      return (
        <svg {...commonProps}>
          <path d="M8.4 12.2 14.9 5.7a3.6 3.6 0 1 1 5.1 5.1l-8.2 8.2a5 5 0 1 1-7.1-7.1l8.1-8.1" />
        </svg>
      )
    case 'sparkle':
      return (
        <svg {...commonProps}>
          <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z" />
          <path d="M19 3v3M20.5 4.5h-3M5 16v2.5M6.25 17.25H3.75" />
        </svg>
      )
    case 'bulb':
      return (
        <svg {...commonProps}>
          <path d="M9.25 18.25h5.5M10 21h4" />
          <path d="M8.75 15.75c-1.35-.98-2.25-2.8-2.25-4.55a5.5 5.5 0 1 1 11 0c0 1.75-.9 3.57-2.25 4.55-.52.38-.75.92-.75 1.55v.45h-5v-.45c0-.63-.23-1.17-.75-1.55Z" />
        </svg>
      )
    case 'bolt':
      return (
        <svg {...commonProps}>
          <path d="M13.25 2.75 6.75 13h4l-1 8.25L17.25 11h-4.5l.5-8.25Z" />
        </svg>
      )
    case 'globe':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.75 12h16.5M12 3.75c2.2 2.4 3.4 5.24 3.4 8.25S14.2 17.85 12 20.25M12 3.75c-2.2 2.4-3.4 5.24-3.4 8.25S9.8 17.85 12 20.25" />
        </svg>
      )
    case 'cube':
      return (
        <svg {...commonProps}>
          <path d="m12 3.75 7 4.05v8.4l-7 4.05-7-4.05V7.8Z" />
          <path d="M12 12.1 19 7.8M12 12.1 5 7.8M12 12.1v8.15" />
        </svg>
      )
    case 'send':
      return (
        <svg {...commonProps}>
          <path d="M12 19V5" />
          <path d="m6.75 10.25 5.25-5.5 5.25 5.5" />
        </svg>
      )
  }
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
  const isEmptyConversation = !loading && messages.length === 0

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messages])

  const latestTime = useMemo(() => {
    const last = messages.at(-1)
    return last ? formatTime(last.createdAt) : '刚刚'
  }, [messages])

  const headerTitle = isEmptyConversation ? 'New chat' : boardTitle
  const headerSubtitle = isEmptyConversation ? `Board · ${boardTitle}` : 'Canvas design agent'

  return (
    <div className="workbench-chat-shell">
      <header className="workbench-chat-header">
        <div className="workbench-chat-header-main">
          <div>
            <h2 className="workbench-chat-title">{headerTitle}</h2>
            <p className="workbench-chat-subtitle">{headerSubtitle}</p>
          </div>
          <div className="workbench-chat-header-actions" aria-hidden="true">
            <span className="workbench-chat-icon-button">＋</span>
            <span className="workbench-chat-icon-button">⌄</span>
            <span className="workbench-chat-icon-button">⤴</span>
            <span className="workbench-chat-icon-button is-strong">→</span>
          </div>
        </div>
        <div className="workbench-chat-status-badge">
          <span>{statusText}</span>
          <strong>{latestTime}</strong>
        </div>
      </header>

      <div className={`workbench-chat-body ${isEmptyConversation ? 'is-empty' : ''}`} ref={scrollRef}>
        {loading ? <p className="workbench-chat-empty">正在加载会话历史…</p> : null}

        {isEmptyConversation ? (
          <div className="workbench-chat-empty workbench-chat-empty-card">
            <strong>Try these Lovart Skills</strong>
            <div className="workbench-chat-skill-grid" aria-hidden="true">
              {REFERENCE_SKILLS.map((skill) => (
                <span key={skill.label} className={`workbench-chat-skill-chip is-${skill.accent}`}>
                  <span className="workbench-chat-skill-icon" />
                  <span>{skill.label}</span>
                </span>
              ))}
            </div>
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
            <span className="workbench-chat-selection-chip__icon">
              <ComposerGlyph kind="reference" />
            </span>
            <strong>{selectionDraft.label}</strong>

            <button type="button" onClick={onRemoveSelectionDraft} aria-label="移除本次引用">
              ×
            </button>
          </div>
        ) : null}

        <div className="workbench-chat-composer-main">
          <textarea
            ref={inputRef}
            value={composerValue}
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder={composerPlaceholder}
            disabled={composerDisabled}
            rows={4}
          />
        </div>

        <p className="workbench-chat-composer-hint">Enter 发送 · Shift + Enter 换行</p>

        <div className="workbench-chat-composer-footer">
          <div className="workbench-chat-composer-tools" aria-hidden="true">
            <span className="workbench-chat-round-icon">
              <ComposerGlyph kind="attach" />
            </span>
            <span className="workbench-chat-agent-pill">
              <ComposerGlyph kind="sparkle" />
              <span>Agent</span>
            </span>
          </div>
          <div className="workbench-chat-composer-tools is-right">
            <span className="workbench-chat-round-icon is-muted">
              <ComposerGlyph kind="bulb" />
            </span>
            <span className="workbench-chat-round-icon is-muted">
              <ComposerGlyph kind="bolt" />
            </span>
            <span className="workbench-chat-round-icon is-muted">
              <ComposerGlyph kind="globe" />
            </span>
            <span className="workbench-chat-round-icon is-muted">
              <ComposerGlyph kind="cube" />
            </span>
            <button type="submit" className="workbench-chat-send-button" disabled={!canSubmit}>
              <ComposerGlyph kind="send" />
            </button>
          </div>
        </div>

        {error ? <p className="image-prompt-error">{error}</p> : null}
      </form>
    </div>
  )
}
