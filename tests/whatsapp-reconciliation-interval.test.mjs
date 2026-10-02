import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const server = await readFile(new URL('../services/whatsapp-automation/server.mjs', import.meta.url), 'utf8')
const envExample = await readFile(new URL('../services/whatsapp-automation/deploy/whatsapp-automation.env.example', import.meta.url), 'utf8')
const unit = await readFile(new URL('../services/whatsapp-automation/deploy/whatsapp-automation.service', import.meta.url), 'utf8')
const provision = await readFile(new URL('../services/whatsapp-automation/deploy/provision-env.sh', import.meta.url), 'utf8')

function constantLine(name) {
  const line = server.split(/\r?\n/).find((entry) => entry.startsWith(`const ${name} =`))
  assert.ok(line, `constante ausente: ${name}`)
  return line
}

test('a reconciliacao passa a varrer a cada 5 minutos e continua configuravel', () => {
  assert.equal(
    constantLine('RECONCILIATION_INTERVAL_MS'),
    'const RECONCILIATION_INTERVAL_MS = Math.max(30000, Number(process.env.WHATSAPP_RECONCILIATION_INTERVAL_MS || 300000))',
  )
  assert.match(envExample, /^WHATSAPP_RECONCILIATION_INTERVAL_MS=300000$/m)
  assert.match(envExample, /^WHATSAPP_RECONCILIATION_ENABLED=true$/m)
  assert.match(server, /setInterval\(\(\) => \{\s*void runMessageReconciliation\(\)\s*\}, RECONCILIATION_INTERVAL_MS\)/)
})

test('o exemplo versionado nao mantem o override de 60 segundos', () => {
  assert.doesNotMatch(envExample, /WHATSAPP_RECONCILIATION_INTERVAL_MS=60000/)
  assert.match(unit, /^EnvironmentFile=\/etc\/whatsapp-automation\.env$/m)
  assert.doesNotMatch(provision, /WHATSAPP_RECONCILIATION_INTERVAL_MS/)
})

test('os demais intervalos do worker permanecem como estavam', () => {
  assert.equal(
    constantLine('WATCHDOG_INTERVAL_MS'),
    'const WATCHDOG_INTERVAL_MS = Math.max(30000, Number(process.env.WHATSAPP_WATCHDOG_INTERVAL_MS || 60000))',
  )
  assert.equal(
    constantLine('ACTIVE_CHANNELS_REFRESH_MS'),
    'const ACTIVE_CHANNELS_REFRESH_MS = Math.max(30000, Number(process.env.WHATSAPP_ACTIVE_CHANNELS_REFRESH_MS || 60000))',
  )
  assert.equal(
    constantLine('INBOUND_AGGREGATION_WINDOW_MS'),
    'const INBOUND_AGGREGATION_WINDOW_MS = Number(process.env.WHATSAPP_INBOUND_AGGREGATION_WINDOW_MS || 20000)',
  )
  assert.match(envExample, /^WHATSAPP_WATCHDOG_INTERVAL_MS=60000$/m)
  assert.match(envExample, /^WHATSAPP_ACTIVE_CHANNELS_REFRESH_MS=60000$/m)
  assert.match(envExample, /^WHATSAPP_INBOUND_AGGREGATION_WINDOW_MS=20000$/m)
  assert.match(envExample, /^WHATSAPP_RECONCILIATION_LOOKBACK_MS=86400000$/m)
})
