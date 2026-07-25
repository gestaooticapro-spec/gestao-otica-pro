import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('contratos web v1 autenticam o token do equipamento e limitam o acesso por loja', async () => {
  const [access, customers, evaluations, context, sessions, commands, measurements, heatmaps, operationalCatalog, recommendations, configuration, measurementMigration] = await Promise.all([
    read('src/app/api/tower/v1/web/access/route.ts'),
    read('src/app/api/tower/v1/web/customers/route.ts'),
    read('src/app/api/tower/v1/web/evaluations/route.ts'),
    read('src/app/api/tower/v1/web/session-context/route.ts'),
    read('src/app/api/tower/v1/web/sessions/route.ts'),
    read('src/app/api/tower/v1/web/sessions/commands/route.ts'),
    read('src/app/api/tower/v1/web/measurements/route.ts'),
    read('src/app/api/tower/v1/web/heatmaps/commands/route.ts'),
    read('src/app/api/tower/v1/web/operational-catalog/route.ts'),
    read('src/app/api/tower/v1/web/recommendations/route.ts'),
    read('src/app/api/tower/v1/web/configuration/route.ts'),
    read('supabase/migrations/20260722100000_tower_web_measurements.sql'),
  ])

  for (const source of [access, customers, evaluations, context, sessions, commands, measurements, heatmaps, operationalCatalog, recommendations, configuration]) {
    assert.match(source, /Bearer /)
    assert.match(source, /authenticateTowerDeviceWebSessionToken/)
    assert.match(source, /parsed\.data\.storeId/)
  }

  assert.match(customers, /\.eq\('store_id', parsed\.data\.storeId\)/)
  assert.match(customers, /export async function POST/)
  assert.match(customers, /\.eq\('tenant_id', auth\.tenantId\)/)
  assert.match(customers, /Cliente ja estava cadastrado/)
  assert.match(evaluations, /pre_sale_analysis_enabled/)
  assert.match(evaluations, /\.eq\('tenant_id', auth\.tenantId\)/)
  assert.match(evaluations, /\.eq\('evaluated_customer_id', customer\.id\)/)
  assert.match(evaluations, /\.is\('exported_venda_id', null\)/)
  assert.match(context, /\.eq\('store_id', parsed\.data\.storeId\)/)
  assert.match(sessions, /tenant_id: auth\.tenantId/)
  assert.match(commands, /evaluation\.tenant_id !== auth\.tenantId/)
  assert.match(commands, /session\.status !== 'active'/)
  assert.match(commands, /tower_heatmap_sessions/)
  assert.match(access, /deviceId: auth\.deviceId/)
  assert.match(access, /data:\s*\{\s*ok: true as const/)
  assert.match(measurements, /save_tower_web_measurement/)
  assert.match(measurements, /p_result_id: parsed\.data\.operationId/)
  assert.match(heatmaps, /command: z\.literal\('get-or-create-tower-session'\)/)
  assert.match(heatmaps, /command: z\.literal\('get-completed-result'\)/)
  assert.match(heatmaps, /\.eq\('tenant_id', auth\.tenantId\)/)
  assert.match(heatmaps, /Esta sessao ja foi concluida com outro resultado/)
  assert.doesNotMatch(heatmaps, /O mapa visual ainda nao foi associado a cliente e avaliacao/)
  assert.match(heatmaps, /recommended_items/)
  assert.match(recommendations, /recommended_items: result\.recommendations/)
  assert.match(context, /data: \{ session, customer, evaluation \}/)
  assert.match(operationalCatalog, /RESOURCE_NAMES = new Set\(\['catalog', 'geometries', 'frames'\]\)/)
  assert.match(operationalCatalog, /\.eq\('tenant_id', tenantId\)/)
  assert.match(operationalCatalog, /global_lens_geometry/)
  assert.match(operationalCatalog, /global_visagismo_frame_templates/)
  assert.match(recommendations, /Catalogo nao esta ativo para esta loja/)
  assert.match(recommendations, /\.eq\('tenant_id', tenantId\)/)
  assert.match(recommendations, /\.eq\('store_id', storeId\)/)
  assert.match(recommendations, /tower_heatmap_sessions/)
  assert.match(configuration, /readTowerRemoteConfig\(parsed\.data\.storeId, auth\.tenantId\)/)
  assert.match(configuration, /Cache-Control.*no-store/)
  assert.match(measurementMigration, /FOR UPDATE/)
  assert.match(measurementMigration, /existing_result\.id/)
  assert.match(measurementMigration, /REVOKE ALL ON FUNCTION public\.save_tower_web_measurement/)
})

test('gateway de IA autentica equipamento, valida payload e limita consumo por dispositivo', async () => {
  const [route, rateLimit] = await Promise.all([
    read('src/app/api/tower/v1/web/ai/route.ts'),
    read('src/lib/server/tower-activation-rate-limit.ts'),
  ])

  assert.match(route, /MAX_BODY_BYTES = 4_000_000/)
  assert.match(route, /Bearer /)
  assert.match(route, /authenticateTowerDeviceWebSessionToken/)
  assert.match(route, /parsed\.data\.storeId/)
  assert.match(route, /consumeTowerAuthenticatedRateLimit/)
  assert.match(route, /'locate-measurement-points'/)
  assert.match(route, /'generate-lens-sales-assist'/)
  assert.match(route, /'generate-visagismo-narrative'/)
  assert.match(route, /export const maxDuration = 120/)
  assert.match(route, /narrativa de visagismo.*validada.*esgotada/)
  assert.match(route, /Retry-After/)
  assert.match(route, /Cache-Control.*no-store/)
  assert.match(rateLimit, /createHash\('sha256'\)\.update\(`\$\{deviceId\}:\$\{operation\}`/)
  assert.match(rateLimit, /tower-ai:\$\{operation\}/)
})
