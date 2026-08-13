import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('contratos web v1 autenticam o token do equipamento e limitam o acesso por loja', async () => {
  const [access, customers, evaluations, context, sessions, commands, measurements, heatmaps, operationalCatalog, operationalCatalogLoader, recommendations, configuration, measurementMigration] = await Promise.all([
    read('src/app/api/tower/v1/web/access/route.ts'),
    read('src/app/api/tower/v1/web/customers/route.ts'),
    read('src/app/api/tower/v1/web/evaluations/route.ts'),
    read('src/app/api/tower/v1/web/session-context/route.ts'),
    read('src/app/api/tower/v1/web/sessions/route.ts'),
    read('src/app/api/tower/v1/web/sessions/commands/route.ts'),
    read('src/app/api/tower/v1/web/measurements/route.ts'),
    read('src/app/api/tower/v1/web/heatmaps/commands/route.ts'),
    read('src/app/api/tower/v1/web/operational-catalog/route.ts'),
    read('src/lib/server/tower-operational-catalog.ts'),
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
  assert.match(context, /receita_longe_od_esferico/)
  assert.match(context, /createAdminClient\(\{ noStore: true \}\)/)
  assert.doesNotMatch(
    commands,
    /prescription_snapshot: parsed\.data\.prescription, current_experience: 'thickness'/,
  )
  assert.match(operationalCatalog, /RESOURCE_NAMES = new Set\(\['catalog', 'geometries', 'frames'\]\)/)
  assert.match(operationalCatalogLoader, /\.from\('global_catalog_versions'\)/)
  assert.doesNotMatch(operationalCatalogLoader, /tenant_catalog_activations/)
  assert.match(operationalCatalogLoader, /global_lens_geometry/)
  assert.match(operationalCatalogLoader, /global_visagismo_frame_templates/)
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

test('sync do dispositivo aceita todo o atendimento offline e a configuracao instala dados operacionais', async () => {
  const [sync, configuration, operationalCatalogLoader] = await Promise.all([
    read('src/app/api/tower/device/sync/route.ts'),
    read('src/app/api/tower/device/configuration/route.ts'),
    read('src/lib/server/tower-operational-catalog.ts'),
  ])

  assert.match(sync, /eventType: z\.literal\('tower_heatmap\.upsert'\)/)
  assert.match(sync, /eventType: z\.literal\('tower_evaluation\.upsert'\)/)
  assert.match(sync, /remoteCustomerId: z\.number\(\)\.int\(\)\.positive\(\)\.nullable\(\)\.optional\(\)/)
  assert.match(sync, /function isPermanentEventFailure/)
  assert.match(sync, /SyncBatchEnvelopeSchema/)
  assert.match(sync, /SyncEventSchema\.safeParse\(rawEvent\)/)
  assert.match(sync, /failureCode: 'TOWER_SYNC_EVENT_INVALID'/)
  assert.match(sync, /function publicFailureCode/)
  assert.match(sync, /TOWER_SYNC_REQUIRED_FIELD_MISSING/)
  assert.match(sync, /TOWER_SYNC_SERVER_SCHEMA_OUTDATED/)
  assert.match(sync, /function isPermanentFailureCode/)
  assert.match(sync, /permanentFailure: isPermanentEventFailure\(error\.message\)/)
  assert.match(sync, /localEvaluationId: z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/)
  assert.match(sync, /apply_tower_device_sync_event_v4/)
  assert.match(sync, /remoteEvaluationId/)
  assert.match(configuration, /loadRecommendationCatalogMulti/)
  assert.match(configuration, /loadStoreCustomers/)
  assert.match(configuration, /availableCatalogs/)
  assert.match(configuration, /\.from\('global_catalog_versions'\)/)
  assert.match(configuration, /\.eq\('status', 'published'\)/)
  assert.match(configuration, /visagismoFrames,/)
  assert.match(configuration, /visagismoFrames = loadedFrames/)
  assert.match(configuration, /loadTowerOperationalFrames\(admin\)/)
  assert.doesNotMatch(configuration, /tenant_catalog_activations/)
  assert.doesNotMatch(configuration, /MeasurementGabarito/)
  assert.match(configuration, /const installedIds = selectedByTower \?\? \[\]/)
  assert.doesNotMatch(
    configuration,
    /const installedIds = selectedByTower \?\? catalogs\.map/,
  )
  assert.match(configuration, /loadTowerOperationalCatalog\(admin, storeId, installedIds\)/)
  assert.match(operationalCatalogLoader, /!selectedVersionIds\.length/)
  assert.match(operationalCatalogLoader, /selectedFamilyNames\.length === 0/)
  assert.match(operationalCatalogLoader, /\.in\('id', selectedVersionIds\)/)
  assert.match(operationalCatalogLoader, /\.eq\('status', 'published'\)/)
  assert.match(configuration, /operationalCatalog/)
  assert.match(configuration, /loadStoreCustomers\(admin, authentication\.device\.tenantId, storeId\)/)
  assert.match(configuration, /\.eq\('tenant_id', tenantId\)/)
  assert.match(configuration, /select\('id,full_name,fone_movel,created_at'\)/)
  assert.doesNotMatch(configuration, /fone_movel,updated_at/)
})

test('recuperacao de PIN autentica o dispositivo e consome codigo de uso unico', async () => {
  const route = await read('src/app/api/tower/device/admin-pin/recovery/route.ts')
  const contract = await read('src/lib/tower/admin-pin-recovery-contract.ts')
  assert.match(route, /authenticateTowerDevice/)
  assert.match(route, /consume_tower_admin_pin_recovery/)
  assert.match(route, /authentication\.device\.storeId/)
  assert.match(route, /hashTowerAdminPin/)
  assert.match(contract, /MBTOWER-PIN:1:/)
  assert.match(contract, /normalizeTowerPinRecoveryCode/)
})

test('publicacao de relatorio usa dispositivo, escopo, hash e expiracao sem alterar o sync', async () => {
  const [prepare, upload, finalize, publicRoute, publicPage, share] = await Promise.all([
    read('src/app/api/tower/device/customer-reports/route.ts'),
    read('src/app/api/tower/device/customer-reports/[reportId]/assets/[assetId]/route.ts'),
    read('src/app/api/tower/device/customer-reports/[reportId]/finalize/route.ts'),
    read('src/app/api/public/tower-reports/[token]/route.ts'),
    read('src/app/relatorio/[token]/page.tsx'),
    read('src/lib/server/tower-customer-report-share.ts'),
  ])

  for (const route of [prepare, upload, finalize]) assert.match(route, /authenticateTowerDevice/)
  assert.match(prepare, /\.eq\('tenant_id', device\.tenantId\)/)
  assert.match(prepare, /\.eq\('store_id', device\.storeId\)/)
  assert.match(prepare, /snapshotHash/)
  assert.match(prepare, /audience: z\.literal\('customer'\)/)
  assert.doesNotMatch(prepare, /retailer_export/)
  assert.match(prepare, /snapshotSession/)
  assert.match(prepare, /A sessao do snapshot nao confere/)
  assert.match(prepare, /O cliente do snapshot nao confere/)
  for (const kind of ['visagismo_analysis', 'visagismo_final', 'measurement_front_annotated', 'measurement_profile_annotated', 'heatmap']) {
    assert.match(prepare, new RegExp(kind))
  }
  assert.match(upload, /MAX_ASSET_BYTES = 4 \* 1024 \* 1024/)
  assert.match(upload, /createHash\('sha256'\)/)
  assert.match(upload, /source_device_id/)
  assert.match(finalize, /TOWER_CUSTOMER_REPORT_TTL_SECONDS/)
  assert.match(finalize, /Ainda existem imagens pendentes/)
  assert.match(share, /createHmac\('sha256'/)
  assert.match(share, /TOWER_CUSTOMER_REPORT_SIGNED_ASSET_SECONDS = 5 \* 60/)
  assert.match(share, /status: 'expired'/)
  assert.match(publicRoute, /Cache-Control.*private, no-store/)
  assert.match(publicPage, /robots: \{ index: false, follow: false, nocache: true \}/)
  assert.doesNotMatch(publicPage, /JSON\.stringify/)
  assert.match(publicPage, /lensGeometry/)
  assert.match(publicPage, /assetCaption/)
})

test('limpeza de relatorios usa cron autenticado e so neutraliza depois de remover o storage', async () => {
  const [route, share, vercel] = await Promise.all([
    read('src/app/api/internal/tower-report-cleanup/route.ts'),
    read('src/lib/server/tower-customer-report-share.ts'),
    read('vercel.json'),
  ])

  assert.match(route, /process\.env\.CRON_SECRET/)
  assert.match(route, /timingSafeEqual/)
  assert.match(route, /cleanupExpiredTowerCustomerReports/)
  assert.match(share, /status', \['published', 'expired'\]/)
  assert.match(share, /status', 'preparing'/)
  assert.match(share, /\.remove\(storagePaths\)/)
  assert.match(share, /snapshot: \{ expired: true \}/)
  assert.ok(share.indexOf('.remove(storagePaths)') < share.indexOf('snapshot: { expired: true }'))
  assert.match(vercel, /\/api\/internal\/tower-report-cleanup/)
  assert.match(vercel, /15 5 \* \* \*/)
})
