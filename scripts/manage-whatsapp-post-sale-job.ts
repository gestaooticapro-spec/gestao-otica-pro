/** Operacao administrativa: nunca imprime telefone, nomes ou credenciais. */
import dotenv from 'dotenv'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { runPostSaleFollowupJob } from '../src/lib/whatsapp/post-sale-followups'

dotenv.config({ path: '.env.local', quiet: true })
const mode = process.argv[2] || 'status'
const migrationVersion = '20261006120000'
const jobRevision = '20261006120000b'
const migrationFile = `supabase/migrations/${migrationVersion}_whatsapp_post_sale_job_audit.sql`

async function main() {
  if (mode === 'preview') {
    console.log(JSON.stringify(await runPostSaleFollowupJob({ dryRun: true }), null, 2))
    return
  }
  if (mode === 'run-production' || mode === 'preview-production') {
    if (process.argv.includes('--cron-host')) {
      // Usa a credencial vigente do cron sem copia-la para este computador.
      const runbook = readFileSync('WHATSAPP_VPS_RUNBOOK.local.md', 'utf8')
      const target = runbook.match(/^ssh\s+(root@[a-zA-Z0-9.:-]+)\s*$/m)?.[1]
      if (!target) throw new Error('cron_host_missing')
      const remote = `python3 - <<'PY'
import subprocess,re,json,urllib.request,urllib.error
cron=subprocess.check_output(['crontab','-l'],text=True)
line=next(x for x in cron.splitlines() if 'post-sale-followups' in x and not x.lstrip().startswith('#'))
m=re.search(r'Authorization:\\s*Bearer\\s+([^\\s\\"\\x27]+)',line)
if not m: raise SystemExit('cron_auth_not_inline')
url='https://gestao-otica-pro.vercel.app/api/whatsapp/post-sale-followups'
try: urllib.request.urlopen(url,timeout=20)
except urllib.error.HTTPError as e:
 if e.code!=401 or e.headers.get('X-Post-Sale-Job-Revision')!='${jobRevision}':raise SystemExit('updated_job_not_deployed')
else: raise SystemExit('unexpected_unauthenticated_response')
request=urllib.request.Request(url+'${mode === 'preview-production' ? '?dryRun=true' : ''}',headers={'Authorization':'Bearer '+m.group(1),'Cache-Control':'no-cache'})
try:
 with urllib.request.urlopen(request,timeout=60) as r: print(json.dumps({'status':r.status,'result':json.load(r)}))
except urllib.error.HTTPError as e: print(json.dumps({'status':e.code,'error':'production_request_failed'}));raise SystemExit(1)
PY`
      const encoded = Buffer.from(remote).toString('base64')
      const remoteResult = spawnSync(process.platform === 'win32' ? 'ssh.exe' : 'ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', target, `echo ${encoded} | base64 -d | bash`], { encoding: 'utf8', timeout: 90_000 })
      if (remoteResult.stdout) console.log(remoteResult.stdout.trim())
      if (remoteResult.status !== 0) throw new Error('cron_host_operation_failed')
      return
    }
    const production = dotenv.parse(readFileSync('.vercel/.env.production.local'))
    if (production.NEXT_PUBLIC_SUPABASE_URL !== process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('production_database_mismatch')
    const secret = production.WHATSAPP_INTERNAL_SECRET || production.CRON_SECRET
    if (!secret) throw new Error('production_secret_missing')
    const probe = await fetch('https://gestao-otica-pro.vercel.app/api/whatsapp/post-sale-followups', { cache: 'no-store' })
    if (probe.status !== 401 || probe.headers.get('X-Post-Sale-Job-Revision') !== jobRevision) throw new Error('updated_production_job_not_deployed')
    const response = await fetch(`https://gestao-otica-pro.vercel.app/api/whatsapp/post-sale-followups${mode === 'preview-production' ? '?dryRun=true' : ''}`, {
      headers: { Authorization: `Bearer ${secret}` }, cache: 'no-store',
    })
    const result = await response.json()
    console.log(JSON.stringify({ status: response.status, result }, null, 2))
    if (!response.ok) process.exitCode = 1
    return
  }
  if (!['status', 'apply-migration'].includes(mode)) throw new Error('unknown_mode')
  // pg possui tipos opcionais; manter a dependencia operacional ja instalada.
  const { Client } = await import('pg' as string)
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    if (mode === 'apply-migration') {
      const sql = readFileSync(migrationFile, 'utf8')
      await client.query('begin')
      try {
        const existing = await client.query('select version from supabase_migrations.schema_migrations where version=$1', [migrationVersion])
        if (existing.rowCount) throw new Error('migration_already_applied')
        await client.query(sql)
        await client.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)', [migrationVersion, 'whatsapp_post_sale_job_audit', [sql]])
        await client.query('commit')
        console.log(JSON.stringify({ applied: migrationVersion, sha256: createHash('sha256').update(sql).digest('hex') }))
      } catch (error) { await client.query('rollback'); throw error }
    }
    const review = await client.query(`select coalesce(p.status,'Sem acompanhamento') status,
      count(*)::int cases,
      count(*) filter(where not exists(select 1 from public.post_sales_interactions i where i.post_sales_id=p.id))::int without_interactions,
      count(*) filter(where exists(select 1 from public.whatsapp_post_sale_followups f where o.id=any(f.covered_service_order_ids)))::int covered
      from public.service_orders o left join public.post_sales p on p.service_order_id=o.id
      where o.store_id=1 and o.dt_entregue_em between now()-interval '30 days' and now()-interval '7 days' group by p.status`)
    const queue = await client.query(`select status,count(*)::int total from public.whatsapp_post_sale_followups where store_id=1 group by status`)
    const runs = await client.query(`select started_at,finished_at,status,result,error_code from public.whatsapp_post_sale_job_runs order by started_at desc limit 5`)
    console.log(JSON.stringify({ recentStoreOneReview: review.rows, queue: queue.rows, runs: runs.rows }, null, 2))
  } finally { await client.end() }
}

main().catch((error) => {
  // Nao imprimir erros de conexao que possam conter os dados de acesso.
  console.error(JSON.stringify({ error: typeof error?.code === 'string' ? error.code : 'operation_failed' }))
  process.exitCode = 1
})
