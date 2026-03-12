import { createServer, type Server as HttpServer } from 'node:http'
import path from 'node:path'
import { app, BrowserWindow, dialog } from 'electron'
import { createLocalApiHandler } from '../server/localApi'

const DESKTOP_SERVER_HOST = '127.0.0.1'
const DESKTOP_SERVER_PORT = 45123
const DEFAULT_DEV_SERVER_URL = 'http://127.0.0.1:5173'

let mainWindow: BrowserWindow | null = null
let localServer: HttpServer | null = null

const isDevelopment = !app.isPackaged

const getRendererUrl = () => `http://${DESKTOP_SERVER_HOST}:${DESKTOP_SERVER_PORT}`

const getPreloadPath = () => path.join(__dirname, 'preload.cjs')

const getStaticDir = () => path.resolve(__dirname, '../dist')

const getDesktopConfigPath = () => path.join(app.getPath('userData'), 'config.json')

const stopLocalServer = async () => {
  if (!localServer) return

  await new Promise<void>((resolve, reject) => {
    localServer?.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
  localServer = null
}

const startLocalServer = async () => {
  if (localServer) {
    return getRendererUrl()
  }

  const handler = createLocalApiHandler({
    mode: 'desktop',
    dataRoot: app.getPath('userData'),
    configFilePath: getDesktopConfigPath(),
    envFileDir: process.cwd(),
    staticDir: getStaticDir(),
  })

  const server = createServer((req, res) => {
    void handler(req, res, () => {
      if (!res.writableEnded) {
        res.statusCode = 404
        res.end('Not Found')
      }
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(DESKTOP_SERVER_PORT, DESKTOP_SERVER_HOST, () => {
      resolve()
    })
  })

  localServer = server
  return getRendererUrl()
}

const createMainWindow = async () => {
  const rendererUrl = isDevelopment
    ? process.env.CANVAS_DESKTOP_DEV_SERVER_URL?.trim() || DEFAULT_DEV_SERVER_URL
    : await startLocalServer()

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      additionalArguments: [`--canvas-api-base-url=${rendererUrl}`],
    },
  })

  window.once('ready-to-show', () => {
    window.show()
  })

  await window.loadURL(rendererUrl)

  if (isDevelopment) {
    window.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow = window
}

const focusMainWindow = () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.focus()
}

const showStartupError = async (error: unknown) => {
  const message = error instanceof Error ? error.message : 'desktop_startup_failed'
  const portInUse =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EADDRINUSE'

  if (portInUse) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Canvas 启动失败',
      message: `本地桌面服务端口 ${DESKTOP_SERVER_PORT} 已被占用，应用无法启动。`,
      detail: message,
    })
    return
  }

  await dialog.showMessageBox({
    type: 'error',
    title: 'Canvas 启动失败',
    message: '桌面应用启动失败。',
    detail: message,
  })
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    focusMainWindow()
  })

  app.whenReady().then(async () => {
    try {
      await createMainWindow()
    } catch (error) {
      await showStartupError(error)
      app.quit()
    }

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        try {
          await createMainWindow()
        } catch (error) {
          await showStartupError(error)
          app.quit()
        }
        return
      }

      focusMainWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void stopLocalServer()
})
