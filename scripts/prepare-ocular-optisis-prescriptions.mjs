import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [exportArg = 'tmp/optisis-degrees-export.tsv', databaseUrlArg = process.env.LOCAL_SUPABASE_DB_URL, tenantId, storeIdArg, outputArg = 'tmp/ocular-optisis-prescriptions-plan.json', ...flags] = process.argv.slice(2)
const storeId = Number(storeIdArg)
const write = flags.includes('--write')
const productionMode = flags.includes('--production')
const productionConfirmed = flags.includes('--confirm-ocular-production-import')
const databaseUrl = databaseUrlArg === '--production-db' ? process.env.SUPABASE_DB_URL : databaseUrlArg
if (!databaseUrl || !tenantId || !Number.isInteger(storeId)) throw new Error('Uso: node scripts/prepare-ocular-optisis-prescriptions.mjs <export.tsv> <db-local-url> <tenant-id> <store-id> [saida.json] --write')
const isLocalDatabase = ['127.0.0.1', 'localhost', '::1'].includes(new URL(databaseUrl).hostname)
if (!isLocalDatabase && !(productionMode && productionConfirmed && databaseUrlArg === '--production-db')) throw new Error('Somente banco local é aceito. Produção exige --production-db --production --confirm-ocular-production-import.')

const text = (value) => String(value ?? '').trim()
const digits = (value) => text(value).replace(/\D/g, '')
const nameKey = (value) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const phoneKey = (value) => { const result = digits(value); return result.length >= 10 ? result : '' }
const degreeKey = (value) => text(value).replace(',', '.').replace(/^\+/, '').replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
const half = (value) => { const n = Number(text(value).replace(',', '.')); return Number.isFinite(n) && n > 0 ? String(n / 2).replace('.', ',') : '' }
const decode = (value) => Buffer.from(value, 'base64').toString('utf8')
const lines = readFileSync(resolve(exportArg), 'utf8').trim().split(/\r?\n/)
const customers = new Map(), purchases = [], lenses = new Map(), frames = new Map(), treatments = new Map()
for (const line of lines) {
  const [kind, ...encoded] = line.split('\t'); const fields = encoded.map(decode)
  if (kind === 'C') customers.set(fields[0], { id: fields[0], name: fields[1], cpf: fields[2], mobile: fields[3], phone: fields[4], birthDate: fields[5] })
  if (kind === 'L') lenses.set(fields[0], fields[1])
  if (kind === 'A') frames.set(fields[0], fields[1])
  if (kind === 'T') treatments.set(fields[0], fields[1])
  if (kind === 'P') purchases.push({
    id: fields[0], customerId: fields[1], date: fields[2], odSphere: fields[3], odCylinderMain: fields[4], odCylinderAlt: fields[5], odAxisMain: fields[6], odAxisAlt: fields[7],
    oeSphere: fields[8], oeCylinderMain: fields[9], oeCylinderAlt: fields[10], oeAxisMain: fields[11], oeAxisAlt: fields[12], nearOd: fields[13], nearOe: fields[14], addition: fields[15], dp: fields[16], height: fields[17], lenses: fields[18], frame: fields[19], treatment: fields[20], obs: fields[21], doctor: fields[22],
  })
}
const hasDegree = (row) => [row.odSphere,row.odCylinderMain,row.odCylinderAlt,row.odAxisMain,row.odAxisAlt,row.oeSphere,row.oeCylinderMain,row.oeCylinderAlt,row.oeAxisMain,row.oeAxisAlt,row.nearOd,row.nearOe,row.addition].some(text)
const resolveCatalogText = (value, catalog) => {
  const raw = text(value)
  return /^\d+$/.test(raw) ? (catalog.get(raw) || raw) : raw
}
const sourceSha256 = createHash('sha256').update(readFileSync(resolve(exportArg))).digest('hex')
const { Client } = await import('pg')
const client = new Client({ connectionString: databaseUrl }); await client.connect()
try {
  const { rows: targets } = await client.query('SELECT id,full_name,cpf,phone,fone_movel,birth_date FROM public.customers WHERE tenant_id=$1 AND store_id=$2', [tenantId, storeId])
  const { rows: histories } = await client.query(`SELECT customer_id,prescription_date,receita_longe_od_esferico,receita_longe_od_cilindrico,receita_longe_od_eixo,receita_longe_oe_esferico,receita_longe_oe_cilindrico,receita_longe_oe_eixo,receita_perto_od_esferico,receita_perto_oe_esferico,receita_adicao_od FROM public.customer_prescription_history WHERE store_id=$1`, [storeId])
  const add=(map,key,id)=>{if(!key)return;const set=map.get(key)||new Set();set.add(Number(id));map.set(key,set)}
  const one=(map,key)=>{const values=[...(map.get(key)||[])];return values.length===1?values[0]:null}
  const byCpf=new Map(),byNamePhone=new Map(),byNameBirth=new Map(),byName=new Map()
  for(const target of targets){const n=nameKey(target.full_name),p=phoneKey(target.phone||target.fone_movel),c=digits(target.cpf),b=target.birth_date||'';add(byCpf,c,target.id);add(byNamePhone,`${n}|${p}`,target.id);add(byNameBirth,`${n}|${b}`,target.id);add(byName,n,target.id)}
  const existing = new Set(histories.map((row)=>`${row.customer_id}|${row.prescription_date||''}|${[row.receita_longe_od_esferico,row.receita_longe_od_cilindrico,row.receita_longe_od_eixo,row.receita_longe_oe_esferico,row.receita_longe_oe_cilindrico,row.receita_longe_oe_eixo,row.receita_perto_od_esferico,row.receita_perto_oe_esferico,row.receita_adicao_od].map(degreeKey).join('|')}`))
  const records=[]
  for(const purchase of purchases){
    if(!hasDegree(purchase)) continue
    const customer=customers.get(purchase.customerId); const reasons=[]
    if(!customer) reasons.push('cliente_optisis_ausente')
    const n=nameKey(customer?.name), p=phoneKey(customer?.mobile)||phoneKey(customer?.phone), c=digits(customer?.cpf), b=customer?.birthDate||''
    const targetCustomerId=one(byCpf,c)||one(byNamePhone,`${n}|${p}`)||one(byNameBirth,`${n}|${b}`)||one(byName,n)
    if(!targetCustomerId) reasons.push('cliente_sem_correspondencia_inequivoca')
    const conflict=(main,alternative,label)=>text(main)&&text(alternative)&&degreeKey(main)!==degreeKey(alternative)?label:null
    for(const item of [conflict(purchase.odCylinderMain,purchase.odCylinderAlt,'divergencia_cilindro_od'),conflict(purchase.odAxisMain,purchase.odAxisAlt,'divergencia_eixo_od'),conflict(purchase.oeCylinderMain,purchase.oeCylinderAlt,'divergencia_cilindro_oe'),conflict(purchase.oeAxisMain,purchase.oeAxisAlt,'divergencia_eixo_oe')]) if(item) reasons.push(item)
    const clinical=[purchase.odSphere,purchase.odCylinderMain||purchase.odCylinderAlt,purchase.odAxisMain||purchase.odAxisAlt,purchase.oeSphere,purchase.oeCylinderMain||purchase.oeCylinderAlt,purchase.oeAxisMain||purchase.oeAxisAlt,purchase.nearOd,purchase.nearOe,purchase.addition]
    if(targetCustomerId && existing.has(`${targetCustomerId}|${purchase.date||''}|${clinical.map(degreeKey).join('|')}`)) reasons.push('duplicada_com_historico_ja_importado')
    const lensDescription=resolveCatalogText(purchase.lenses,lenses), frameDescription=resolveCatalogText(purchase.frame,frames), treatmentDescription=resolveCatalogText(purchase.treatment,treatments)
    const description=[lensDescription&&`Lentes: ${lensDescription}`,frameDescription&&`Armação: ${frameDescription}`,treatmentDescription&&`Tratamento: ${treatmentDescription}`,text(purchase.doctor)&&`Oftalmo: ${text(purchase.doctor)}`,text(purchase.obs)&&`Observação: ${text(purchase.obs)}`].filter(Boolean).join(' | ')
    records.push({sourceSystem:'optisis-ocular',sourceRecordKey:`optisis-tabcompra:${purchase.id}`,sourceCustomerId:purchase.customerId,targetCustomerId,legacyCustomer:customer||null,prescriptionDate:purchase.date||null,receita_longe_od_esferico:purchase.odSphere||null,receita_longe_od_cilindrico:purchase.odCylinderMain||purchase.odCylinderAlt||null,receita_longe_od_eixo:purchase.odAxisMain||purchase.odAxisAlt||null,receita_longe_oe_esferico:purchase.oeSphere||null,receita_longe_oe_cilindrico:purchase.oeCylinderMain||purchase.oeCylinderAlt||null,receita_longe_oe_eixo:purchase.oeAxisMain||purchase.oeAxisAlt||null,receita_perto_od_esferico:purchase.nearOd||null,receita_perto_oe_esferico:purchase.nearOe||null,receita_adicao_od:purchase.addition||null,receita_adicao_oe:purchase.addition||null,medida_dnp_od:half(purchase.dp)||null,medida_dnp_oe:half(purchase.dp)||null,medida_altura_od:half(purchase.height)||null,medida_altura_oe:half(purchase.height)||null,serviceDescription:description||null,raw:{...purchase, customer},importStatus:reasons.length?'review':'ready',reviewReasons:reasons})
  }
  const summary={exportRows:lines.length,legacyCustomers:customers.size,purchases:purchases.length,degreeCandidates:records.length,ready:records.filter(r=>r.importStatus==='ready').length,review:records.filter(r=>r.importStatus==='review').length,duplicatesWithCurrentHistory:records.filter(r=>r.reviewReasons.includes('duplicada_com_historico_ja_importado')).length,fieldDivergences:records.filter(r=>r.reviewReasons.some(x=>x.startsWith('divergencia_'))).length,unmatchedCustomers:records.filter(r=>r.reviewReasons.includes('cliente_sem_correspondencia_inequivoca')).length}
  const plan={generatedAt:new Date().toISOString(),sourceSystem:'optisis-ocular',sourceSha256,summary,records}
  if(write){
    const output=resolve(outputArg)
    const quote=(value)=>`"${String(value??'').replaceAll('"','""')}"`
    writeFileSync(output,`${JSON.stringify(plan,null,2)}\n`,'utf8')
    const csv=output.replace(/\.json$/,'-review.csv')
    writeFileSync(csv,['compra;cliente;data;motivos',...records.filter(r=>r.importStatus==='review').map(r=>[r.sourceRecordKey.replace('optisis-tabcompra:',''),r.legacyCustomer?.name||'',r.prescriptionDate||'',r.reviewReasons.join(' | ')].map(quote).join(';'))].join('\n'),'utf8')
    const manifest=output.replace(/\.json$/,'-customer-manifest.csv')
    const uniqueCustomers=new Map()
    for(const record of records.filter(r=>r.importStatus==='ready')) if(!uniqueCustomers.has(record.sourceCustomerId)) uniqueCustomers.set(record.sourceCustomerId,record)
    writeFileSync(manifest,['legacy_customer_id;action;target_customer_id;legacy_name;legacy_display_name;legacy_cpf;legacy_phones;legacy_birth_date;match_method',...Array.from(uniqueCustomers.values()).map(r=>[r.sourceCustomerId,'link_existing_customer',r.targetCustomerId,r.legacyCustomer?.name||'',r.legacyCustomer?.name||'',r.legacyCustomer?.cpf||'',`${r.legacyCustomer?.mobile||''} | ${r.legacyCustomer?.phone||''}`.replace(/^ \| $/,''),r.legacyCustomer?.birthDate||'','manual'].map(quote).join(';'))].join('\n'),'utf8')
    plan.artifacts={output,csv,manifest}
  }
  console.log(JSON.stringify({...summary,artifacts:plan.artifacts||null},null,2))
} finally { await client.end() }
