const path = require('path')
const dotenv = require('dotenv')
const { Client } = require('pg')

dotenv.config({ path: path.join(process.cwd(), '.env.local') })
const finalState = process.argv.includes('--final')

const TARGETS = [
  {
    key: 'hoya_prolife',
    laboratorio: 'HOYA',
    versao: 'HOYA Dezembro 2025 com PRO LIFE Julho 2026',
    expected: { families: 23, offers: 547, treatments: 19, grids: 535, withoutGrid: 12, profiles: 23, documents: 2 },
  },
  {
    key: 'omegalux',
    laboratorio: 'OMEGALUX',
    versao: 'OMEGALUX Julho 2026',
    expected: { families: 3, offers: 65, treatments: 11, grids: 33, withoutGrid: 32, profiles: 3, documents: 1 },
  },
]

function assertEqual(label, actual, expected) {
  if (Number(actual) !== expected) {
    throw new Error(`${label}: esperado ${expected}, encontrado ${actual}.`)
  }
}

async function loadMetrics(client, versionId) {
  const { rows } = await client.query(
    `select
       (select count(*) from public.global_lens_families where version_id = $1) as families,
       (select count(*)
          from public.global_lens_offers offer
          join public.global_lens_families family on family.id = offer.family_id
         where family.version_id = $1) as offers,
       (select count(*) from public.global_treatments where version_id = $1) as treatments,
       (select count(*)
          from public.global_offer_diopter_grids grid
          join public.global_lens_offers offer on offer.id = grid.offer_id
          join public.global_lens_families family on family.id = offer.family_id
         where family.version_id = $1) as grids,
       (select count(*)
          from public.global_lens_offers offer
          join public.global_lens_families family on family.id = offer.family_id
          left join public.global_offer_diopter_grids grid on grid.offer_id = offer.id
         where family.version_id = $1 and grid.id is null) as without_grid,
       (select count(*)
          from public.global_usage_profiles profile
          join public.global_lens_families family on family.id = profile.family_id
         where family.version_id = $1) as profiles,
       (select count(*) from public.catalog_source_documents where version_id = $1) as documents,
       (select count(*)
          from public.global_offer_treatments_compatibility compatibility
          join public.global_lens_offers offer on offer.id = compatibility.offer_id
          join public.global_lens_families family on family.id = offer.family_id
         where family.version_id = $1) as compatibilities,
       (select count(*)
          from public.tenant_catalog_activations
         where global_version_id = $1 and status = 'active') as active_activations`,
    [versionId],
  )
  return rows[0]
}

async function assertActivationGuard(client, versionId) {
  const { rows: stores } = await client.query(
    `select id, tenant_id from public.stores where tenant_id is not null order by id limit 1`,
  )
  if (!stores.length) throw new Error('Nenhuma loja com tenant para testar o bloqueio.')

  await client.query('begin')
  try {
    await client.query(
      `insert into public.tenant_catalog_activations
        (tenant_id, store_id, global_version_id, status)
       values ($1, $2, $3, 'active')`,
      [stores[0].tenant_id, stores[0].id, versionId],
    )
    throw new Error('O banco permitiu ativar um catalogo draft.')
  } catch (error) {
    if (error.code !== '23514') throw error
  } finally {
    await client.query('rollback')
  }
}

async function main() {
  if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL ausente.')
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  try {
    const report = []

    for (const target of TARGETS) {
      const { rows: versions } = await client.query(
        `select id, laboratorio, versao, status
           from public.global_catalog_versions
          where laboratorio = $1 and versao = $2`,
        [target.laboratorio, target.versao],
      )
      if (versions.length !== 1) throw new Error(`${target.key}: versao nao encontrada de forma unica.`)

      const version = versions[0]
      const expectedStatus = finalState ? 'published' : 'draft'
      if (version.status !== expectedStatus) throw new Error(`${target.key}: status esperado ${expectedStatus}, encontrado ${version.status}.`)

      const metrics = await loadMetrics(client, version.id)
      assertEqual(`${target.key}.families`, metrics.families, target.expected.families)
      assertEqual(`${target.key}.offers`, metrics.offers, target.expected.offers)
      assertEqual(`${target.key}.treatments`, metrics.treatments, target.expected.treatments)
      assertEqual(`${target.key}.grids`, metrics.grids, target.expected.grids)
      assertEqual(`${target.key}.withoutGrid`, metrics.without_grid, target.expected.withoutGrid)
      assertEqual(`${target.key}.profiles`, metrics.profiles, target.expected.profiles)
      assertEqual(`${target.key}.documents`, metrics.documents, target.expected.documents)
      assertEqual(`${target.key}.compatibilities`, metrics.compatibilities, 0)
      assertEqual(`${target.key}.activeActivations`, metrics.active_activations, finalState ? 1 : 0)

      const { rows: families } = await client.query(
        `select nome from public.global_lens_families where version_id = $1 order by nome`,
        [version.id],
      )
      report.push({ ...version, ...metrics, familyNames: families.map((row) => row.nome) })
    }

    const hoyaProlife = report.find((row) => row.laboratorio === 'HOYA')
    const omegalux = report.find((row) => row.laboratorio === 'OMEGALUX')
    if (!hoyaProlife.familyNames.includes('PRO LIFE VI')) throw new Error('PRO LIFE VI ausente da HOYA + PRO LIFE.')
    if (hoyaProlife.familyNames.some((name) => name.startsWith('OMEGALUX'))) throw new Error('Familia OMEGALUX presente na HOYA + PRO LIFE.')
    if (omegalux.familyNames.includes('PRO LIFE VI')) throw new Error('PRO LIFE VI presente na OMEGALUX.')
    if (omegalux.familyNames.some((name) => !name.startsWith('OMEGALUX'))) throw new Error('Familia estranha presente na OMEGALUX.')

    let guardVersionId = hoyaProlife.id
    if (finalState) {
      const { rows: mixedVersions } = await client.query(
        `select id, status from public.global_catalog_versions where id = $1::uuid`,
        ['3e375a09-8a6d-4d54-aadb-c4e833e322b8'],
      )
      if (mixedVersions[0]?.status !== 'archived') throw new Error('A versao mista nao esta arquivada.')
      guardVersionId = mixedVersions[0].id
    }

    await assertActivationGuard(client, guardVersionId)

    const { rows: affectedStores } = await client.query(
      `select store.id,
              store.name,
              activation.status,
              version.id as version_id,
              version.laboratorio,
              version.versao,
              coalesce(store.settings -> 'ai_suggestion_config' -> 'lab_preferences', '[]'::jsonb) as lab_preferences
         from public.stores store
         join public.tenant_catalog_activations activation on activation.store_id = store.id
         join public.global_catalog_versions version on version.id = activation.global_version_id
        where version.id = any($1::uuid[])
        order by store.id, version.laboratorio`,
      [[
        '08f91e88-40f5-4521-b476-d09c7f1955cf',
        '3e375a09-8a6d-4d54-aadb-c4e833e322b8',
        hoyaProlife.id,
        omegalux.id,
      ]],
    )

    if (finalState) {
      const globoRows = affectedStores.filter((row) => Number(row.id) === 7)
      const activeIds = new Set(globoRows.filter((row) => row.status === 'active').map((row) => row.version_id))
      if (!activeIds.has(hoyaProlife.id) || !activeIds.has(omegalux.id) || activeIds.size !== 2) {
        throw new Error('A loja Neosmart nao ficou somente com HOYA + PRO LIFE e OMEGALUX ativas.')
      }
      const preferences = globoRows[0]?.lab_preferences || []
      if (!preferences.some((item) => item.versionId === omegalux.id && item.weight === 5)) {
        throw new Error('Preferencia OMEGALUX peso 5 ausente na loja Neosmart.')
      }
      if (!preferences.some((item) => item.versionId === hoyaProlife.id && item.weight === 3)) {
        throw new Error('Preferencia HOYA + PRO LIFE peso 3 ausente na loja Neosmart.')
      }
      if (preferences.some((item) => item.versionId === '3e375a09-8a6d-4d54-aadb-c4e833e322b8')) {
        throw new Error('Preferencia da tabela mista ainda presente na loja Neosmart.')
      }
    }

    console.log(JSON.stringify({ ok: true, activationGuard: 'blocked', catalogs: report, affectedStores }, null, 2))
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
