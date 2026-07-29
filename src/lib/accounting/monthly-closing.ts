import JSZip from 'jszip'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import nodemailer from 'nodemailer'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreModules, type StoreSettings } from '@/lib/store-modules'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const ACCOUNTING_TIME_ZONE = 'America/Sao_Paulo'
const STALE_PROCESSING_MS = 15 * 60 * 1000
const MAX_SINGLE_XML_BYTES = 4 * 1024 * 1024
const MAX_RAW_XML_BYTES = 20 * 1024 * 1024

type StoreRecord = {
  id: number
  tenant_id: string
  name: string
  razao_social: string | null
  cnpj: string | null
  contador_email: string | null
  settings: StoreSettings | null
}

type FiscalInvoice = {
  id: string | number
  direction: string | null
  tipo_documento: string | null
  numero: string | null
  serie: string | null
  status: string | null
  valor_total: number | null
  chave_acesso: string | null
  xml_content: string | null
  xml_url: string | null
  motivo_rejeicao: string | null
  error_message: string | null
  data_emissao: string | null
  created_at: string
}

type Inutilization = {
  model: string | null
  environment: string | null
  year: number
  serie: number
  numero_inicial: number
  numero_final: number
  justificativa: string | null
  protocol: string | null
  status: string | null
  response_json: unknown
  created_at: string
}

export type AccountantClosingLog = {
  year: number
  month: number
  status: 'processing' | 'success' | 'error'
  attempt_count: number
  last_attempt_at: string | null
  sent_at: string | null
  error_message: string | null
}

export type AccountantClosingResult = {
  success: boolean
  skipped?: boolean
  message: string
  log?: AccountantClosingLog | null
}

export function getAccountantClosingPeriodBounds(year: number, month: number) {
  const start = fromZonedTime(`${year}-${String(month).padStart(2, '0')}-01T00:00:00`, ACCOUNTING_TIME_ZONE)
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const end = fromZonedTime(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00`, ACCOUNTING_TIME_ZONE)
  return { start: start.toISOString(), end: end.toISOString() }
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function escapeAccountantCsvCell(value: unknown) {
  let normalized = String(value ?? '').replace(/\r?\n/g, ' ')
  if (/^[=+\-@]/.test(normalized)) normalized = `'${normalized}`
  return /[;"]/u.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized
}

function toCsv(rows: unknown[][]) {
  return `\ufeff${rows.map((row) => row.map(escapeAccountantCsvCell).join(';')).join('\n')}`
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 120) || 'documento'
}

export function getAccountantXmlFileName(invoice: Pick<FiscalInvoice, 'id' | 'tipo_documento' | 'direction' | 'serie' | 'numero' | 'chave_acesso'>) {
  return safeFileName([
    invoice.tipo_documento || 'Fiscal',
    invoice.direction || 'documento',
    `S${invoice.serie || '0'}`,
    invoice.numero || invoice.chave_acesso || invoice.id,
  ].join('_'))
}

export function escapeAccountantEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character] || character))
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : 'Erro desconhecido ao enviar o fechamento.'
}

function isProductionDocument(invoice: FiscalInvoice) {
  return invoice.status !== 'draft'
}

async function resolveXmlContent(invoice: FiscalInvoice) {
  if (invoice.xml_content) return invoice.xml_content
  if (!invoice.xml_url) return null

  try {
    const url = new URL(invoice.xml_url)
    if (url.protocol !== 'https:') return null
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!response.ok) return null
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > MAX_SINGLE_XML_BYTES || !response.body) return null
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_SINGLE_XML_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const content = new TextDecoder().decode(bytes)
    return content.trim() ? content : null
  } catch {
    return null
  }
}

async function getStore(storeId: number): Promise<StoreRecord | null> {
  const admin = createAdminClient() as any
  const { data, error } = await admin
    .from('stores')
    .select('id, tenant_id, name, razao_social, cnpj, contador_email, settings')
    .eq('id', storeId)
    .maybeSingle()

  if (error) throw new Error(`Não foi possível carregar a loja: ${error.message}`)
  return data as StoreRecord | null
}

async function getLog(storeId: number, year: number, month: number): Promise<AccountantClosingLog | null> {
  const admin = createAdminClient() as any
  const { data, error } = await admin
    .from('monthly_accountant_closing_logs')
    .select('year, month, status, attempt_count, last_attempt_at, sent_at, error_message')
    .eq('store_id', storeId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()

  if (error) throw new Error(`Não foi possível consultar o log de envio: ${error.message}`)
  const log = data as AccountantClosingLog | null
  if (log?.status === 'processing' && log.last_attempt_at && Date.now() - new Date(log.last_attempt_at).getTime() > STALE_PROCESSING_MS) {
    const staleMessage = 'A tentativa anterior excedeu o tempo esperado. O envio pode ser tentado novamente.'
    const { error: staleError } = await admin
      .from('monthly_accountant_closing_logs')
      .update({ status: 'error', error_message: staleMessage, updated_at: new Date().toISOString() })
      .eq('store_id', storeId)
      .eq('year', year)
      .eq('month', month)
      .eq('status', 'processing')
    if (staleError) throw new Error(`Não foi possível recuperar o envio em processamento: ${staleError.message}`)
    return { ...log, status: 'error', error_message: staleMessage }
  }
  return log
}

async function saveLog(
  store: StoreRecord,
  year: number,
  month: number,
  values: Partial<AccountantClosingLog>
) {
  const admin = createAdminClient() as any
  const current = await getLog(store.id, year, month)
  const now = new Date().toISOString()
  const hasValue = (key: keyof AccountantClosingLog) => Object.prototype.hasOwnProperty.call(values, key)
  const payload = {
    tenant_id: store.tenant_id,
    store_id: store.id,
    year,
    month,
    status: values.status ?? current?.status ?? 'processing',
    attempt_count: values.attempt_count ?? current?.attempt_count ?? 0,
    last_attempt_at: hasValue('last_attempt_at') ? values.last_attempt_at ?? null : current?.last_attempt_at ?? now,
    sent_at: hasValue('sent_at') ? values.sent_at ?? null : current?.sent_at ?? null,
    error_message: hasValue('error_message') ? values.error_message ?? null : current?.error_message ?? null,
    updated_at: now,
  }

  const { error } = await admin
    .from('monthly_accountant_closing_logs')
    .upsert(payload, { onConflict: 'store_id,year,month' })

  if (error) throw new Error(`Não foi possível atualizar o log de envio: ${error.message}`)
  return getLog(store.id, year, month)
}

type ClosingLock = { acquired: boolean; reason: 'acquired' | 'success' | 'processing' | 'unavailable' }

async function acquireClosingLock(store: StoreRecord, year: number, month: number, allowResend: boolean): Promise<ClosingLock> {
  const admin = createAdminClient() as any
  const { data, error } = await admin.rpc('acquire_monthly_accountant_closing_lock', {
    p_tenant_id: store.tenant_id,
    p_store_id: store.id,
    p_year: year,
    p_month: month,
    p_allow_resend: allowResend,
  })
  if (error) throw new Error(`Não foi possível reservar o envio do fechamento: ${error.message}`)
  const result = Array.isArray(data) ? data[0] : data
  return {
    acquired: result?.acquired === true,
    reason: result?.reason || 'unavailable',
  }
}

async function loadInvoices(store: StoreRecord, year: number, month: number) {
  const admin = createAdminClient() as any
  const { start, end } = getAccountantClosingPeriodBounds(year, month)
  const fields = 'id, direction, tipo_documento, numero, serie, status, valor_total, chave_acesso, xml_content, xml_url, motivo_rejeicao, error_message, data_emissao, created_at'

  const [datedResult, fallbackResult] = await Promise.all([
    admin.from('fiscal_invoices').select(fields)
      .eq('organization_id', store.tenant_id).eq('store_id', store.id)
      .or('environment.is.null,environment.neq.homologation')
      .gte('data_emissao', start).lt('data_emissao', end),
    admin.from('fiscal_invoices').select(fields)
      .eq('organization_id', store.tenant_id).eq('store_id', store.id)
      .or('environment.is.null,environment.neq.homologation')
      .is('data_emissao', null).gte('created_at', start).lt('created_at', end),
  ])

  if (datedResult.error || fallbackResult.error) {
    throw new Error(`Não foi possível buscar documentos fiscais: ${datedResult.error?.message || fallbackResult.error?.message}`)
  }

  return ([...(datedResult.data || []), ...(fallbackResult.data || [])] as FiscalInvoice[])
    .filter((invoice) => isProductionDocument(invoice))
    .filter((invoice, index, list) => list.findIndex((item) => String(item.id) === String(invoice.id)) === index)
}

async function loadInutilizations(store: StoreRecord, year: number) {
  const admin = createAdminClient() as any
  const { data, error } = await admin
    .from('fiscal_inutilizations')
    .select('model, environment, year, serie, numero_inicial, numero_final, justificativa, protocol, status, response_json, created_at')
    .eq('store_id', store.id)
    .eq('year', year)
    .eq('environment', 'production')
    .order('created_at', { ascending: false })

  if (error) {
    // O relatório continua válido em instalações antigas que ainda não possuem esta tabela.
    if (error.code === '42P01') return [] as Inutilization[]
    throw new Error(`Não foi possível buscar inutilizações fiscais: ${error.message}`)
  }
  return (data || []) as Inutilization[]
}

async function buildClosingZip(store: StoreRecord, year: number, month: number) {
  const [invoices, inutilizations] = await Promise.all([
    loadInvoices(store, year, month),
    loadInutilizations(store, year),
  ])
  const zip = new JSZip()
  const folderName = `Fechamento_Fiscal_${safeFileName(MONTHS[month - 1])}_${year}`
  const root = zip.folder(folderName)
  if (!root) throw new Error('Não foi possível criar o pacote de fechamento.')

  const authorized = invoices.filter((invoice) => invoice.status === 'authorized')
  const cancelled = invoices.filter((invoice) => invoice.status === 'cancelled')
  const rejected = invoices.filter((invoice) => ['rejected', 'error'].includes(invoice.status || ''))
  const other = invoices.filter((invoice) => !['authorized', 'cancelled', 'rejected', 'error'].includes(invoice.status || ''))
  const totalAuthorized = authorized.reduce((sum, invoice) => sum + Number(invoice.valor_total || 0), 0)
  const documentTotals = ['NFCe', 'NFe', 'NFSe'].map((documentType) => {
    const matching = authorized.filter((invoice) => invoice.tipo_documento === documentType)
    return [documentType, matching.length, matching.reduce((sum, invoice) => sum + Number(invoice.valor_total || 0), 0)]
  })

  root.file('Resumo_Fiscal.csv', toCsv([
    ['RELATÓRIO DE FECHAMENTO FISCAL'],
    ['Período', `${MONTHS[month - 1]} / ${year}`],
    ['Loja', store.name],
    ['Razão social', store.razao_social || ''],
    ['CNPJ', store.cnpj || ''],
    [],
    ['RESUMO'],
    ['Documentos autorizados', authorized.length],
    ['Documentos cancelados', cancelled.length],
    ['Documentos rejeitados/com erro', rejected.length],
    ['Documentos pendentes', other.length],
    ['Valor total autorizado', totalAuthorized.toFixed(2)],
    [],
    ['POR MODELO', 'QUANTIDADE', 'VALOR AUTORIZADO'],
    ...documentTotals.map(([type, quantity, total]) => [type, quantity, Number(total).toFixed(2)]),
    [],
    ['ENTRADAS', authorized.filter((invoice) => invoice.direction === 'entry').length,
      authorized.filter((invoice) => invoice.direction === 'entry').reduce((sum, invoice) => sum + Number(invoice.valor_total || 0), 0).toFixed(2)],
    ['SAÍDAS', authorized.filter((invoice) => invoice.direction === 'output').length,
      authorized.filter((invoice) => invoice.direction === 'output').reduce((sum, invoice) => sum + Number(invoice.valor_total || 0), 0).toFixed(2)],
  ]))

  const pdf = new jsPDF()
  pdf.setFontSize(16)
  pdf.text('Relatório de Fechamento Fiscal', 14, 20)
  pdf.setFontSize(10)
  pdf.text(`Período: ${MONTHS[month - 1]} / ${year}`, 14, 28)
  pdf.text(`Loja: ${store.name}`, 14, 34)
  if (store.cnpj) pdf.text(`CNPJ: ${store.cnpj}`, 14, 40)
  autoTable(pdf, {
    startY: store.cnpj ? 48 : 42,
    head: [['Indicador', 'Quantidade / Valor']],
    body: [
      ['Documentos autorizados', String(authorized.length)],
      ['Valor autorizado', formatCurrency(totalAuthorized)],
      ['Documentos cancelados', String(cancelled.length)],
      ['Documentos rejeitados/com erro', String(rejected.length)],
      ['Documentos pendentes', String(other.length)],
      ['Inutilizações no ano', String(inutilizations.length)],
    ],
  })
  autoTable(pdf, {
    startY: (pdf as any).lastAutoTable.finalY + 10,
    head: [['Modelo', 'Autorizadas', 'Valor autorizado']],
    body: documentTotals.map(([type, quantity, total]) => [String(type), String(quantity), formatCurrency(Number(total))]),
  })
  root.file('Resumo_Fiscal.pdf', pdf.output('arraybuffer'))

  const missingXml: unknown[][] = [['TIPO', 'DIREÇÃO', 'NÚMERO', 'STATUS', 'CHAVE', 'XML_URL']]
  let rawXmlBytes = 0
  for (const invoice of invoices) {
    const xmlContent = await resolveXmlContent(invoice)
    if (!xmlContent) {
      missingXml.push([
        invoice.tipo_documento || '', invoice.direction || '', invoice.numero || '', invoice.status || '', invoice.chave_acesso || '', invoice.xml_url || '',
      ])
      continue
    }

    rawXmlBytes += Buffer.byteLength(xmlContent, 'utf8')
    if (rawXmlBytes > MAX_RAW_XML_BYTES) {
      throw new Error('Os XMLs do período excedem o limite seguro para envio por e-mail. Baixe o fechamento manualmente ou reduza o período.')
    }
    const baseName = getAccountantXmlFileName(invoice)
    const targetFolder = invoice.status === 'cancelled'
      ? 'XMLs_Cancelados'
      : invoice.direction === 'entry'
        ? 'XMLs_Entrada'
        : 'XMLs_Saida'
    const prefix = invoice.status === 'cancelled' ? 'Cancelado_' : ''
    root.folder(targetFolder)?.file(`${prefix}${baseName}.xml`, xmlContent)
  }
  root.file('Documentos_sem_XML.csv', toCsv(missingXml))

  root.file('Documentos_Rejeitados.csv', toCsv([
    ['TIPO', 'DIREÇÃO', 'NÚMERO', 'STATUS', 'MOTIVO', 'CHAVE'],
    ...rejected.map((invoice) => [
      invoice.tipo_documento || '', invoice.direction || '', invoice.numero || '', invoice.status || '',
      invoice.motivo_rejeicao || invoice.error_message || '', invoice.chave_acesso || '',
    ]),
  ]))

  root.file('Documentos_Pendentes.csv', toCsv([
    ['TIPO', 'DIREÇÃO', 'NÚMERO', 'STATUS', 'VALOR', 'CHAVE'],
    ...other.map((invoice) => [
      invoice.tipo_documento || '', invoice.direction || '', invoice.numero || '', invoice.status || '', invoice.valor_total || 0, invoice.chave_acesso || '',
    ]),
  ]))

  root.file('Inutilizacoes_Fiscais.csv', toCsv([
    ['MODELO', 'AMBIENTE', 'ANO', 'SÉRIE', 'NÚMERO INICIAL', 'NÚMERO FINAL', 'PROTOCOLO', 'STATUS', 'DATA', 'JUSTIFICATIVA'],
    ...inutilizations.map((item) => [
      item.model || '', item.environment || '', item.year, item.serie, item.numero_inicial, item.numero_final,
      item.protocol || '', item.status || '', item.created_at, item.justificativa || '',
    ]),
  ]))

  if (inutilizations.length) {
    const folder = root.folder('Comprovantes_Inutilizacao')
    inutilizations.forEach((item) => {
      const name = safeFileName(`${item.model || 'Fiscal'}_S${item.serie}_${item.numero_inicial}-${item.numero_final}_${item.year}.json`)
      folder?.file(name, JSON.stringify(item.response_json || {}, null, 2))
    })
  }

  return {
    fileName: `${folderName}.zip`,
    buffer: Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })),
    summary: { documentCount: invoices.length, missingXmlCount: missingXml.length - 1 },
  }
}

function getMailConfig() {
  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST || ''
  const port = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 465)
  const user = (process.env.SMTP_USER || process.env.EMAIL_USER || '').trim()
  const pass = (process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim()
  const fromEmail = (process.env.SMTP_FROM_EMAIL || user).trim()
  const fromName = (process.env.SMTP_FROM_NAME || 'MB Optical').trim()
  const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false'

  if (!host || !Number.isInteger(port) || !user || !pass || !fromEmail) {
    throw new Error('Configuração SMTP incompleta no servidor.')
  }
  return { host, port, user, pass, fromEmail, fromName, rejectUnauthorized }
}

function hasValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function getAccountantClosingLog(storeId: number, year: number, month: number) {
  return getLog(storeId, year, month)
}

export async function sendMonthlyAccountantClosing(input: {
  storeId: number
  year: number
  month: number
  allowResend?: boolean
}): Promise<AccountantClosingResult> {
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12 || !Number.isInteger(input.year) || input.year < 2000) {
    return { success: false, message: 'Período inválido.' }
  }

  let store: StoreRecord | null = null
  try {
    store = await getStore(input.storeId)
    if (!store) return { success: false, message: 'Loja não encontrada.' }
    if (!getStoreModules(store.settings).fiscal) return { success: false, skipped: true, message: 'Módulo fiscal desativado para esta loja.' }
    if (!store.contador_email || !hasValidEmail(store.contador_email.trim())) {
      const log = await saveLog(store, input.year, input.month, {
        status: 'error',
        error_message: 'E-mail do contador ausente ou inválido. Acesse Configurações para cadastrá-lo.',
      })
      return { success: false, message: log?.error_message || 'E-mail do contador ausente ou inválido.', log }
    }

    const lock = await acquireClosingLock(store, input.year, input.month, input.allowResend === true)
    if (!lock.acquired) {
      const log = await getLog(store.id, input.year, input.month)
      const message = lock.reason === 'success'
        ? 'O fechamento desta competência já foi enviado.'
        : 'Já existe um envio em processamento para esta competência.'
      return { success: true, skipped: true, message, log }
    }

    const [{ fileName, buffer, summary }, mail] = await Promise.all([
      buildClosingZip(store, input.year, input.month),
      Promise.resolve(getMailConfig()),
    ])

    if (buffer.length > 22 * 1024 * 1024) {
      throw new Error('O pacote fiscal excede 22 MB e não pode ser enviado por e-mail. Baixe o fechamento manualmente ou reduza o período.')
    }

    const transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.port === 465,
      auth: { user: mail.user, pass: mail.pass },
      tls: { rejectUnauthorized: mail.rejectUnauthorized },
    })
    const safeStoreName = escapeAccountantEmailHtml(store.name)
    await transporter.sendMail({
      from: `${mail.fromName} <${mail.fromEmail}>`,
      to: store.contador_email.trim(),
      subject: `Fechamento Fiscal — ${store.name.replace(/[\r\n]/g, ' ')} — ${MONTHS[input.month - 1]}/${input.year}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;padding:24px">
        <h2 style="margin:0 0 12px">Fechamento Fiscal</h2>
        <p>Segue o pacote fiscal de <strong>${MONTHS[input.month - 1]}/${input.year}</strong> da loja <strong>${safeStoreName}</strong>.</p>
        <p>O arquivo contém XMLs disponíveis, documentos cancelados, rejeições, inutilizações e resumos em PDF e CSV.</p>
        <p style="color:#666;font-size:12px">${summary.documentCount} documento(s) consolidado(s); ${summary.missingXmlCount} sem XML armazenado no sistema.</p>
      </div>`,
      attachments: [{ filename: fileName, content: buffer, contentType: 'application/zip' }],
    })

    const log = await saveLog(store, input.year, input.month, {
      status: 'success',
      sent_at: new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      error_message: null,
    })
    return { success: true, message: 'Fechamento enviado ao contador com sucesso.', log }
  } catch (error) {
    const message = normalizeError(error)
    if (store) {
      try {
        const log = await saveLog(store, input.year, input.month, {
          status: 'error',
          last_attempt_at: new Date().toISOString(),
          error_message: message,
        })
        return { success: false, message, log }
      } catch (logError) {
        console.error('[Accountant closing] failed to persist error log', logError)
      }
    }
    return { success: false, message }
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, callback: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const worker = async () => {
    while (true) {
      const index = nextIndex++
      if (index >= items.length) return
      results[index] = await callback(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export async function runMonthlyAccountantClosingJob() {
  const admin = createAdminClient() as any
  const nowInBrazil = toZonedTime(new Date(), ACCOUNTING_TIME_ZONE)
  const year = nowInBrazil.getMonth() === 0 ? nowInBrazil.getFullYear() - 1 : nowInBrazil.getFullYear()
  const month = nowInBrazil.getMonth() === 0 ? 12 : nowInBrazil.getMonth()
  const { data, error } = await admin
    .from('stores')
    .select('id, contador_email, settings')
    .not('contador_email', 'is', null)

  if (error) throw new Error(`Não foi possível listar lojas para o fechamento: ${error.message}`)
  const eligibleStores = (data || []) as Pick<StoreRecord, 'id' | 'contador_email' | 'settings'>[]
  const storesToProcess = eligibleStores
    .filter((store) => Boolean(store.contador_email) && getStoreModules(store.settings).fiscal)
  const results = await mapWithConcurrency(storesToProcess, 2, async (store) => ({
    storeId: store.id,
    ...(await sendMonthlyAccountantClosing({ storeId: store.id, year, month })),
  }))

  return {
    year,
    month,
    processed: results.length,
    sent: results.filter((result) => result.success && !result.skipped).length,
    skipped: results.filter((result) => result.skipped).length,
    failed: results.filter((result) => !result.success).length,
    results,
  }
}
