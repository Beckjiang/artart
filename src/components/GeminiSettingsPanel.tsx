import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  clearLocalGeminiApiKey,
  readGeminiConnectionSettings,
  saveGeminiConnectionSettings,
  resetGeminiConnectionSettings,
} from '../lib/geminiConnectionSettings'
import { isGeminiProxyBaseUrl, resolveGeminiBaseUrl } from '../lib/imageGeneration'

const isValidBaseUrl = (value: string) => {
  const trimmed = value.trim()
  return !trimmed || trimmed.startsWith('/') || /^https?:\/\//i.test(trimmed)
}

const getEffectiveBaseUrl = (settings = readGeminiConnectionSettings()) =>
  resolveGeminiBaseUrl(import.meta.env, import.meta.env.DEV, settings)

const getBaseUrlInputValue = (settings = readGeminiConnectionSettings()) => {
  if (settings.baseUrl) return settings.baseUrl

  const effectiveBaseUrl = getEffectiveBaseUrl(settings)
  if (!isGeminiProxyBaseUrl(effectiveBaseUrl)) return effectiveBaseUrl

  try {
    const parsed = new URL(effectiveBaseUrl)
    return parsed.pathname || '/api/gemini'
  } catch {
    return effectiveBaseUrl
  }
}

export function GeminiSettingsPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [settings, setSettings] = useState(() => readGeminiConnectionSettings())
  const [baseUrlInput, setBaseUrlInput] = useState(() => getBaseUrlInputValue())
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const effectiveBaseUrl = getEffectiveBaseUrl(settings)
  const hasLocalBaseUrl = Boolean(settings.baseUrl)

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!isValidBaseUrl(baseUrlInput)) {
      setError('Base URL 仅支持空值、`/api/...` 相对路径或 `http/https` 绝对地址。')
      setNotice('')
      return
    }

    const nextSettings = saveGeminiConnectionSettings({
      baseUrl: baseUrlInput,
      apiKey: apiKeyInput,
      preserveExistingApiKey: true,
    })

    setSettings(nextSettings)
    setBaseUrlInput(getBaseUrlInputValue(nextSettings))
    setApiKeyInput('')
    setError('')
    setNotice('Gemini 设置已保存，新的请求会立即使用当前配置。')
  }

  const handleClearApiKey = () => {
    const nextSettings = clearLocalGeminiApiKey()
    setSettings(nextSettings)
    setBaseUrlInput(getBaseUrlInputValue(nextSettings))
    setApiKeyInput('')
    setError('')
    setNotice('已清除本地 API Key，后续请求将回退到默认 Key 配置。')
  }

  const handleReset = () => {
    const nextSettings = resetGeminiConnectionSettings()
    setSettings(nextSettings)
    setBaseUrlInput(getBaseUrlInputValue(nextSettings))
    setApiKeyInput('')
    setError('')
    setNotice('已恢复默认连接配置。')
  }

  return (
    <section className="gemini-settings-card">
      <div className="gemini-settings-header">
        <div>
          <h2>Gemini 设置</h2>
          <p>把 Gemini 请求连接信息收敛到本机当前浏览器，保存后立即影响画布内生图与 Agent。</p>
        </div>
        <button
          type="button"
          className="gemini-settings-toggle"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((previous) => !previous)}
        >
          {isOpen ? '收起设置' : '展开设置'}
        </button>
      </div>

      <div className="gemini-settings-summary">
        <span>{hasLocalBaseUrl ? '已启用本地 Base URL 覆盖' : '当前使用默认 Base URL'}</span>
        <code>{effectiveBaseUrl}</code>
        <span>{settings.hasLocalApiKey ? '已配置本地 API Key' : '当前未保存本地 API Key'}</span>
      </div>

      {isOpen ? (
        <form className="gemini-settings-form" onSubmit={handleSave}>
          <label>
            <span>Base URL</span>
            <input
              value={baseUrlInput}
              onChange={(event) => setBaseUrlInput(event.target.value)}
              placeholder="/api/gemini 或 https://generativelanguage.googleapis.com"
            />
          </label>

          <label>
            <span>API Key</span>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              placeholder={settings.hasLocalApiKey ? '已配置本地 Key，留空则保持不变' : '输入新的 API Key'}
            />
          </label>

          <div className="gemini-settings-help">
            <p>桌面版、PWA、开发态推荐填写 `/api/gemini`，由本地代理统一转发请求。</p>
            <p>纯静态 Web 部署请填写允许当前页面跨域访问的 Gemini 或自建网关地址。</p>
            <p>API Key 只保存在本机当前客户端，不会回显，也不会写入服务端配置文件。</p>
          </div>

          {error ? <p className="gemini-settings-message is-error">{error}</p> : null}
          {!error && notice ? <p className="gemini-settings-message is-success">{notice}</p> : null}

          <div className="gemini-settings-actions">
            <button type="submit">保存</button>
            <button type="button" className="is-secondary" onClick={handleClearApiKey}>
              清除已保存 Key
            </button>
            <button type="button" className="is-secondary" onClick={handleReset}>
              恢复默认连接配置
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
