import { Client } from 'pg'

const [tenantId, storeIdArg] = process.argv.slice(2)
const storeId = Number(storeIdArg)
const databaseUrl = process.env.SUPABASE_DB_URL

if (!databaseUrl || !tenantId || !Number.isInteger(storeId) || storeId <= 0) {
  throw new Error('Uso: node --env-file=.env.local scripts/preflight-ocular-production.mjs <tenant-id> <store-id>')
}

const client = new Client({ connectionString: databaseUrl })
await client.connect()
try {
  const { rows } = await client.query(
    `SELECT
      (SELECT count(*) FROM public.stores WHERE id=$1 AND tenant_id=$2) AS store_ok,
      (SELECT count(*) FROM public.customers WHERE store_id=$1) AS customers,
      (SELECT count(*) FROM public.products WHERE store_id=$1) AS products,
      (SELECT count(*) FROM public.vendas WHERE store_id=$1 AND is_historical_import) AS historical_sales,
      (SELECT count(*) FROM public.customer_prescription_history WHERE store_id=$1 AND source_system IN ('ocular-intermediate-spreadsheets', 'optisis-ocular')) AS imported_prescriptions`,
    [storeId, tenantId],
  )
  console.log(JSON.stringify({ tenantId, storeId, ...rows[0] }, null, 2))
} finally {
  await client.end()
}
