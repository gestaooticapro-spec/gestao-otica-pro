const path = require('path')
const dotenv = require('dotenv')
const { Client } = require('pg')

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const TABLES = [
  'global_catalog_versions',
  'catalog_source_documents',
  'catalog_source_pages',
  'catalog_source_chunks',
  'global_lens_families',
  'global_treatments',
  'global_lens_offers',
  'global_offer_diopter_grids',
  'global_offer_treatments_compatibility',
  'global_usage_profiles',
  'global_source_evidence',
]

async function main() {
  if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL ausente.')
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  try {
    const { rows } = await client.query(
      `select table_name, column_name, data_type, is_nullable, column_default
         from information_schema.columns
        where table_schema = 'public'
          and table_name = any($1::text[])
        order by table_name, ordinal_position`,
      [TABLES],
    )

    for (const row of rows) {
      console.log([
        row.table_name,
        row.column_name,
        row.data_type,
        row.is_nullable,
        row.column_default || '',
      ].join('|'))
    }

    const { rows: profileRows } = await client.query(
      `select version.laboratorio,
              version.versao,
              profile.profile_scope,
              count(*) as total,
              count(*) filter (where profile.family_id is null) as without_family,
              count(*) filter (where profile.offer_id is null) as without_offer
         from public.global_usage_profiles profile
         left join public.global_lens_families family on family.id = profile.family_id
         left join public.global_lens_offers offer on offer.id = profile.offer_id
         left join public.global_lens_families offer_family on offer_family.id = offer.family_id
         join public.global_catalog_versions version
           on version.id = coalesce(family.version_id, offer_family.version_id)
        where version.id = any($1::uuid[])
        group by version.laboratorio, version.versao, profile.profile_scope
        order by version.laboratorio, profile.profile_scope`,
      [
        [
          '08f91e88-40f5-4521-b476-d09c7f1955cf',
          '3e375a09-8a6d-4d54-aadb-c4e833e322b8',
        ],
      ],
    )

    console.log('\nUSAGE_PROFILES')
    for (const row of profileRows) console.log(JSON.stringify(row))

    const { rows: mixedRows } = await client.query(
      `select family.nome,
              count(distinct offer.id) as offers,
              count(distinct grid.id) as grids,
              count(distinct offer.id) filter (where grid.id is null) as offers_without_grid
         from public.global_lens_families family
         join public.global_lens_offers offer on offer.family_id = family.id
         left join public.global_offer_diopter_grids grid on grid.offer_id = offer.id
        where family.version_id = $1::uuid
        group by family.nome
        order by family.nome`,
      ['3e375a09-8a6d-4d54-aadb-c4e833e322b8'],
    )

    console.log('\nMIXED_FAMILIES')
    for (const row of mixedRows) console.log(JSON.stringify(row))

    const { rows: migrationColumns } = await client.query(
      `select column_name, data_type, is_nullable
         from information_schema.columns
        where table_schema = 'supabase_migrations'
          and table_name = 'schema_migrations'
        order by ordinal_position`,
    )
    const { rows: recentMigrations } = await client.query(
      `select *
         from supabase_migrations.schema_migrations
        order by version desc
        limit 8`,
    )

    console.log('\nMIGRATION_COLUMNS')
    for (const row of migrationColumns) console.log(JSON.stringify(row))
    console.log('\nRECENT_MIGRATIONS')
    for (const row of recentMigrations) console.log(JSON.stringify(row))
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
