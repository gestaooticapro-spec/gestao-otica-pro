import 'dotenv/config'
import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

/* eslint-disable @typescript-eslint/no-explicit-any */

loadDotenv({ path: '.env.local', override: true })

type Environment = 'production' | 'homologation'

type Args = {
  cnpj?: string
  key?: string
  nsu?: number
  storeId?: number
  env: Environment
  ignoreWait: boolean
}

function onlyDigits(value?: string | null) {
  return String(value || '').replace(/\D/g, '')
}

function parseArgs(): Args {
  const args: Args = { env: 'production', ignoreWait: false }
  const parts = process.argv.slice(2)

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const next = parts[i + 1]

    if (part === '--cnpj') {
      args.cnpj = onlyDigits(next)
      i++
    } else if (part === '--store-id') {
      args.storeId = Number(next)
      i++
    } else if (part === '--key' || part === '--chave') {
      args.key = onlyDigits(next)
      i++
    } else if (part === '--nsu') {
      args.nsu = Number(next || 0)
      i++
    } else if (part === '--env') {
      args.env = next === 'homologation' ? 'homologation' : 'production'
      i++
    } else if (part === '--ignore-wait') {
      args.ignoreWait = true
    }
  }

  return args
}

async function resolveCnpjFromStore(storeId: number) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes no .env.local.')
  }

  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('id, name, tenant_id, cnpj')
    .eq('id', storeId)
    .single()

  if (storeError || !store) {
    throw new Error(`Loja ${storeId} nao encontrada: ${storeError?.message || 'sem retorno'}`)
  }

  const storeCnpj = onlyDigits(store.cnpj)
  if (storeCnpj) {
    return {
      cnpj: storeCnpj,
      source: 'stores.cnpj',
      store: { id: store.id, name: store.name, tenant_id: store.tenant_id },
    }
  }

  const { data: company, error: companyError } = await supabase
    .from('company_settings')
    .select('cnpj, cpf_cnpj')
    .eq('organization_id', store.tenant_id)
    .maybeSingle()

  if (companyError) {
    throw new Error(`Erro ao buscar company_settings do tenant da loja ${storeId}: ${companyError.message}`)
  }

  const companyCnpj = onlyDigits(company?.cnpj || company?.cpf_cnpj)
  if (!companyCnpj) {
    throw new Error(`Loja ${storeId} nao tem CNPJ em stores.cnpj nem em company_settings.`)
  }

  return {
    cnpj: companyCnpj,
    source: 'company_settings',
    store: { id: store.id, name: store.name, tenant_id: store.tenant_id },
  }
}

function baseUrl(environment: Environment) {
  return environment === 'production'
    ? (process.env.NUVEMFISCAL_PROD_URL || 'https://api.nuvemfiscal.com.br')
    : (process.env.NUVEMFISCAL_HOM_URL || 'https://api.sandbox.nuvemfiscal.com.br')
}

async function getToken(environment: Environment) {
  const clientId = environment === 'production'
    ? process.env.NUVEMFISCAL_PROD_CLIENT_ID
    : process.env.NUVEMFISCAL_HOM_CLIENT_ID
  const clientSecret = environment === 'production'
    ? process.env.NUVEMFISCAL_PROD_CLIENT_SECRET
    : process.env.NUVEMFISCAL_HOM_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error(`Credenciais Nuvem Fiscal ausentes para ${environment}.`)
  }

  const body = new URLSearchParams()
  body.set('grant_type', 'client_credentials')
  body.set('client_id', clientId)
  body.set('client_secret', clientSecret)
  body.set('scope', 'empresa nfe distribuicao-nfe')

  const response = await fetch('https://auth.nuvemfiscal.com.br/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}

  if (!response.ok) {
    throw new Error(`Auth Nuvem Fiscal ${response.status}: ${text}`)
  }

  return String(payload.access_token)
}

async function fetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  const text = await response.text()
  let payload: any = null

  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }

  return { ok: response.ok, status: response.status, payload, text }
}

function summarizeCompany(payload: any) {
  if (!payload || typeof payload !== 'object') return payload
  return {
    cpf_cnpj: payload.cpf_cnpj,
    nome_razao_social: payload.nome_razao_social,
    nome_fantasia: payload.nome_fantasia,
    uf: payload.endereco?.uf,
    cert_thumbprint: payload.certificado?.thumbprint || payload.cert?.thumbprint,
    cert_validade: payload.certificado?.data_validade || payload.cert?.data_validade,
  }
}

function summarizeDistribution(payload: any) {
  const documentos = Array.isArray(payload?.documentos) ? payload.documentos : []
  return {
    codigo_status: payload?.codigo_status ?? payload?.cStat ?? null,
    motivo_status: payload?.motivo_status ?? payload?.xMotivo ?? null,
    ultimo_nsu: payload?.ultimo_nsu ?? payload?.ultNSU ?? null,
    max_nsu: payload?.max_nsu ?? payload?.maxNSU ?? null,
    documentos_count: documentos.length,
    documentos_preview: documentos.slice(0, 10).map((doc: any) => ({
      id: doc.id,
      nsu: doc.nsu,
      tipo_documento: doc.tipo_documento,
      chave_acesso: doc.chave_acesso,
      resumo: doc.resumo,
      emitente: doc.emitente_nome_razao_social,
      emitente_cnpj: doc.emitente_cpf_cnpj,
      data_emissao: doc.data_emissao,
      valor_nfe: doc.valor_nfe,
      schema: doc.schema,
    })),
  }
}

async function main() {
  const args = parseArgs()
  const resolved = args.storeId ? await resolveCnpjFromStore(args.storeId) : null
  const cnpj = onlyDigits(resolved?.cnpj || args.cnpj)

  if (!/^\d{14}$/.test(cnpj)) {
    throw new Error('Use: npx tsx scripts/debug_nfe_distribution.ts --store-id 1 [--nsu 0] [--key 44digitos] ou --cnpj 00000000000000')
  }

  if (args.key && !/^\d{44}$/.test(args.key)) {
    throw new Error('A chave de acesso precisa ter 44 digitos.')
  }

  const url = baseUrl(args.env)
  const token = await getToken(args.env)
  const ambiente = args.env === 'production' ? 'producao' : 'homologacao'

  console.log('[debug] ambiente:', args.env, ambiente)
  console.log('[debug] cnpj:', cnpj)
  if (resolved) {
    console.log('[debug] origem cnpj:', resolved.source)
    console.log('[debug] loja:', JSON.stringify(resolved.store, null, 2))
  }
  console.log('[debug] baseUrl:', url)

  const company = await fetchJson(`${url}/empresas/${cnpj}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  console.log('[empresa] status:', company.status)
  console.log('[empresa] resumo:', JSON.stringify(summarizeCompany(company.payload), null, 2))

  const distConfig = await fetchJson(`${url}/empresas/${cnpj}/distnfe`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ambiente,
      distribuicao_automatica: false,
      ciencia_automatica: false,
    }),
  })
  console.log('[distnfe config] status:', distConfig.status)
  if (!distConfig.ok) {
    console.log('[distnfe config] erro:', distConfig.text)
  }

  const distBody = args.key
    ? {
        cpf_cnpj: cnpj,
        ambiente,
        tipo_consulta: 'cons-chave',
        cons_chave: args.key,
        ignorar_tempo_espera: args.ignoreWait,
      }
    : {
        cpf_cnpj: cnpj,
        ambiente,
        tipo_consulta: 'dist-nsu',
        dist_nsu: Number.isFinite(args.nsu) ? args.nsu : 0,
        ignorar_tempo_espera: args.ignoreWait,
      }

  console.log('[consulta] request:', JSON.stringify(distBody, null, 2))

  const dist = await fetchJson(`${url}/distribuicao/nfe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(distBody),
  })

  console.log('[consulta] status:', dist.status)
  console.log('[consulta] resumo:', JSON.stringify(summarizeDistribution(dist.payload), null, 2))

  if (!dist.ok) {
    console.log('[consulta] erro bruto:', dist.text)
  }
}

main().catch((error) => {
  console.error('[debug] falha:', error instanceof Error ? error.message : error)
  process.exit(1)
})
