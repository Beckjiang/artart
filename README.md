# Canvas MVP (tldraw)

一个从 `tldraw` 起步的画布应用 MVP，目标是先把核心闭环跑通，再逐步扩展协作和 AI 能力。

## 已实现

- 画布列表页（本地文档管理）
- 新建画布
- 打开画布并进入 `tldraw` 编辑
- 自动本地保存（基于 `persistenceKey`）
- 画布重命名
- 画布删除
- 底部恢复横向工具栏，并新增 `Image Generator` 入口
- 点击 `Image Generator` 后会在画布中心插入一个生成卡片，可直接在画布中输入提示词文生图
- 选中单张普通图片时，右侧侧栏保留图生图/编辑能力，结果默认插入在参考图右侧
- 选中多个元素且至少包含一张普通图片时，选区下方会出现 `imagine` 按钮，可将整组选区合成为参考图发起图生图，结果尺寸跟随选中的第一张普通图片
- 生成任务队列（串行执行）
- 支持取消任务（运行中/排队中）
- 支持失败或取消后的重试

## 技术栈

- React 19 + TypeScript
- Vite 7
- tldraw 4
- react-router-dom 7
- localStorage（MVP 阶段存储）

## 启动

```bash
npm install
npm run dev
```

默认开发地址：

- [http://localhost:5173](http://localhost:5173)

## 桌面端（Electron）

已支持把当前项目打包为 macOS 桌面应用，保留现有 React/tldraw UI，并在桌面版内置本地 HTTP 服务承载：

- `/api/agent/*` 本地 Agent 接口
- `/api/local-debug/*` 调试写盘接口
- `/api/gemini/*` 本地 Gemini 代理

### 桌面开发

```bash
npm install
npm run dev:desktop
```

桌面开发态会：

- 启动 Vite 开发服务器（固定 `http://127.0.0.1:5173`）
- 构建 Electron `main/preload`
- 用 Electron 加载当前前端页面

### 桌面打包

```bash
npm run build:desktop
```

默认会生成：

- `dist-desktop/Canvas-0.0.0-arm64-mac.zip`
- `dist-desktop/Canvas-0.0.0-arm64.dmg`

### 桌面版配置

桌面版优先从环境变量读取配置；如果没有，也会读取用户数据目录下的 `config.json`。

macOS 常见路径：

- `~/Library/Application Support/Canvas/config.json`

示例：

```json
{
  "GEMINI_API_KEY": "your_key",
  "VITE_GEMINI_BASE_URL": "https://generativelanguage.googleapis.com",
  "OPENAI_API_KEY": "your_openai_key"
}
```

说明：

- 桌面版渲染进程不再要求直接持有 Gemini key，而是统一走本地 `/api/gemini` 代理。
- Agent 数据库与 payload 会写入桌面应用的 `userData/.data/`。
- 调试图片与 API 调用归档会写入桌面应用的 `userData/debug-image-io/`。

## 校验

```bash
npm test
npm run build
```

## PWA（iPad/移动端）

当前 Web 版已支持作为 PWA 安装到 iPad（以及其他移动端/桌面端浏览器），并针对窄屏做了交互重排：

- iPad 竖屏/窄屏：底部工具栏收敛为一个 FAB（圆形扇形菜单）；右侧 Chat 变为覆盖式抽屉（默认收起，可随时呼出）。
- iPad 横屏/宽屏：保留原工具栏 + 右侧停靠侧栏；侧栏支持收起，并在收起时提供一个浮动 `Chat` 按钮重新打开。

### 构建与运行（同源 API，避免 CORS）

PWA 要让 Chat 真正可用，需要同源后端同时提供：

- 静态资源（`dist/`）
- `/api/agent/*`（会话/SSE）
- `/api/gemini/*`（Gemini 代理）

项目内置了一个可部署的 Node 服务入口 `server/pwaServer.ts`，可直接承载上述内容。

```bash
npm install
npm run build:pwa
npm run start:pwa
```

默认监听：`http://127.0.0.1:45123`

> 提示：如果你要在局域网用 iPad 访问，请设置 `CANVAS_HOST=0.0.0.0`，并使用电脑的局域网 IP 访问；若要“添加到主屏幕”并启用 Service Worker，一般需要 HTTPS（`localhost` 例外）。

### 环境变量（PWA Server）

- `CANVAS_HOST`：监听地址，默认 `127.0.0.1`
- `CANVAS_PORT`：监听端口，默认 `45123`
- `CANVAS_STATIC_DIR`：静态目录，默认 `<repo>/dist`
- `CANVAS_DATA_ROOT`：数据目录，默认 `<repo>/.data`
- `CANVAS_CONFIG_PATH`：配置文件路径，默认 `<dataRoot>/config.json`
- `CANVAS_ENABLE_LOCAL_DEBUG=1`：显式开启 `/api/local-debug/*`（写盘调试接口）

安全说明：

- PWA server 的 `/api/local-debug/*` 在 `NODE_ENV=production` 时默认关闭，避免把写盘接口暴露到公网。
- 仅当设置 `CANVAS_ENABLE_LOCAL_DEBUG=1`（或 `true`）时才会启用。

### iPad 安装指引（Safari）

1. 用 Safari 打开你的站点（推荐 HTTPS 域名，或本机 `localhost`）。
2. 点击分享按钮（Share）。
3. 选择 “Add to Home Screen / 添加到主屏幕”。
4. 从主屏幕打开后会以 `standalone` 模式运行（更接近 App 体验）。

## 当前数据结构

- 画布元数据：`localStorage["canvas:mvp:boards"]`
- 单个画布文档：`localStorage["canvas:mvp:board:<id>"]`

## 生图接口配置（Gemini API）

在项目根目录创建 `.env.local`：

```bash
VITE_GEMINI_API_KEY=your_key
VITE_GEMINI_BASE_URL=/api/gemini
VITE_GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview
VITE_GEMINI_IMAGE_SIZE=2K
```

`VITE_GEMINI_BASE_URL` 既可以填代理路径，也可以直接填域名：

- 本地开发推荐：`/api/gemini`
- 直连自建网关域名：`http://zx2.52youxi.cc:3000`
- 直连官方也可以：`https://generativelanguage.googleapis.com`

当只填写域名时，前端会自动补成 `/v1beta`，也就是实际请求：

- `http://zx2.52youxi.cc:3000/v1beta/models/{model}:generateContent`

说明：

- 文生图与图生图都统一走 Gemini 原生接口：
  - `POST /v1beta/models/{model}:generateContent`
  - 通过 `contents[].parts` 传入文本提示词与参考图
  - 通过 `generationConfig.responseModalities = ["TEXT", "IMAGE"]` 请求图片输出
- 图生图会先把参考图转成 PNG，再以内联图片数据发送给 Gemini，减少跨域和图片格式兼容问题。
- 开发环境默认通过 Vite 代理 `/api/gemini -> https://generativelanguage.googleapis.com/v1beta`，减少浏览器 CORS 问题。
- 为了平滑迁移，旧的 `VITE_UNIAPI_*` 环境变量名和 `/api/uniapi` 本地代理路径仍会自动映射到 Gemini。

## 画图 API 调用日志（提示词/请求/响应可追踪）

开发时默认会记录所有生图/画图外部 API 调用（Gemini `generateContent` + OpenAI/UniAPI `images/generations`），便于你复盘和优化提示词。

- 控制台：会输出 `[image-api] request` / `[image-api] completed`，其中 `prompt.final` 就是最终发出去的提示词。
- 落盘：会追加写入到 `debug-image-io/YYYYMMDD/<runId>/api-calls.json`（与 debug 图片同目录归档）。
- 脱敏与体积控制：
  - 任何 API key / Authorization header 均会被替换为 `<redacted>`
  - 图片 base64（Gemini `inlineData.data` / `inline_data.data`、OpenAI `b64_json` 等）会被替换为 `<omitted base64 length=N>`
- 开关：
  - 默认：开发环境开启；测试环境关闭；生产环境（Node）默认关闭
  - 强制开启/关闭：设置 `VITE_DEBUG_IMAGE_API_LOG=1` 或 `VITE_DEBUG_IMAGE_API_LOG=0`

说明：浏览器侧的落盘依赖本地 Vite debug endpoint；如果是纯静态部署，落盘会 best-effort 失败但不影响生图流程（仍保留控制台日志）。

## 下一步建议

1. 引入后端（`Fastify/Nest + PostgreSQL`）做账号与跨端同步
2. 引入 `Yjs + Hocuspocus` 支持多人实时协作
3. 增加导入导出（`tldraw` snapshot / png / svg）
4. 增加权限和分享链接能力
