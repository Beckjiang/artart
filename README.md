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

## 校验

```bash
npm test
npm run build
```

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

## 下一步建议

1. 引入后端（`Fastify/Nest + PostgreSQL`）做账号与跨端同步
2. 引入 `Yjs + Hocuspocus` 支持多人实时协作
3. 增加导入导出（`tldraw` snapshot / png / svg）
4. 增加权限和分享链接能力
