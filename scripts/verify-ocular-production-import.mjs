import { Client } from 'pg'

const [tenantId, storeIdArg] = process.argv.slice(2)
const storeId = Number(storeIdArg)
if (!process.env.SUPABASE_DB_URL || !tenantId || !Number.isInteger(storeId) || storeId <= 0) {
  throw new Error('Uso: node --env-file=.env.local scripts/verify-ocular-production-import.mjs <tenant-id> <store-id>')
}

const client = new Client({ connectionString: process.env.SUPABASE_DB_URL })
await client.connect()
try {
  const { rows } = await client.query(
    `WITH historical_sales AS (
       SELECT id FROM public.vendas
       WHERE store_id=$1 AND is_historical_import=true
     )
     SELECT
       (SELECT count(*) FROM public.stores WHERE id=$1 AND tenant_id=$2) AS store_ok,
       (SELECT count(*) FROM public.customers WHERE store_id=$1) AS customers_total,
       (SELECT count(*) FROM public.customer_external_references WHERE store_id=$1 AND source_system='ocular-intermediate-spreadsheets') AS customer_links,
       (SELECT count(*) FROM public.products WHERE store_id=$1) AS products_total,
       (SELECT count(*) FROM public.products WHERE store_id=$1 AND estoque_atual < 0) AS products_negative_stock,
       (SELECT count(*) FROM public.products WHERE store_id=$1 AND tipo_produto='Armacao') AS products_armacao,
       (SELECT count(*) FROM public.products WHERE store_id=$1 AND tipo_produto='Lente') AS products_lente,
       (SELECT count(*) FROM public.products WHERE store_id=$1 AND tipo_produto='Solar') AS products_solar,
       (SELECT count(*) FROM public.products WHERE store_id=$1 AND tipo_produto='Servico') AS products_servico,
       (SELECT count(*) FROM public.products WHERE store_id=$1 AND tipo_produto='Tratamento') AS products_tratamento,
       (SELECT count(*) FROM public.products WHERE store_id=$1 AND tipo_produto='Outro') AS products_outro,
       (SELECT count(*) FROM public.customer_prescription_history WHERE store_id=$1 AND source_system='ocular-intermediate-spreadsheets') AS prescriptions_spreadsheet,
       (SELECT count(*) FROM public.customer_prescription_history WHERE store_id=$1 AND source_system='optisis-ocular') AS prescriptions_optisis,
       (SELECT count(*) FROM historical_sales) AS historical_sales,
       (SELECT count(*) FROM public.financiamento_parcelas fp JOIN public.financiamento_loja fl ON fl.id=fp.financiamento_id JOIN historical_sales hs ON hs.id=fl.venda_id) AS installments,
       (SELECT COALESCE(sum(fp.valor_parcela),0) FROM public.financiamento_parcelas fp JOIN public.financiamento_loja fl ON fl.id=fp.financiamento_id JOIN historical_sales hs ON hs.id=fl.venda_id) AS installments_total,
       (SELECT count(*) FROM public.service_orders so JOIN historical_sales hs ON hs.id=so.venda_id) AS historical_service_orders,
       (SELECT count(*) FROM public.venda_itens vi JOIN historical_sales hs ON hs.id=vi.venda_id) AS historical_sale_items,
       (SELECT count(*) FROM public.pagamentos p JOIN historical_sales hs ON hs.id=p.venda_id) AS historical_payments`,
    [storeId, tenantId],
  )
  console.log(JSON.stringify({ tenantId, storeId, ...rows[0] }, null, 2))
} finally {
  await client.end()
}
