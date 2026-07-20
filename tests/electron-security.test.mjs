import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8')
const main = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8')
const nextConfig = await readFile(new URL('../next.config.js', import.meta.url), 'utf8')
const webSession = await readFile(new URL('../src/lib/server/tower-device-web-session.ts', import.meta.url), 'utf8')
const webSessionRoute = await readFile(new URL('../src/app/api/tower/device/web-session/route.ts', import.meta.url), 'utf8')
const maintenanceGrant = await readFile(new URL('../src/lib/server/tower-maintenance-grant.ts', import.meta.url), 'utf8')
const remoteSession = await readFile(new URL('../src/lib/server/tower-remote-config-session.ts', import.meta.url), 'utf8')

test('preload nao expoe leitura ou gravacao direta de credenciais permanentes', () => {
  assert.doesNotMatch(preload, /holdAssetIdentity|getAssetIdentity\b|holdDeviceSession|getDeviceSession\b/)
  assert.doesNotMatch(preload, /assetCredential|deviceCredential/)
  assert.match(preload, /enrollAsset/)
  assert.match(preload, /pairDevice/)
  assert.match(preload, /saveLocalMeasurement/)
  assert.match(preload, /createLocalCustomer/)
  assert.doesNotMatch(preload, /getPendingEvents|markEventsSynced/)
})

test('SQLite local usa outbox e sincroniza apenas pelo processo principal', () => {
  assert.match(main, /TowerLocalDatabase/)
  assert.match(main, /requestTowerApi\('\/api\/tower\/device\/sync'/)
  assert.match(main, /Authorization: `Bearer \$\{deviceSession\.deviceCredential\}`/)
  assert.match(main, /tower:save-local-measurement/)
  assert.match(main, /safeStorage\.encryptString\(JSON\.stringify\(payload\)\)/)
  assert.match(main, /tower:create-local-customer/)
})

test('IPC valida janela, origem e caminho antes de executar operacoes', () => {
  assert.match(main, /function isTrustedIpcSender/)
  assert.match(main, /event\.sender\.id !== primaryWindow\.webContents\.id/)
  assert.match(main, /allowedPaths\.includes\(senderUrl\.pathname\)/)
  assert.match(main, /secureHandle\('tower:pair-device'/)
})

test('navegacao fica limitada a rotas da Torre e a tela recebe CSP', () => {
  assert.match(main, /target\.pathname\.startsWith\('\/torre\/'\)/)
  assert.match(nextConfig, /Content-Security-Policy/)
  assert.match(nextConfig, /object-src 'none'/)
  assert.match(nextConfig, /frame-ancestors 'none'/)
})

test('sessao web do Electron e curta, assinada e revalida o dispositivo ativo', () => {
  assert.match(webSession, /createHmac\('sha256'/)
  assert.match(webSession, /timingSafeEqual/)
  assert.match(webSession, /SESSION_LIFETIME_SECONDS = 15 \* 60/)
  assert.match(webSession, /\.eq\('status', 'active'\)/)
  assert.match(webSessionRoute, /authenticateTowerDevice/)
  assert.match(main, /bootstrapTowerWebSession/)
  assert.match(main, /httpOnly: true/)
})

test('tela cliente no Electron aceita apenas a loja pareada e modo client', () => {
  assert.match(preload, /openCustomerExperience/)
  assert.doesNotMatch(preload, /deviceCredential|assetCredential/)
  assert.match(main, /customerUrl\.pathname\.startsWith\(storePrefix\)/)
  assert.match(main, /customerUrl\.searchParams\.get\('client'\) !== '1'/)
  assert.match(main, /simulated = !customerDisplay/)
})

test('acesso comercial exige PIN administrativo recente sem expor o grant no preload', () => {
  assert.match(main, /inMemoryMaintenanceGrant/)
  assert.match(main, /delete publicResult\.maintenanceGrant/)
  assert.doesNotMatch(preload, /maintenanceGrant/)
  assert.match(maintenanceGrant, /GRANT_LIFETIME_SECONDS = 5 \* 60/)
  assert.match(maintenanceGrant, /tower-maintenance-grant:v1/)
})

test('sessao comercial e assinada, curta e limitada ao codigo publico', () => {
  assert.match(remoteSession, /TOWER_REMOTE_CONFIG_SESSION_SECONDS = 8 \* 60 \* 60/)
  assert.match(remoteSession, /timingSafeEqual/)
  assert.match(remoteSession, /session\.publicCode !== publicCode/)
  assert.match(remoteSession, /tower_remote_config_access/)
})
