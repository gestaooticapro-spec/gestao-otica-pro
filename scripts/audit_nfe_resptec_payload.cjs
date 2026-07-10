const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

function loadEnv() {
  const text = fs.readFileSync('.env.local', 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
    process.env[key] = process.env[key] || value
  }
}

function cleanDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function mask(value) {
  if (!value) return null
  const text = String(value)
  return `${text.slice(0, 4)}...${text.slice(-4)} (${text.length})`
}

async function main() {
  loadEnv()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase URL/service role key nao encontrados.')

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await supabase
    .from('fiscal_invoices')
    .select('id, created_at, status, numero, serie, chave_acesso, error_message, payload_json')
    .eq('tipo_documento', 'NFe')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw error
  const invoice = data && data[0]
  if (!invoice) throw new Error('Nenhuma NF-e encontrada em fiscal_invoices.')

  const inf = invoice.payload_json && invoice.payload_json.infNFe
  const resp = inf && inf.infRespTec
  if (!inf || !resp) throw new Error('payload_json.infNFe.infRespTec nao encontrado.')

  const report = {
    invoice: {
      id: invoice.id,
      created_at: invoice.created_at,
      status: invoice.status,
      numero: invoice.numero,
      serie: invoice.serie,
      chave_acesso: invoice.chave_acesso,
      error_message: invoice.error_message,
    },
    emit: {
      CNPJ: inf.emit && inf.emit.CNPJ,
      IE: inf.emit && inf.emit.IE,
      UF: inf.emit && inf.emit.enderEmit && inf.emit.enderEmit.UF,
    },
    infRespTec: {
      CNPJ: resp.CNPJ,
      xContato: resp.xContato,
      email: resp.email,
      fone: resp.fone,
      idCSRT: resp.idCSRT,
      CSRT: mask(resp.CSRT),
      CSRT_length: resp.CSRT ? String(resp.CSRT).length : null,
      has_raw_CSRT: Object.prototype.hasOwnProperty.call(resp, 'CSRT'),
      has_hashCSRT: Object.prototype.hasOwnProperty.call(resp, 'hashCSRT'),
    },
    checks: {
      resptec_cnpj_is_mente_binaria: cleanDigits(resp.CNPJ) === '65667543000102',
      resptec_cnpj_is_not_emitente: cleanDigits(resp.CNPJ) !== cleanDigits(inf.emit && inf.emit.CNPJ),
      resptec_cnpj_is_not_tryideas: cleanDigits(resp.CNPJ) !== '10720060000132',
      idCSRT_is_homologation_1: Number(resp.idCSRT) === 1,
      payload_has_raw_CSRT: Object.prototype.hasOwnProperty.call(resp, 'CSRT'),
      payload_has_no_hashCSRT: !Object.prototype.hasOwnProperty.call(resp, 'hashCSRT'),
      csrt_matches_env: resp.CSRT === process.env.NFE_CSRT_TOKEN_HOMOLOGATION,
    },
    env: {
      NFE_RT_CNPJ: process.env.NFE_RT_CNPJ,
      NFE_CSRT_ID_HOMOLOGATION: process.env.NFE_CSRT_ID_HOMOLOGATION,
      NFE_CSRT_TOKEN_HOMOLOGATION: mask(process.env.NFE_CSRT_TOKEN_HOMOLOGATION),
    },
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
