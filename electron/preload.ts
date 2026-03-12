import { contextBridge } from 'electron'

const readArgument = (prefix: string) =>
  process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length)

const apiBaseUrl = readArgument('--canvas-api-base-url=') || 'http://127.0.0.1:45123'

contextBridge.exposeInMainWorld('canvasDesktop', {
  runtimeTarget: 'desktop',
  apiBaseUrl,
})
