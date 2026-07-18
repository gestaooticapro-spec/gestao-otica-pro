'use strict'

const path = require('path')
const { app, BrowserWindow, ipcMain, net, shell } = require('electron')

const DEFAULT_RENDERER_URL = 'http://localhost:3000/torre/inicial'

function isEnabled(value) {
  return value === '1' || value === 'true'
}

function getRendererUrl() {
  const configuredUrl = process.env.TOWER_ELECTRON_URL?.trim()
  const rendererUrl = new URL(configuredUrl || DEFAULT_RENDERER_URL)

  if (!['http:', 'https:'].includes(rendererUrl.protocol)) {
    throw new Error('TOWER_ELECTRON_URL deve usar http ou https.')
  }

  const isLocalAddress = ['localhost', '127.0.0.1', '::1'].includes(
    rendererUrl.hostname,
  )

  if (rendererUrl.protocol === 'http:' && !isLocalAddress) {
    throw new Error('Enderecos remotos da Torre devem usar https.')
  }

  return rendererUrl
}

function isAllowedNavigation(navigationUrl, rendererUrl) {
  try {
    return new URL(navigationUrl).origin === rendererUrl.origin
  } catch {
    return false
  }
}

function isAllowedOrigin(requestingOrigin, rendererUrl) {
  try {
    return new URL(requestingOrigin).origin === rendererUrl.origin
  } catch {
    return false
  }
}

function isAllowedCameraRequest(webContents, permission, details, mainWindow, rendererUrl) {
  const securityOrigin = details.securityOrigin || details.requestingUrl || ''
  const mediaTypes = details.mediaTypes || (details.mediaType ? [details.mediaType] : [])

  return webContents?.id === mainWindow.webContents.id
    && permission === 'media'
    && details.isMainFrame !== false
    && isAllowedOrigin(securityOrigin, rendererUrl)
    && mediaTypes.length === 1
    && mediaTypes[0] === 'video'
}

function createMainWindow() {
  const rendererUrl = getRendererUrl()
  const kioskEnabled = isEnabled(process.env.TOWER_KIOSK)
  const devToolsEnabled = !app.isPackaged || isEnabled(process.env.TOWER_DEVTOOLS)

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    kiosk: kioskEnabled,
    fullscreen: kioskEnabled,
    autoHideMenuBar: true,
    backgroundColor: '#020617',
    title: 'Torre - Gestao Otica',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      devTools: devToolsEnabled,
    },
  })

  mainWindow.removeMenu()

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedNavigation(navigationUrl, rendererUrl)) {
      event.preventDefault()
    }
  })

  mainWindow.webContents.on('will-redirect', (event, navigationUrl) => {
    if (!isAllowedNavigation(navigationUrl, rendererUrl)) {
      event.preventDefault()
    }
  })

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      callback(isAllowedCameraRequest(
        webContents,
        permission,
        details,
        mainWindow,
        rendererUrl,
      ))
    },
  )
  mainWindow.webContents.session.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) => (
      isAllowedCameraRequest(
        webContents,
        permission,
        { ...details, securityOrigin: details.securityOrigin || requestingOrigin },
        mainWindow,
        rendererUrl,
      )
    ),
  )

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (isMainFrame) {
        console.error(
          `[Torre Electron] Falha ao carregar ${validatedUrl}: ${errorCode} ${errorDescription}`,
        )
      }
    },
  )

  mainWindow.loadURL(rendererUrl.toString())

  return mainWindow
}

function registerDesktopHandlers() {
  ipcMain.handle('tower:get-network-status', () => ({
    online: net.isOnline(),
  }))

  ipcMain.handle('tower:open-network-settings', async () => {
    if (process.platform !== 'win32') {
      return {
        success: false,
        message: 'As configuracoes de rede so podem ser abertas automaticamente no Windows.',
      }
    }

    try {
      await shell.openExternal('ms-settings:network-wifi')
      return { success: true }
    } catch (error) {
      console.error('[Torre Electron] Falha ao abrir as configuracoes de rede:', error)
      return {
        success: false,
        message: 'Nao foi possivel abrir as configuracoes de rede do Windows.',
      }
    }
  })
}

app.enableSandbox()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [mainWindow] = BrowserWindow.getAllWindows()
    if (!mainWindow) return

    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    registerDesktopHandlers()
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
