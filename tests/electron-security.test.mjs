import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8')
const main = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8')
const nextConfig = await readFile(new URL('../next.config.js', import.meta.url), 'utf8')

test('preload nao expoe leitura ou gravacao direta de credenciais permanentes', () => {
  assert.doesNotMatch(preload, /holdAssetIdentity|getAssetIdentity\b|holdDeviceSession|getDeviceSession\b/)
  assert.doesNotMatch(preload, /assetCredential|deviceCredential/)
  assert.match(preload, /enrollAsset/)
  assert.match(preload, /pairDevice/)
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
