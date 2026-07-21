'use strict'

const path = require('path')
const os = require('os')
const fs = require('fs/promises')
const { createHash } = require('crypto')
const { app, BrowserWindow, ipcMain, net, safeStorage, screen, shell } = require('electron')
const { TowerLocalDatabase } = require('./tower-local-database.cjs')
const packageMetadata = require('../package.json')

const DEVELOPMENT_RENDERER_URL = 'http://localhost:3000/torre/inicial'
const PACKAGED_RENDERER_URL = packageMetadata.tower?.productionUrl
const DEVICE_CREDENTIAL_PATTERN = /^tower_device_v1_[A-Za-z0-9_-]{43}$/
const ASSET_CREDENTIAL_PATTERN = /^tower_asset_v1_[A-Za-z0-9_-]{43}$/
const ASSET_PUBLIC_CODE_PATTERN = /^MBT-[0-9]{4}-[0-9]{6}$/
const DEVICE_SESSION_FILE = 'tower-device-session.v1.json'
const ASSET_IDENTITY_FILE = 'tower-asset-identity.v1.json'
const LOCAL_DATABASE_FILE = 'tower-local.v1.sqlite3'

let inMemoryDeviceSession = null
let inMemoryAssetIdentity = null
let customerDisplayWindow = null
let primaryWindow = null
let webSessionRefreshTimer = null
let inMemoryMaintenanceGrant = null
let towerLocalDatabase = null
let towerSyncTimer = null
let towerSyncPromise = null
let towerConfigurationTimer = null
let towerConfigurationPromise = null

function isValidDeviceSession(session) {
  return Boolean(
    session
    && typeof session === 'object'
    && typeof session.deviceId === 'string'
    && /^[0-9a-f-]{36}$/i.test(session.deviceId)
    && typeof session.assetId === 'string'
    && /^[0-9a-f-]{36}$/i.test(session.assetId)
    && typeof session.publicCode === 'string'
    && ASSET_PUBLIC_CODE_PATTERN.test(session.publicCode)
    && typeof session.tenantId === 'string'
    && /^[0-9a-f-]{36}$/i.test(session.tenantId)
    && Number.isSafeInteger(session.storeId)
    && session.storeId > 0
    && typeof session.deviceCredential === 'string'
    && DEVICE_CREDENTIAL_PATTERN.test(session.deviceCredential)
    && typeof session.deviceLabel === 'string'
    && session.deviceLabel.trim().length >= 2
    && session.deviceLabel.trim().length <= 120
    && typeof session.pairedAt === 'string'
    && !Number.isNaN(Date.parse(session.pairedAt)),
  )
}

function isValidAssetIdentity(identity) {
  return Boolean(
    identity
    && typeof identity === 'object'
    && typeof identity.assetId === 'string'
    && /^[0-9a-f-]{36}$/i.test(identity.assetId)
    && typeof identity.publicCode === 'string'
    && ASSET_PUBLIC_CODE_PATTERN.test(identity.publicCode)
    && typeof identity.assetCredential === 'string'
    && ASSET_CREDENTIAL_PATTERN.test(identity.assetCredential)
    && typeof identity.enrolledAt === 'string'
    && !Number.isNaN(Date.parse(identity.enrolledAt)),
  )
}

function getDeviceSessionPath() {
  return path.join(app.getPath('userData'), DEVICE_SESSION_FILE)
}

function getAssetIdentityPath() {
  return path.join(app.getPath('userData'), ASSET_IDENTITY_FILE)
}

function getLocalDatabasePath() {
  return path.join(app.getPath('userData'), LOCAL_DATABASE_FILE)
}

function getLocalScope(session) {
  return {
    tenantId: session.tenantId,
    storeId: session.storeId,
    deviceId: session.deviceId,
    assetId: session.assetId,
  }
}

function getHardwareSnapshot() {
  return {
    schemaVersion: 1,
    platform: process.platform,
    hostname: os.hostname(),
    displays: screen.getAllDisplays().map(serializeDisplay).map((display) => ({
      id: display.id,
      primary: display.primary,
      internal: display.internal,
      rotation: display.rotation,
      scaleFactor: display.scaleFactor,
      bounds: display.bounds,
    })),
  }
}

function getHardwareFingerprint(snapshot = getHardwareSnapshot()) {
  return createHash('sha256').update(JSON.stringify(snapshot), 'utf8').digest('hex')
}

function protectLocalPayload(payload) {
  if (!safeStorage.isEncryptionAvailable()) return { payload, encoding: 'json' }
  return {
    payload: safeStorage.encryptString(payload).toString('base64'),
    encoding: 'safe_storage_v1',
  }
}

function unprotectLocalPayload(payload, encoding) {
  if (encoding === 'json') return payload
  if (encoding !== 'safe_storage_v1' || !safeStorage.isEncryptionAvailable()) {
    throw new Error('Nao foi possivel abrir a fila local protegida.')
  }
  return safeStorage.decryptString(Buffer.from(payload, 'base64'))
}

function encryptLocalCustomerPayload(payload) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('A protecao segura do Windows nao esta disponivel.')
  }
  return safeStorage.encryptString(JSON.stringify(payload)).toString('base64')
}

async function persistAssetIdentity(identity) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('A protecao segura do sistema operacional nao esta disponivel.')
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(identity))
  await writeProtectedFile(getAssetIdentityPath(), JSON.stringify({
    version: 1,
    encryptedIdentity: encrypted.toString('base64'),
  }))
}

async function restoreAssetIdentity() {
  if (inMemoryAssetIdentity) return inMemoryAssetIdentity
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    const envelope = JSON.parse(await fs.readFile(getAssetIdentityPath(), 'utf8'))
    if (envelope?.version !== 1 || typeof envelope.encryptedIdentity !== 'string') return null
    const identity = JSON.parse(safeStorage.decryptString(Buffer.from(envelope.encryptedIdentity, 'base64')))
    if (!isValidAssetIdentity(identity)) return null
    inMemoryAssetIdentity = Object.freeze(identity)
    return inMemoryAssetIdentity
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error('[Torre Electron] Falha ao restaurar identidade fisica:', error)
    return null
  }
}

async function persistDeviceSession(session) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('A protecao segura do sistema operacional nao esta disponivel.')
  }

  const encrypted = safeStorage.encryptString(JSON.stringify(session))
  const envelope = JSON.stringify({
    version: 1,
    encryptedSession: encrypted.toString('base64'),
  })

  await writeProtectedFile(getDeviceSessionPath(), envelope)
}

async function writeProtectedFile(targetPath, contents) {
  const temporaryPath = `${targetPath}.${process.pid}.tmp`
  try {
    await fs.writeFile(temporaryPath, contents, { encoding: 'utf8', mode: 0o600 })
    await fs.rename(temporaryPath, targetPath)
  } catch (error) {
    try {
      await fs.unlink(temporaryPath)
    } catch (cleanupError) {
      if (cleanupError?.code !== 'ENOENT') {
        console.error('[Torre Electron] Falha ao limpar arquivo temporario:', cleanupError)
      }
    }
    throw error
  }
}

async function clearAssetIdentity() {
  try {
    await fs.unlink(getAssetIdentityPath())
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  inMemoryAssetIdentity = null
}

async function clearDeviceSession() {
  try {
    await fs.unlink(getDeviceSessionPath())
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  inMemoryDeviceSession = null
  inMemoryMaintenanceGrant = null
}

async function restoreDeviceSession() {
  if (inMemoryDeviceSession) return inMemoryDeviceSession
  if (!safeStorage.isEncryptionAvailable()) return null

  try {
    const envelope = JSON.parse(await fs.readFile(getDeviceSessionPath(), 'utf8'))
    if (envelope?.version !== 1 || typeof envelope.encryptedSession !== 'string') {
      throw new Error('Formato de sessao local desconhecido.')
    }

    const decrypted = safeStorage.decryptString(
      Buffer.from(envelope.encryptedSession, 'base64'),
    )
    const restoredSession = JSON.parse(decrypted)
    if (!isValidDeviceSession(restoredSession)) {
      throw new Error('Sessao local invalida.')
    }

    inMemoryDeviceSession = Object.freeze(restoredSession)
    return inMemoryDeviceSession
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error('[Torre Electron] Falha ao restaurar a sessao protegida:', error)
    }
    return null
  }
}

function isEnabled(value) {
  return value === '1' || value === 'true'
}

function getRendererUrl() {
  const configuredUrl = process.env.TOWER_ELECTRON_URL?.trim()
  const defaultUrl = app.isPackaged ? PACKAGED_RENDERER_URL : DEVELOPMENT_RENDERER_URL
  if (!configuredUrl && !defaultUrl) {
    throw new Error('URL de producao da Torre nao configurada.')
  }
  const rendererUrl = new URL(configuredUrl || defaultUrl)

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

function packagedFeatureEnabled(environmentValue, packagedDefault) {
  if (environmentValue === undefined || environmentValue === null || environmentValue === '') {
    return app.isPackaged ? packagedDefault : false
  }
  return isEnabled(environmentValue)
}

function isAllowedNavigation(navigationUrl, rendererUrl) {
  try {
    const target = new URL(navigationUrl)
    return target.origin === rendererUrl.origin
      && (target.pathname === '/torre' || target.pathname.startsWith('/torre/'))
  } catch {
    return false
  }
}

function returnToTowerLanding(mainWindow, rendererUrl) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const landingUrl = new URL('/torre/inicial', rendererUrl).toString()
  if (mainWindow.webContents.getURL() === landingUrl) return
  setTimeout(() => {
    if (!mainWindow.isDestroyed()) {
      void mainWindow.loadURL(landingUrl).catch((error) => {
        console.error('[Torre Electron] Falha ao retornar para a tela segura:', error)
      })
    }
  }, 0)
}

function isTrustedIpcSender(event, allowedPaths) {
  if (!primaryWindow || primaryWindow.isDestroyed()) return false
  if (event.sender.id !== primaryWindow.webContents.id) return false

  try {
    const rendererUrl = getRendererUrl()
    const senderUrl = new URL(event.senderFrame.url)
    const exactPath = allowedPaths.includes(senderUrl.pathname)
    const prefixPath = allowedPaths.some((allowedPath) => (
      allowedPath.endsWith('*')
      && senderUrl.pathname.startsWith(allowedPath.slice(0, -1))
    ))
    return senderUrl.origin === rendererUrl.origin && (exactPath || prefixPath)
  } catch {
    return false
  }
}

function secureHandle(channel, allowedPaths, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedIpcSender(event, allowedPaths)) {
      console.warn(`[Torre Electron] IPC rejeitado: ${channel}`)
      return { success: false, message: 'Operacao local nao autorizada.' }
    }
    return handler(...args)
  })
}

async function requestTowerApi(pathname, options = {}) {
  const endpoint = new URL(pathname, getRendererUrl())
  const response = await net.fetch(endpoint.toString(), {
    ...options,
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  })
  const raw = await response.text()
  if (raw.length > 64 * 1024) throw new Error('Resposta da Torre excedeu o limite seguro.')
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('Resposta invalida do servidor da Torre.')
  }
  return { status: response.status, ok: response.ok, data }
}

async function syncTowerOutbox() {
  if (!towerLocalDatabase || !net.isOnline()) {
    return towerLocalDatabase?.getSyncStatus() || { pending: 0, synced: 0, lastSyncedAt: null }
  }
  if (towerSyncPromise) return towerSyncPromise

  towerSyncPromise = performTowerOutboxSync()
  try {
    return await towerSyncPromise
  } finally {
    towerSyncPromise = null
  }
}

async function performTowerOutboxSync() {
  const deviceSession = await restoreDeviceSession()
  if (!deviceSession) return towerLocalDatabase.getSyncStatus()
  const events = towerLocalDatabase.getPendingEvents(20)
  if (events.length === 0) return towerLocalDatabase.getSyncStatus()

  try {
    const result = await requestTowerApi('/api/tower/device/sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deviceSession.deviceCredential}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ events }),
    })
    const acknowledged = Array.isArray(result.data?.acknowledgedEventIds)
      ? result.data.acknowledgedEventIds
      : []
    towerLocalDatabase.applySyncResults(result.data?.eventResults)
    towerLocalDatabase.markEventsSynced(acknowledged)

    const acknowledgedSet = new Set(acknowledged)
    const failedIds = events
      .map((event) => event.eventId)
      .filter((eventId) => !acknowledgedSet.has(eventId))
    if (!result.ok || !result.data?.success) {
      towerLocalDatabase.markEventsFailed(failedIds, result.data?.message)
    }
  } catch (error) {
    towerLocalDatabase.markEventsFailed(
      events.map((event) => event.eventId),
      error instanceof Error ? error.message : 'Falha de comunicacao.',
    )
  }
  return towerLocalDatabase.getSyncStatus()
}

function scheduleTowerOutboxSync() {
  if (towerSyncTimer) clearInterval(towerSyncTimer)
  towerSyncTimer = setInterval(() => {
    void syncTowerOutbox()
  }, 30 * 1000)
}

function requestTowerOutboxSync() {
  setTimeout(() => {
    void syncTowerOutbox()
  }, 0)
}

async function syncTowerConfiguration() {
  if (!towerLocalDatabase || !net.isOnline()) return null
  if (towerConfigurationPromise) return towerConfigurationPromise

  towerConfigurationPromise = (async () => {
    const deviceSession = await restoreDeviceSession()
    if (!deviceSession) return null
    const result = await requestTowerApi('/api/tower/device/configuration', {
      headers: { Authorization: `Bearer ${deviceSession.deviceCredential}` },
    })
    if (!result.ok || !result.data?.success || !result.data?.snapshot) {
      throw new Error(result.data?.message || 'Nao foi possivel atualizar a configuracao local.')
    }
    return towerLocalDatabase.saveConfigurationSnapshot(
      getLocalScope(deviceSession), result.data.snapshot,
    )
  })()

  try {
    return await towerConfigurationPromise
  } finally {
    towerConfigurationPromise = null
  }
}

function scheduleTowerConfigurationSync() {
  if (towerConfigurationTimer) clearInterval(towerConfigurationTimer)
  towerConfigurationTimer = setInterval(() => {
    void syncTowerConfiguration().catch((error) => {
      console.error('[Torre Electron] Falha ao atualizar configuracao local:', error)
    })
  }, 5 * 60 * 1000)
  towerConfigurationTimer.unref?.()
}

function requestTowerConfigurationSync() {
  setTimeout(() => {
    void syncTowerConfiguration().catch((error) => {
      console.error('[Torre Electron] Falha ao atualizar configuracao local:', error)
    })
  }, 0)
}

async function bootstrapTowerWebSession(browserSession, deviceSession) {
  const result = await requestTowerApi('/api/tower/device/web-session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${deviceSession.deviceCredential}` },
  })
  if (!result.ok || !result.data?.success
      || typeof result.data.token !== 'string'
      || !Number.isSafeInteger(result.data.expiresAt)
      || result.data.storeId !== deviceSession.storeId) {
    throw new Error('O servidor nao emitiu uma sessao web valida para a Torre.')
  }

  const rendererUrl = getRendererUrl()
  await browserSession.cookies.set({
    url: rendererUrl.origin,
    name: 'tower_device_web_session_v1',
    value: result.data.token,
    path: '/',
    httpOnly: true,
    secure: rendererUrl.protocol === 'https:',
    sameSite: 'strict',
    expirationDate: result.data.expiresAt,
  })
}

function scheduleTowerWebSessionRefresh(browserSession) {
  if (webSessionRefreshTimer) clearInterval(webSessionRefreshTimer)
  webSessionRefreshTimer = setInterval(async () => {
    const deviceSession = await restoreDeviceSession()
    if (!deviceSession) return
    try {
      await bootstrapTowerWebSession(browserSession, deviceSession)
    } catch (error) {
      console.error('[Torre Electron] Falha ao renovar sessao web:', error)
    }
  }, 10 * 60 * 1000)
  webSessionRefreshTimer.unref?.()
}

function publicAssetIdentity(identity) {
  return identity ? {
    assetId: identity.assetId,
    publicCode: identity.publicCode,
    enrolledAt: identity.enrolledAt,
  } : null
}

function publicDeviceSession(session) {
  return session ? {
    deviceId: session.deviceId,
    assetId: session.assetId,
    publicCode: session.publicCode,
    tenantId: session.tenantId,
    storeId: session.storeId,
    deviceLabel: session.deviceLabel,
    pairedAt: session.pairedAt,
  } : null
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
  const isMainWindow = webContents?.id === mainWindow.webContents.id
  const isCustomerWindow = Boolean(
    customerDisplayWindow
    && !customerDisplayWindow.isDestroyed()
    && webContents?.id === customerDisplayWindow.webContents.id
    && (() => {
      try {
        const currentUrl = new URL(customerDisplayWindow.webContents.getURL())
        return isAllowedNavigation(currentUrl.toString(), rendererUrl)
          && currentUrl.searchParams.get('client') === '1'
      } catch {
        return false
      }
    })(),
  )

  return (isMainWindow || isCustomerWindow)
    && permission === 'media'
    && details.isMainFrame !== false
    && isAllowedOrigin(securityOrigin, rendererUrl)
    && mediaTypes.length === 1
    && mediaTypes[0] === 'video'
}

async function createMainWindow() {
  const rendererUrl = getRendererUrl()
  const kioskEnabled = packagedFeatureEnabled(process.env.TOWER_KIOSK, true)
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
      returnToTowerLanding(mainWindow, rendererUrl)
    }
  })

  mainWindow.webContents.on('will-redirect', (event, navigationUrl) => {
    if (!isAllowedNavigation(navigationUrl, rendererUrl)) {
      event.preventDefault()
      returnToTowerLanding(mainWindow, rendererUrl)
    }
  })

  mainWindow.webContents.on('did-navigate-in-page', (_event, navigationUrl, isMainFrame) => {
    if (isMainFrame && !isAllowedNavigation(navigationUrl, rendererUrl)) {
      returnToTowerLanding(mainWindow, rendererUrl)
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

  let initialUrl = rendererUrl
  const restoredSession = await restoreDeviceSession()
  if (restoredSession) {
    try {
      await bootstrapTowerWebSession(mainWindow.webContents.session, restoredSession)
      scheduleTowerWebSessionRefresh(mainWindow.webContents.session)
      if (!process.env.TOWER_ELECTRON_URL?.trim()
          || rendererUrl.pathname === '/torre/inicial') {
        initialUrl = new URL(`/torre/${restoredSession.storeId}`, rendererUrl)
      }
    } catch (error) {
      console.error('[Torre Electron] Falha ao preparar sessao web:', error)
    }
  }

  await mainWindow.loadURL(initialUrl.toString())
  mainWindow.on('closed', () => {
    if (primaryWindow === mainWindow) primaryWindow = null
  })

  return mainWindow
}

function serializeDisplay(display) {
  return {
    id: String(display.id),
    label: display.label || `Monitor ${display.id}`,
    primary: display.id === screen.getPrimaryDisplay().id,
    internal: Boolean(display.internal),
    rotation: display.rotation,
    scaleFactor: display.scaleFactor,
    bounds: { ...display.bounds },
    workArea: { ...display.workArea },
    orientation: display.bounds.height > display.bounds.width ? 'portrait' : 'landscape',
  }
}

async function openCustomerDisplayTest() {
  const displays = screen.getAllDisplays()
  const primaryDisplay = screen.getPrimaryDisplay()
  const customerDisplay = displays.find((display) => display.id !== primaryDisplay.id)

  if (!customerDisplay) {
    return {
      success: false,
      message: 'Conecte a segunda tela para iniciar o teste do cliente.',
    }
  }

  if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
    customerDisplayWindow.focus()
    return { success: true, display: serializeDisplay(customerDisplay) }
  }

  const rendererUrl = getRendererUrl()
  const customerUrl = new URL('/torre/cliente/diagnostico', rendererUrl)
  const kioskEnabled = packagedFeatureEnabled(process.env.TOWER_KIOSK, true)
  customerDisplayWindow = new BrowserWindow({
    ...customerDisplay.bounds,
    show: false,
    frame: !kioskEnabled,
    fullscreen: kioskEnabled,
    autoHideMenuBar: true,
    alwaysOnTop: kioskEnabled,
    backgroundColor: '#020617',
    title: 'Torre - Tela do Cliente',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      devTools: !app.isPackaged || isEnabled(process.env.TOWER_DEVTOOLS),
    },
  })

  customerDisplayWindow.removeMenu()
  customerDisplayWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  customerDisplayWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedNavigation(navigationUrl, rendererUrl)) event.preventDefault()
  })
  customerDisplayWindow.webContents.on('will-redirect', (event, navigationUrl) => {
    if (!isAllowedNavigation(navigationUrl, rendererUrl)) event.preventDefault()
  })
  customerDisplayWindow.once('ready-to-show', () => customerDisplayWindow?.show())
  customerDisplayWindow.on('closed', () => {
    customerDisplayWindow = null
  })
  await customerDisplayWindow.loadURL(customerUrl.toString())

  return { success: true, display: serializeDisplay(customerDisplay) }
}

async function openCustomerExperience(requestedUrl, deviceSession) {
  const rendererUrl = getRendererUrl()
  let customerUrl
  try {
    customerUrl = new URL(requestedUrl, rendererUrl)
  } catch {
    return { success: false, message: 'Endereco da experiencia invalido.' }
  }

  const storePrefix = `/torre/${deviceSession.storeId}/`
  if (customerUrl.origin !== rendererUrl.origin
      || !customerUrl.pathname.startsWith(storePrefix)
      || customerUrl.searchParams.get('client') !== '1'
      || customerUrl.pathname.includes('/configuracao')
      || customerUrl.pathname.includes('/admin')) {
    return { success: false, message: 'Experiencia do cliente nao autorizada para esta Torre.' }
  }

  const displays = screen.getAllDisplays()
  const primaryDisplay = screen.getPrimaryDisplay()
  const customerDisplay = displays.find((display) => display.id !== primaryDisplay.id)
  const simulated = !customerDisplay
  const targetBounds = customerDisplay?.bounds || {
    width: Math.min(540, primaryDisplay.workArea.width),
    height: Math.min(900, primaryDisplay.workArea.height),
    x: primaryDisplay.workArea.x + Math.max(0, primaryDisplay.workArea.width - Math.min(540, primaryDisplay.workArea.width)),
    y: primaryDisplay.workArea.y,
  }

  if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
    await customerDisplayWindow.loadURL(customerUrl.toString())
    customerDisplayWindow.focus()
    return {
      success: true,
      simulated,
      display: serializeDisplay(customerDisplay || primaryDisplay),
    }
  }

  const kioskEnabled = packagedFeatureEnabled(process.env.TOWER_KIOSK, true) && !simulated
  customerDisplayWindow = new BrowserWindow({
    ...targetBounds,
    show: false,
    frame: !kioskEnabled,
    fullscreen: kioskEnabled,
    autoHideMenuBar: true,
    alwaysOnTop: kioskEnabled,
    backgroundColor: '#020617',
    title: simulated ? 'Torre - Simulacao da Tela do Cliente' : 'Torre - Tela do Cliente',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      devTools: !app.isPackaged || isEnabled(process.env.TOWER_DEVTOOLS),
    },
  })
  customerDisplayWindow.removeMenu()
  customerDisplayWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  customerDisplayWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedNavigation(navigationUrl, rendererUrl)) event.preventDefault()
  })
  customerDisplayWindow.webContents.on('will-redirect', (event, navigationUrl) => {
    if (!isAllowedNavigation(navigationUrl, rendererUrl)) event.preventDefault()
  })
  customerDisplayWindow.once('ready-to-show', () => customerDisplayWindow?.show())
  customerDisplayWindow.on('closed', () => {
    customerDisplayWindow = null
  })
  await customerDisplayWindow.loadURL(customerUrl.toString())

  return {
    success: true,
    simulated,
    display: serializeDisplay(customerDisplay || primaryDisplay),
  }
}

function registerDesktopHandlers() {
  const initialOnly = ['/torre/inicial']
  const configurationOnly = ['/torre/configuracao']
  const towerPages = [...initialOnly, ...configurationOnly]
  const experiencePages = ['/torre/*']

  secureHandle('tower:get-network-status', towerPages, () => ({
    online: net.isOnline(),
  }))

  secureHandle('tower:open-network-settings', towerPages, async () => {
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

  secureHandle('tower:get-device-identity', initialOnly, () => ({
    deviceLabel: `Torre ${os.hostname()}`.slice(0, 120),
    appVersion: app.getVersion(),
  }))

  secureHandle('tower:enroll-asset', initialOnly, async (request) => {
    if (!request || !['qr', 'code'].includes(request.method)
        || typeof request.publicCode !== 'string'
        || typeof request.credential !== 'string') {
      return { success: false, message: 'Dados de fabrica invalidos.' }
    }

    try {
      const result = await requestTowerApi('/api/tower/asset/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: request.method,
          publicCode: request.publicCode,
          credential: request.credential,
          deviceLabel: `Torre ${os.hostname()}`.slice(0, 120),
          appVersion: app.getVersion(),
        }),
      })
      if (!result.data?.success) return result.data

      const protectedIdentity = Object.freeze({
        assetId: result.data.assetId,
        publicCode: result.data.publicCode,
        assetCredential: result.data.assetCredential,
        enrolledAt: result.data.enrolledAt,
      })
      if (!isValidAssetIdentity(protectedIdentity)) {
        return { success: false, message: 'O servidor retornou uma identidade fisica invalida.' }
      }
      await persistAssetIdentity(protectedIdentity)
      inMemoryAssetIdentity = protectedIdentity
      return {
        success: true,
        status: 'enrolled',
        identity: publicAssetIdentity(protectedIdentity),
        protectedByOs: true,
      }
    } catch (error) {
      console.error('[Torre Electron] Falha ao proteger identidade fisica:', error)
      return { success: false, message: 'Nao foi possivel registrar e proteger a identidade fisica.' }
    }
  })

  secureHandle('tower:get-asset-identity-status', initialOnly, async () => {
    const identity = await restoreAssetIdentity()
    try {
      if (!identity) return { success: true, enrolled: false }
      const result = await requestTowerApi('/api/tower/asset/status', {
        headers: { Authorization: `Bearer ${identity.assetCredential}` },
      })
      if (result.status === 401) {
        await clearAssetIdentity()
        return {
          success: false,
          enrolled: false,
          revoked: true,
          message: 'A identidade fisica foi aposentada ou revogada.',
        }
      }
      return {
        success: true,
        enrolled: true,
        identity: publicAssetIdentity(identity),
        credentialVerified: Boolean(result.data?.success),
      }
    } catch (error) {
      console.error('[Torre Electron] Falha ao consultar identidade fisica:', error)
      return {
        success: true,
        enrolled: Boolean(identity),
        identity: publicAssetIdentity(identity),
        credentialVerified: false,
      }
    }
  })

  secureHandle('tower:get-device-session-status', towerPages, async () => {
    const session = await restoreDeviceSession()
    if (!session) return { success: true, paired: false, protectedByOs: false }

    try {
      const result = await requestTowerApi('/api/tower/device/status', {
        headers: { Authorization: `Bearer ${session.deviceCredential}` },
      })
      if (result.status === 401) {
        await clearDeviceSession()
        return { success: true, paired: false, revoked: true, protectedByOs: false }
      }
      return {
        success: true,
        paired: true,
        session: publicDeviceSession(session),
        credentialVerified: Boolean(result.data?.success),
        protectedByOs: true,
      }
    } catch (error) {
      console.error('[Torre Electron] Falha ao consultar sessao:', error)
      return {
        success: true,
        paired: true,
        session: publicDeviceSession(session),
        credentialVerified: false,
        protectedByOs: true,
      }
    }
  })

  secureHandle('tower:pair-device', initialOnly, async (request) => {
    const identity = await restoreAssetIdentity()
    if (!identity) return { success: false, message: 'Identidade fisica local nao encontrada.' }
    if (!request || !['qr', 'code'].includes(request.method)
        || typeof request.credential !== 'string') {
      return { success: false, message: 'Dados de pareamento invalidos.' }
    }

    try {
      const deviceLabel = `Torre ${os.hostname()}`.slice(0, 120)
      const result = await requestTowerApi('/api/tower/device/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: request.method,
          credential: request.credential,
          assetCredential: identity.assetCredential,
          deviceLabel,
          appVersion: app.getVersion(),
        }),
      })
      if (!result.data?.success) return result.data

      const protectedSession = Object.freeze({
        deviceId: result.data.deviceId,
        assetId: result.data.assetId,
        publicCode: result.data.publicCode,
        tenantId: result.data.tenantId,
        storeId: result.data.storeId,
        deviceCredential: result.data.deviceCredential,
        deviceLabel,
        pairedAt: result.data.pairedAt,
      })
      if (!isValidDeviceSession(protectedSession)
          || protectedSession.assetId !== identity.assetId
          || protectedSession.publicCode !== identity.publicCode) {
        return { success: false, message: 'O pareamento nao corresponde a identidade desta Torre.' }
      }
      await persistDeviceSession(protectedSession)
      inMemoryDeviceSession = protectedSession
      if (primaryWindow && !primaryWindow.isDestroyed()) {
        await bootstrapTowerWebSession(primaryWindow.webContents.session, protectedSession)
        scheduleTowerWebSessionRefresh(primaryWindow.webContents.session)
      }
      requestTowerConfigurationSync()
      return {
        success: true,
        status: 'paired',
        session: publicDeviceSession(protectedSession),
        protectedByOs: true,
      }
    } catch (error) {
      console.error('[Torre Electron] Falha no pareamento protegido:', error)
      return { success: false, message: 'Nao foi possivel parear e proteger a sessao local.' }
    }
  })

  secureHandle('tower:get-admin-pin-status', configurationOnly, async () => {
    const session = await restoreDeviceSession()
    if (!session) return { success: false, message: 'Torre nao pareada.' }
    try {
      const result = await requestTowerApi('/api/tower/device/admin-pin', {
        headers: { Authorization: `Bearer ${session.deviceCredential}` },
      })
      if (result.status === 401) await clearDeviceSession()
      return result.data
    } catch (error) {
      console.error('[Torre Electron] Falha ao consultar PIN:', error)
      return { success: false, message: 'PIN administrativo indisponivel.' }
    }
  })

  secureHandle('tower:submit-admin-pin', configurationOnly, async (request) => {
    const session = await restoreDeviceSession()
    if (!session) return { success: false, message: 'Torre nao pareada.' }
    try {
      const result = await requestTowerApi('/api/tower/device/admin-pin', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.deviceCredential}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })
      if (result.status === 401 && result.data?.message === 'Credencial de dispositivo invalida.') {
        await clearDeviceSession()
      }
      if (result.ok && result.data?.success && typeof result.data.maintenanceGrant === 'string') {
        inMemoryMaintenanceGrant = result.data.maintenanceGrant
      }
      const publicResult = { ...(result.data || {}) }
      delete publicResult.maintenanceGrant
      return publicResult
    } catch (error) {
      console.error('[Torre Electron] Falha ao validar PIN:', error)
      return { success: false, message: 'Sem comunicacao com o servidor para validar o PIN.' }
    }
  })

  secureHandle('tower:get-remote-config-access', configurationOnly, async () => {
    const session = await restoreDeviceSession()
    if (!session) return { success: false, message: 'Torre nao pareada.' }
    if (!inMemoryMaintenanceGrant) return { success: false, message: 'Confirme novamente o PIN administrativo.' }
    try {
      const result = await requestTowerApi('/api/tower/device/remote-config-access', {
        headers: {
          Authorization: `Bearer ${session.deviceCredential}`,
          'X-Tower-Maintenance-Grant': inMemoryMaintenanceGrant,
        },
      })
      if (result.status === 403) inMemoryMaintenanceGrant = null
      return result.data
    } catch (error) {
      console.error('[Torre Electron] Falha ao consultar acesso comercial:', error)
      return { success: false, message: 'Acesso comercial indisponivel.' }
    }
  })

  secureHandle('tower:rotate-remote-config-access', configurationOnly, async () => {
    const session = await restoreDeviceSession()
    if (!session) return { success: false, message: 'Torre nao pareada.' }
    if (!inMemoryMaintenanceGrant) return { success: false, message: 'Confirme novamente o PIN administrativo.' }
    try {
      const result = await requestTowerApi('/api/tower/device/remote-config-access', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.deviceCredential}`,
          'X-Tower-Maintenance-Grant': inMemoryMaintenanceGrant,
        },
      })
      if (result.status === 403) inMemoryMaintenanceGrant = null
      return result.data
    } catch (error) {
      console.error('[Torre Electron] Falha ao criar acesso comercial:', error)
      return { success: false, message: 'Nao foi possivel criar o acesso comercial.' }
    }
  })

  secureHandle('tower:get-device-session-summary', towerPages, async () => {
    const session = await restoreDeviceSession()
    return {
      success: true,
      paired: Boolean(session),
      session: publicDeviceSession(session),
      protectedByOs: Boolean(session),
    }
  })

  secureHandle('tower:get-hardware-diagnostics', configurationOnly, () => ({
    ...getHardwareSnapshot(),
    online: net.isOnline(),
    displays: screen.getAllDisplays().map(serializeDisplay),
  }))

  secureHandle('tower:get-hardware-approval-status', configurationOnly, async () => {
    const session = await restoreDeviceSession()
    if (!session || !towerLocalDatabase) return { success: false, message: 'Persistencia local da Torre indisponivel.' }
    try {
      const snapshot = getHardwareSnapshot()
      return {
        success: true,
        data: towerLocalDatabase.getHardwareValidation(getLocalScope(session), getHardwareFingerprint(snapshot)),
      }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Nao foi possivel consultar as aprovacoes.' }
    }
  })

  secureHandle('tower:approve-hardware-test', configurationOnly, async (request) => {
    const session = await restoreDeviceSession()
    if (!session || !towerLocalDatabase) return { success: false, message: 'Persistencia local da Torre indisponivel.' }
    try {
      const snapshot = getHardwareSnapshot()
      const data = towerLocalDatabase.saveHardwareApproval(getLocalScope(session), {
        test: request?.test,
        hardwareSnapshot: snapshot,
        hardwareFingerprint: getHardwareFingerprint(snapshot),
      })
      requestTowerOutboxSync()
      return { success: true, data, message: 'Aprovacao salva neste equipamento.' }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Nao foi possivel salvar a aprovacao.' }
    }
  })

  secureHandle('tower:create-local-session', experiencePages, async (request) => {
    const session = await restoreDeviceSession()
    if (!session || !towerLocalDatabase) {
      return { success: false, message: 'Persistencia local da Torre indisponivel.' }
    }
    try {
      const data = towerLocalDatabase.createOrResumeSession(getLocalScope(session), request)
      requestTowerOutboxSync()
      return { success: true, message: request?.sessionId ? 'Sessao local retomada.' : 'Sessao local criada.', data }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Nao foi possivel salvar a sessao local.' }
    }
  })

  secureHandle('tower:list-local-sessions', experiencePages, async () => {
    const session = await restoreDeviceSession()
    if (!session || !towerLocalDatabase) {
      return { success: false, message: 'Persistencia local da Torre indisponivel.' }
    }
    try {
      const data = towerLocalDatabase.listActiveSessions(getLocalScope(session))
      return { success: true, message: 'Sessoes locais carregadas.', data }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Nao foi possivel ler as sessoes locais.' }
    }
  })

  secureHandle('tower:create-local-customer', experiencePages, async (request) => {
    const session = await restoreDeviceSession()
    if (!session || !towerLocalDatabase) {
      return { success: false, message: 'Persistencia local da Torre indisponivel.' }
    }
    try {
      const protectedPayload = encryptLocalCustomerPayload({
        fullName: request?.fullName,
        mobilePhone: request?.mobilePhone,
      })
      const draft = towerLocalDatabase.createCustomerDraft(
        getLocalScope(session), request, protectedPayload,
      )
      towerLocalDatabase.linkCustomerDraftToSession(getLocalScope(session), {
        sessionId: request?.sessionId,
        localCustomerId: draft.localId,
      })
      await syncTowerOutbox()
      const resolved = towerLocalDatabase.getCustomerDraft(getLocalScope(session), draft.localId)
      return {
        success: true,
        message: resolved.remoteCustomerId
          ? 'Cliente cadastrado e sincronizado.'
          : 'Cliente salvo neste equipamento. Aguardando sincronizacao.',
        data: {
          id: resolved.remoteCustomerId || draft.localId,
          localId: draft.localId,
          fullName: draft.fullName,
          mobilePhone: draft.mobilePhone,
          provisional: !resolved.remoteCustomerId,
        },
      }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Nao foi possivel salvar o cliente local.' }
    }
  })

  secureHandle('tower:link-local-customer', experiencePages, async (request) => {
    const session = await restoreDeviceSession()
    if (!session || !towerLocalDatabase) {
      return { success: false, message: 'Persistencia local da Torre indisponivel.' }
    }
    try {
      towerLocalDatabase.linkCustomerDraftToSession(getLocalScope(session), request)
      await syncTowerOutbox()
      const resolved = towerLocalDatabase.getCustomerDraft(
        getLocalScope(session), request?.localCustomerId,
      )
      return {
        success: true,
        message: resolved.remoteCustomerId
          ? 'Cliente vinculado e sincronizado.'
          : 'Cliente vinculado localmente. Aguardando sincronizacao.',
        remoteCustomerId: resolved.remoteCustomerId,
      }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Nao foi possivel vincular o cliente local.' }
    }
  })

  secureHandle('tower:get-local-customer-status', experiencePages, async (localCustomerId) => {
    const session = await restoreDeviceSession()
    if (!session || !towerLocalDatabase) {
      return { success: false, message: 'Persistencia local da Torre indisponivel.' }
    }
    try {
      await syncTowerOutbox()
      return {
        success: true,
        ...towerLocalDatabase.getCustomerDraft(getLocalScope(session), localCustomerId),
      }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Cliente provisório indisponivel.' }
    }
  })

  secureHandle('tower:close-local-session', experiencePages, async (request) => {
    const session = await restoreDeviceSession()
    if (!session || !towerLocalDatabase) {
      return { success: false, message: 'Persistencia local da Torre indisponivel.' }
    }
    try {
      towerLocalDatabase.closeSession(getLocalScope(session), request)
      requestTowerOutboxSync()
      return { success: true, message: request?.status === 'discarded' ? 'Sessao descartada localmente.' : 'Sessao concluida localmente.' }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Nao foi possivel encerrar a sessao local.' }
    }
  })

  secureHandle('tower:save-local-measurement', experiencePages, async (request) => {
    const session = await restoreDeviceSession()
    if (!session || !towerLocalDatabase) {
      return { success: false, message: 'Persistencia local da Torre indisponivel.' }
    }
    try {
      const data = towerLocalDatabase.saveMeasurement(getLocalScope(session), request)
      requestTowerOutboxSync()
      return { success: true, message: 'Medidas salvas localmente.', data }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Nao foi possivel salvar as medidas localmente.' }
    }
  })

  secureHandle('tower:get-local-sync-status', experiencePages, async () => ({
    success: true,
    ...(towerLocalDatabase?.getSyncStatus() || { pending: 0, synced: 0, lastSyncedAt: null }),
  }))

  secureHandle('tower:sync-local-now', experiencePages, async () => ({
    success: true,
    ...(await syncTowerOutbox()),
  }))

  secureHandle('tower:get-local-configuration', experiencePages, async (options) => {
    const session = await restoreDeviceSession()
    if (!session || !towerLocalDatabase) {
      return { success: false, message: 'Configuracao local da Torre indisponivel.' }
    }
    try {
      let snapshot = null
      let source = 'cache'
      if (options?.refresh !== false && net.isOnline()) {
        snapshot = await syncTowerConfiguration()
        source = snapshot ? 'server' : 'cache'
      }
      snapshot ||= towerLocalDatabase.getConfigurationSnapshot(getLocalScope(session))
      return {
        success: true,
        source,
        snapshot,
      }
    } catch (error) {
      try {
        return {
          success: true,
          source: 'cache',
          snapshot: towerLocalDatabase.getConfigurationSnapshot(getLocalScope(session)),
          message: error instanceof Error ? error.message : 'Falha ao atualizar configuracao.',
        }
      } catch {
        return { success: false, message: 'Configuracao local da Torre indisponivel.' }
      }
    }
  })

  secureHandle('tower:open-customer-display-test', configurationOnly, () => openCustomerDisplayTest())

  secureHandle('tower:close-customer-display-test', configurationOnly, () => {
    if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
      customerDisplayWindow.close()
    }
    return { success: true }
  })

  secureHandle('tower:open-customer-experience', experiencePages, async (requestedUrl) => {
    const session = await restoreDeviceSession()
    if (!session) return { success: false, message: 'Torre nao pareada.' }
    return openCustomerExperience(requestedUrl, session)
  })

  secureHandle('tower:close-customer-experience', experiencePages, () => {
    if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
      customerDisplayWindow.close()
    }
    return { success: true }
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

  app.whenReady().then(async () => {
    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: packagedFeatureEnabled(process.env.TOWER_AUTO_START, true),
        path: process.execPath,
      })
    }
    towerLocalDatabase = new TowerLocalDatabase(getLocalDatabasePath(), {
      protect: protectLocalPayload,
      unprotect: unprotectLocalPayload,
    })
    registerDesktopHandlers()
    primaryWindow = await createMainWindow()
    scheduleTowerOutboxSync()
    requestTowerOutboxSync()
    scheduleTowerConfigurationSync()
    requestTowerConfigurationSync()

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        primaryWindow = await createMainWindow()
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (webSessionRefreshTimer) clearInterval(webSessionRefreshTimer)
  if (towerSyncTimer) clearInterval(towerSyncTimer)
  if (towerConfigurationTimer) clearInterval(towerConfigurationTimer)
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (towerSyncTimer) clearInterval(towerSyncTimer)
  towerSyncTimer = null
  if (towerConfigurationTimer) clearInterval(towerConfigurationTimer)
  towerConfigurationTimer = null
  towerLocalDatabase?.close()
  towerLocalDatabase = null
})
