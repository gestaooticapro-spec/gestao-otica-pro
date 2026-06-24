import jsPDF from 'jspdf'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Database } from '@/lib/database.types'

type Pagamento = Database['public']['Tables']['pagamentos']['Row']
type Venda = Database['public']['Tables']['vendas']['Row']
type Cliente = Database['public']['Tables']['customers']['Row']
type Item = Database['public']['Tables']['venda_itens']['Row']

interface ReceiptData {
  pagamentos: Pagamento[]
  venda: Venda
  cliente: Cliente | null
  itens: Item[]
}

// ==========================================
// 🎯 CONFIGURAÇÃO DE COORDENADAS (Milímetros)
// ==========================================

// 1. Campos de Texto
const NOME_X = 144
const NOME_Y = 56

// DATA
const DATA_X = 246
const DATA_Y = 65

const VALOR_NUMERICO_X = 185
const VALOR_NUMERICO_Y = 66

const VALOR_EXTENSO_X = 185
const VALOR_EXTENSO_Y = 90

// Observações
const OBS_X = 239
const OBS_Y = 73
const OBS_LARGURA_MAXIMA = 45

// 2. Segurança (Reimpressão)
const REIMPRESSAO_X = 144
const REIMPRESSAO_Y = 50

// 3. Checkboxes
const CHECK_FIXO_X = 208
const CHECK_FIXO_Y = 71

const PAGAMENTO_COLUNA_X = 208
const Y_CHEQUE = 81
const Y_DINHEIRO = 86
const Y_CARTAO = 91
const Y_PIX = 96

// ==========================================

export async function generateReceiptPDF(data: ReceiptData): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  })

  // --- 1. AGREGAR DADOS DOS PAGAMENTOS SELECIONADOS ---
  // O usuário quer que, se selecionar múltiplos, some tudo num só recibo.

  const totalValor = data.pagamentos.reduce((acc, p) => acc + p.valor_pago, 0)

  // Pega a data mais recente entre os pagamentos selecionados
  const dataMaisRecente = data.pagamentos.reduce((latest, p) => {
    return new Date(p.created_at) > new Date(latest) ? p.created_at : latest
  }, data.pagamentos[0]?.created_at || new Date().toISOString())

  // Verifica se algum já foi impresso para marcar como reimpressão
  const isReimpressao = data.pagamentos.some(p => p.receipt_printed_at)

  // Coleta todas as formas de pagamento para marcar os X correspondentes
  const formasPagamento = data.pagamentos.map(p => p.forma_pagamento.toLowerCase().trim())

  // IDs para observação
  const idsPagamentos = data.pagamentos.map(p => p.id).join(', ')


  // --- FUNÇÃO CARIMBO (Desenha o conteúdo de uma via) ---
  const desenharVia = () => {
    // Fonte Courier, Negrito, Tamanho 12
    doc.setFont('courier', 'bold')
    doc.setFontSize(12)

    // Lógica de Reimpressão ou 2ª Via
    if (isReimpressao) {
      doc.text('*** REIMPRESSÃO ***', REIMPRESSAO_X, REIMPRESSAO_Y)
    }

    // 1. NOME
    const nomeCliente = data.cliente?.full_name || 'Consumidor Final'
    doc.text(nomeCliente.toUpperCase(), NOME_X, NOME_Y)

    // 2. DATA (Da transação mais recente)
    const dateObj = new Date(dataMaisRecente)
    const dia = String(dateObj.getDate()).padStart(2, '0')
    const mes = String(dateObj.getMonth() + 1).padStart(2, '0')
    const ano = String(dateObj.getFullYear())

    const diaX = DATA_X + 4
    const mesX = diaX + 10
    const anoX = mesX + 8

    doc.text(dia, diaX, DATA_Y)
    doc.text(mes, mesX, DATA_Y)
    doc.text(ano, anoX, DATA_Y)

    // 3. VALOR TOTAL (Sem R$)
    const valorFormatado = totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    doc.text(valorFormatado, VALOR_NUMERICO_X, VALOR_NUMERICO_Y)

    // 4. EXTENSO (Do valor total)
    doc.setFontSize(11)
    doc.text(`${valorFormatado}`, VALOR_EXTENSO_X, VALOR_EXTENSO_Y)
    doc.setFontSize(12)

    // 5. OBSERVAÇÕES
    // Mostra IDs agrupados se houver mais de um
    const labelIds = data.pagamentos.length > 1 ? 'Pgtos' : 'Pgto'
    const textoObs = `Ref. ${labelIds} #${idsPagamentos} - Venda #${data.venda.id}`

    doc.setFontSize(10)
    doc.text(textoObs, OBS_X, OBS_Y, {
      maxWidth: OBS_LARGURA_MAXIMA,
      align: 'left'
    })
    doc.setFontSize(12)

    // 6. CHECKBOX FIXO
    doc.text('X', CHECK_FIXO_X, CHECK_FIXO_Y)

    // 7. FORMAS DE PAGAMENTO (Marca todas as presentes)
    // Se tiver misto (ex: dinheiro e cartão), marca os dois

    if (formasPagamento.some(f => f.includes('cheque'))) {
      doc.text('X', PAGAMENTO_COLUNA_X, Y_CHEQUE)
    }
    if (formasPagamento.some(f => f.includes('dinheiro'))) {
      doc.text('X', PAGAMENTO_COLUNA_X, Y_DINHEIRO)
    }
    if (formasPagamento.some(f => f.includes('crédito') || f.includes('debito') || f.includes('cartão'))) {
      doc.text('X', PAGAMENTO_COLUNA_X, Y_CARTAO)
    }
    if (formasPagamento.some(f => f.includes('pix'))) {
      doc.text('X', PAGAMENTO_COLUNA_X, Y_PIX)
    }
  }

  // --- EXECUÇÃO (GERA 1 RECIBO UNIFICADO EM 2 VIAS) ---

  // 1ª Via
  desenharVia()

  // 2ª Via (Restaurada conforme solicitado)
  doc.addPage()
  desenharVia()

  return Buffer.from(doc.output('arraybuffer'))
}

export interface InstallmentReceiptData {
  customerName: string
  installmentNumber: number
  totalInstallments: number
  amount: number
  dueDate: string
  paymentDate: string
  isReprint?: boolean
  store: {
    name: string
    legalName?: string | null
    phone?: string | null
    whatsapp?: string | null
    email?: string | null
    street?: string | null
    number?: string | null
    neighborhood?: string | null
    city?: string | null
    state?: string | null
    cep?: string | null
    logoFile?: string | null
  }
}

export interface CustomerFinancialSummaryPdfData {
  customerName: string
  store: InstallmentReceiptData['store']
  totals: {
    parcelasPagas: number
    parcelasPendentes: number
    totalParcelas: number
    valorPago: number
    valorRestante: number
    valorTotalFinanciado: number
  }
  nextDue: {
    data: string | null
    valor: number
    numeroParcela: number
  } | null
  financiamentos: Array<{
    id: number
    vendaId: number
    dataVenda: string
    dependenteNames: string[]
    totalParcelas: number
    parcelasPagas: number
    parcelasPendentes: number
    valorFinanciado: number
    parcelas: Array<{
      numeroParcela: number
      dataVencimento: string
      valor: number
      dataPagamento: string | null
      valorPago: number
      status: string
    }>
  }>
}

export interface CustomerPrescriptionSummaryPdfData {
  customerName: string
  subjectLabel: string
  store: InstallmentReceiptData['store']
  prescriptions: Array<{
    id: number
    dataCompra: string
    longeOdEsf: string | null
    longeOdCil: string | null
    longeOdEixo: string | null
    longeOeEsf: string | null
    longeOeCil: string | null
    longeOeEixo: string | null
    pertoOdEsf: string | null
    pertoOdCil: string | null
    pertoOdEixo: string | null
    pertoOeEsf: string | null
    pertoOeCil: string | null
    pertoOeEixo: string | null
    adicao: string | null
    medico: string | null
  }>
}

function formatDateBR(dateStr: string) {
  if (!dateStr) return ''
  if (dateStr.length === 10 && dateStr.includes('-')) {
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
  }

  return new Date(dateStr).toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
  })
}

function formatMoneyBR(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatPhoneBR(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return String(value || '').trim()
}

function formatCepBR(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 8) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`
  }
  return String(value || '').trim()
}

function buildStoreAddress(store: InstallmentReceiptData['store']) {
  const firstLine = [store.street, store.number].filter(Boolean).join(', ')
  const secondLine = [
    store.neighborhood,
    [store.city, store.state].filter(Boolean).join('/'),
    formatCepBR(store.cep),
  ].filter(Boolean).join(' - ')

  return [firstLine, secondLine].filter(Boolean)
}

async function loadStoreLogoDataUrl(logoFile?: string | null) {
  const safeLogoFile = String(logoFile || '').trim()
  if (!safeLogoFile || !/^[a-zA-Z0-9._-]{1,160}$/.test(safeLogoFile)) {
    return null
  }

  const extension = path.extname(safeLogoFile).toLowerCase()
  const mimeType = extension === '.png'
    ? 'image/png'
    : extension === '.jpg' || extension === '.jpeg'
      ? 'image/jpeg'
      : extension === '.webp'
        ? 'image/webp'
        : null

  if (!mimeType) return null

  try {
    const filePath = path.join(process.cwd(), 'public', 'logos', safeLogoFile)
    const fileBuffer = await readFile(filePath)
    return `data:${mimeType};base64,${fileBuffer.toString('base64')}`
  } catch {
    return null
  }
}

async function drawCompactDocumentFrame(
  doc: jsPDF,
  store: InstallmentReceiptData['store'],
  title: string,
  subtitle: string,
  options?: { pageLabel?: string; generatedAt?: string }
) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const logoDataUrl = await loadStoreLogoDataUrl(store.logoFile)
  const contentLeft = logoDataUrl ? 28 : 10
  const generatedAt = options?.generatedAt || new Date().toLocaleDateString('pt-BR')

  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageWidth, 21, 'F')

  if (logoDataUrl) {
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(8, 4.5, 16, 12, 2, 2, 'F')
    try {
      const properties = doc.getImageProperties(logoDataUrl)
      const maxWidth = 12
      const maxHeight = 8
      const scale = Math.min(maxWidth / properties.width, maxHeight / properties.height)
      const drawWidth = properties.width * scale
      const drawHeight = properties.height * scale
      const drawX = 8 + ((16 - drawWidth) / 2)
      const drawY = 4.5 + ((12 - drawHeight) / 2)
      doc.addImage(logoDataUrl, drawX, drawY, drawWidth, drawHeight, undefined, 'FAST')
    } catch {
      doc.addImage(logoDataUrl, 10, 6.5, 11, 7, undefined, 'FAST')
    }
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.2)
  doc.text(store.name || 'Documento da Loja', contentLeft, 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.8)
  const storeIdentity = store.legalName && store.legalName !== store.name
    ? store.legalName
    : null
  if (storeIdentity) {
    doc.text(storeIdentity, contentLeft, 11.8)
  }

  const addressBlock = buildStoreAddress(store).join(' | ')
  if (addressBlock) {
    const addressLines = doc.splitTextToSize(addressBlock, 58)
    doc.text(addressLines.slice(0, 2), contentLeft, 15)
  }

  let contactLine = [formatPhoneBR(store.whatsapp), formatPhoneBR(store.phone)].filter(Boolean).join(' | ')
  if (store.email) {
    contactLine = contactLine ? `${contactLine} | ${store.email}` : store.email
  }
  if (contactLine) {
    const contactLines = doc.splitTextToSize(contactLine, 42)
    doc.setFontSize(5.6)
    doc.text(contactLines.slice(0, 2), pageWidth - 8, 8, { align: 'right' })
  }

  doc.setTextColor(17, 24, 39)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.4)
  doc.text(title, 10, 27)

  doc.setFontSize(6.2)
  doc.setTextColor(100, 116, 139)
  doc.text(`Emitido em ${generatedAt}`, pageWidth - 10, 27, { align: 'right' })

  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(10, 31, pageWidth - 20, 10, 3, 3, 'FD')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.2)
  doc.setTextColor(51, 65, 85)
  const subtitleLines = doc.splitTextToSize(subtitle, pageWidth - 28)
  doc.text(subtitleLines.slice(0, 2), 14, 35.2)

  if (options?.pageLabel) {
    doc.setDrawColor(203, 213, 225)
    doc.setTextColor(100, 116, 139)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.6)
    doc.text(options.pageLabel, pageWidth - 10, pageHeight - 4, { align: 'right' })
  }

  return { pageWidth, pageHeight, contentTop: 45 }
}

function drawCompactFooter(doc: jsPDF, leftText: string, rightText: string) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  doc.setDrawColor(203, 213, 225)
  doc.line(10, pageHeight - 12, pageWidth - 10, pageHeight - 12)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.8)
  doc.setTextColor(100, 116, 139)
  doc.text('Observacoes', 10, pageHeight - 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.6)
  doc.setTextColor(51, 65, 85)
  doc.text(leftText, 10, pageHeight - 4)
  doc.setFontSize(5.4)
  doc.setTextColor(148, 163, 184)
  doc.text(rightText, pageWidth - 10, pageHeight - 4, { align: 'right' })
}

function drawWrappedLineBlock(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const lines = doc.splitTextToSize(text, maxWidth)
  doc.text(lines, x, y, { lineHeightFactor: 1 })
  return y + (lines.length * lineHeight)
}

function compactStatusLabel(status: string) {
  return String(status || '').toLowerCase() === 'pago' ? 'Pago' : 'Pendente'
}

export async function generateCustomerFinancialSummaryPDF(data: CustomerFinancialSummaryPdfData): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85, 150] })
  const generatedAt = new Date().toLocaleDateString('pt-BR')
  let pageNumber = 1

  const startPage = async (continuation?: string) => {
    if (pageNumber > 1) doc.addPage()
    const subtitleBase = `Cliente: ${data.customerName}. Parcelas discriminadas por venda para consulta e envio digital.`
    const subtitle = continuation ? `${subtitleBase} ${continuation}` : subtitleBase
    return drawCompactDocumentFrame(doc, data.store, 'DETALHE FINANCEIRO', subtitle, {
      pageLabel: `Pagina ${pageNumber}`,
      generatedAt,
    })
  }

  let { pageWidth, pageHeight, contentTop } = await startPage()
  let y = contentTop
  const bottomLimit = pageHeight - 16
  const rowHeight = 4.6

  const ensureSpace = async (requiredHeight: number, continuation?: string) => {
    if (y + requiredHeight <= bottomLimit) return
    pageNumber += 1
    ;({ pageWidth, pageHeight, contentTop } = await startPage(continuation || '(continua)'))
    y = contentTop
  }

  for (const financiamento of data.financiamentos) {
    const blockHeaderHeight = 18
    const tableHeaderHeight = 6
    const totalsHeight = 8
    const estimatedHeight = blockHeaderHeight + tableHeaderHeight + (financiamento.parcelas.length * rowHeight) + totalsHeight + 4
    await ensureSpace(estimatedHeight, '(continua)')

    const dependenteText = financiamento.dependenteNames.length > 0
      ? `Dependente(s): ${financiamento.dependenteNames.join(', ')}`
      : null

    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(10, y, pageWidth - 20, estimatedHeight - 2, 2.5, 2.5, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(15, 23, 42)
    doc.text(`Venda #${financiamento.vendaId}`, 13, y + 4.8)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.8)
    doc.setTextColor(71, 85, 105)
    doc.text(
      `Data da venda: ${formatDateBR(financiamento.dataVenda)}`,
      13,
      y + 8.5
    )
    if (dependenteText) {
      doc.text(dependenteText, 13, y + 12.2)
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.5)
    doc.setTextColor(100, 116, 139)
    doc.text('N', 13, y + 17.2)
    doc.text('VENC.', 21, y + 17.2)
    doc.text('VALOR', 42, y + 17.2)
    doc.text('DT PGTO', 63, y + 17.2)
    doc.text('VLR PAGO', 87, y + 17.2)
    doc.text('STATUS', 114, y + 17.2)

    doc.setLineWidth(0.2)
    doc.line(12, y + 18.5, pageWidth - 12, y + 18.5)

    let rowY = y + 22
    let totalPagoVenda = 0
    let totalPendenteVenda = 0

    for (const parcela of financiamento.parcelas) {
      if (rowY + rowHeight + totalsHeight > bottomLimit) {
        pageNumber += 1
        ;({ pageWidth, pageHeight, contentTop } = await startPage(`(continua venda #${financiamento.vendaId})`))
        y = contentTop
        rowY = y + 8

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.2)
        doc.setTextColor(15, 23, 42)
        doc.text(`Venda #${financiamento.vendaId} (continua)`, 13, y + 3.8)
        doc.setFontSize(5.5)
        doc.setTextColor(100, 116, 139)
        doc.text('N', 13, y + 8)
        doc.text('VENC.', 21, y + 8)
        doc.text('VALOR', 42, y + 8)
        doc.text('DT PGTO', 63, y + 8)
        doc.text('VLR PAGO', 87, y + 8)
        doc.text('STATUS', 114, y + 8)
        doc.line(12, y + 9.3, pageWidth - 12, y + 9.3)
        rowY = y + 13
      }

      const isPago = String(parcela.status || '').toLowerCase() === 'pago'
      const valorPago = isPago ? (parcela.valorPago || parcela.valor) : 0
      totalPagoVenda += valorPago
      totalPendenteVenda += isPago ? 0 : parcela.valor

      doc.setDrawColor(226, 232, 240)
      doc.line(12, rowY + 2.7, pageWidth - 12, rowY + 2.7)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.4)
      doc.setTextColor(51, 65, 85)
      doc.text(String(parcela.numeroParcela), 13, rowY)
      doc.text(formatDateBR(parcela.dataVencimento), 21, rowY)
      doc.text(formatMoneyBR(parcela.valor), 42, rowY)
      doc.text(parcela.dataPagamento ? formatDateBR(parcela.dataPagamento) : '-', 63, rowY)
      doc.text(isPago ? formatMoneyBR(valorPago) : '-', 87, rowY)
      doc.text(compactStatusLabel(parcela.status), 114, rowY)

      rowY += rowHeight
    }

    doc.setDrawColor(203, 213, 225)
    doc.line(12, rowY + 0.5, pageWidth - 12, rowY + 0.5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.6)
    doc.setTextColor(30, 41, 59)
    doc.text(`Total da venda: ${formatMoneyBR(financiamento.valorFinanciado)}`, 13, rowY + 4.4)
    doc.text(`Pago: ${formatMoneyBR(totalPagoVenda)}`, 65, rowY + 4.4)
    doc.text(`Pendente: ${formatMoneyBR(totalPendenteVenda)}`, pageWidth - 13, rowY + 4.4, { align: 'right' })

    y = rowY + 9
  }

  drawCompactFooter(
    doc,
    'Documento nao fiscal para compartilhamento do detalhamento financeiro do cliente.',
    'PDF digital gerado para envio via WhatsApp.'
  )

  return Buffer.from(doc.output('arraybuffer'))
}

export async function generateCustomerPrescriptionSummaryPDF(data: CustomerPrescriptionSummaryPdfData): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85, 150] })
  const generatedAt = new Date().toLocaleDateString('pt-BR')
  let pageNumber = 1
  const isTitularSelection = data.subjectLabel.trim() === data.customerName.trim()
  const selectionLabel = isTitularSelection
    ? 'Selecao: Titular'
    : `Dependente: ${data.subjectLabel}`

  const startPage = async (continuation?: string) => {
    if (pageNumber > 1) doc.addPage()
    const subtitleBase = `Titular: ${data.customerName}. ${selectionLabel}. Historico de receitas opticas para consulta e envio digital.`
    const subtitle = continuation ? `${subtitleBase} ${continuation}` : subtitleBase
    return drawCompactDocumentFrame(doc, data.store, 'DETALHE DE RECEITAS', subtitle, {
      pageLabel: `Pagina ${pageNumber}`,
      generatedAt,
    })
  }

  let { pageWidth, pageHeight, contentTop } = await startPage()
  let y = contentTop
  const bottomLimit = pageHeight - 16
  const lineHeight = 3.3

  for (const rx of data.prescriptions) {
    const rowCount =
      5
      + (rx.medico ? 1 : 0)
      + ((rx.pertoOdEsf || rx.pertoOdCil || rx.pertoOdEixo || rx.pertoOeEsf || rx.pertoOeCil || rx.pertoOeEixo) ? 2 : 0)
      + (rx.adicao ? 1 : 0)
    const estimatedHeight = 10 + (rowCount * lineHeight)

    if (y + estimatedHeight > bottomLimit) {
      pageNumber += 1
      ;({ pageWidth, pageHeight, contentTop } = await startPage('(continua)'))
      y = contentTop
    }

    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(10, y, pageWidth - 20, estimatedHeight, 3, 3, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.6)
    doc.setTextColor(15, 23, 42)
    doc.text(`Receita de ${formatDateBR(rx.dataCompra)}`, 13, y + 4.8)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.8)
    doc.setTextColor(71, 85, 105)
    let innerY = y + 8.5
    if (rx.medico) {
      innerY = drawWrappedLineBlock(doc, `Medico: ${rx.medico}`, 13, innerY, pageWidth - 26, lineHeight)
      innerY += 0.4
    }

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(37, 99, 235)
    doc.text('Longe', 13, innerY)
    innerY += 3

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(51, 65, 85)
    innerY = drawWrappedLineBlock(
      doc,
      `OD: ESF ${rx.longeOdEsf || '-'} | CIL ${rx.longeOdCil || '-'} | EIXO ${rx.longeOdEixo || '-'}`,
      13,
      innerY,
      pageWidth - 26,
      lineHeight
    )
    innerY = drawWrappedLineBlock(
      doc,
      `OE: ESF ${rx.longeOeEsf || '-'} | CIL ${rx.longeOeCil || '-'} | EIXO ${rx.longeOeEixo || '-'}`,
      13,
      innerY,
      pageWidth - 26,
      lineHeight
    )

    if (rx.pertoOdEsf || rx.pertoOdCil || rx.pertoOdEixo || rx.pertoOeEsf || rx.pertoOeCil || rx.pertoOeEixo) {
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(14, 116, 144)
      doc.text('Perto', 13, innerY)
      innerY += 3

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(51, 65, 85)
      innerY = drawWrappedLineBlock(
        doc,
        `OD: ESF ${rx.pertoOdEsf || '-'} | CIL ${rx.pertoOdCil || '-'} | EIXO ${rx.pertoOdEixo || '-'}`,
        13,
        innerY,
        pageWidth - 26,
        lineHeight
      )
      innerY = drawWrappedLineBlock(
        doc,
        `OE: ESF ${rx.pertoOeEsf || '-'} | CIL ${rx.pertoOeCil || '-'} | EIXO ${rx.pertoOeEixo || '-'}`,
        13,
        innerY,
        pageWidth - 26,
        lineHeight
      )
    }

    if (rx.adicao) {
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 41, 59)
      doc.text(`Adicao: ${rx.adicao}`, 13, innerY)
    }

    y += estimatedHeight + 3
  }

  drawCompactFooter(
    doc,
    'Documento nao fiscal para compartilhamento do historico de receitas opticas.',
    'PDF digital gerado para envio via WhatsApp.'
  )

  return Buffer.from(doc.output('arraybuffer'))
}

export async function generateInstallmentReceiptPDF(data: InstallmentReceiptData): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85, 150] })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const amount = formatMoneyBR(Number(data.amount))
  const dueDate = formatDateBR(data.dueDate)
  const paymentDate = formatDateBR(data.paymentDate)
  const storeAddressLines = buildStoreAddress(data.store)
  const storePhones = [
    formatPhoneBR(data.store.whatsapp),
    formatPhoneBR(data.store.phone),
  ].filter(Boolean)
  const receiptGeneratedAt = new Date().toLocaleDateString('pt-BR')
  const logoDataUrl = await loadStoreLogoDataUrl(data.store.logoFile)
  const contentLeft = logoDataUrl ? 28 : 10

  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageWidth, 21, 'F')

  if (logoDataUrl) {
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(8, 4.5, 16, 12, 2, 2, 'F')
    try {
      const properties = doc.getImageProperties(logoDataUrl)
      const maxWidth = 12
      const maxHeight = 8
      const scale = Math.min(
        maxWidth / properties.width,
        maxHeight / properties.height,
      )
      const drawWidth = properties.width * scale
      const drawHeight = properties.height * scale
      const drawX = 8 + ((16 - drawWidth) / 2)
      const drawY = 4.5 + ((12 - drawHeight) / 2)
      doc.addImage(logoDataUrl, drawX, drawY, drawWidth, drawHeight, undefined, 'FAST')
    } catch {
      doc.addImage(logoDataUrl, 10, 6.5, 11, 7, undefined, 'FAST')
    }
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.2)
  doc.text(data.store.name || 'Recibo da Loja', contentLeft, 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.8)
  const storeIdentity = data.store.legalName && data.store.legalName !== data.store.name
    ? data.store.legalName
    : null
  if (storeIdentity) {
    doc.text(storeIdentity, contentLeft, 11.8)
  }
  const addressBlock = storeAddressLines.join(' | ')
  if (addressBlock) {
    const addressLines = doc.splitTextToSize(addressBlock, 58)
    doc.text(addressLines.slice(0, 2), contentLeft, 15)
  }

  let contactLine = storePhones.join(' | ')
  if (data.store.email) {
    contactLine = contactLine ? `${contactLine} | ${data.store.email}` : data.store.email
  }
  if (contactLine) {
    const contactLines = doc.splitTextToSize(contactLine, 42)
    doc.setFontSize(5.6)
    doc.text(contactLines.slice(0, 2), pageWidth - 8, 8, { align: 'right' })
  }

  doc.setTextColor(17, 24, 39)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.4)
  doc.text('RECIBO DE PAGAMENTO', 10, 27)

  doc.setFontSize(6.2)
  doc.setTextColor(100, 116, 139)
  doc.text(`Emitido em ${receiptGeneratedAt}`, pageWidth - 10, 27, { align: 'right' })

  if (data.isReprint) {
    doc.setDrawColor(234, 88, 12)
    doc.setTextColor(234, 88, 12)
    doc.roundedRect(pageWidth - 39, 29, 29, 5, 2, 2)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.text('REIMPRESSAO', pageWidth - 24.5, 32.3, { align: 'center' })
  }

  doc.setTextColor(17, 24, 39)
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(10, 31, 78, 14, 3, 3, 'FD')
  doc.roundedRect(92, 31, pageWidth - 102, 14, 3, 3, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.1)
  doc.setTextColor(100, 116, 139)
  doc.text('CLIENTE', 14, 35.8)
  doc.text('PARCELA', 14, 41.8)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.4)
  doc.setTextColor(15, 23, 42)
  const customerLines = doc.splitTextToSize(data.customerName || 'Consumidor Final', 70)
  doc.text(customerLines.slice(0, 2), 14, 39)
  doc.setFontSize(7.6)
  doc.text(`${data.installmentNumber} de ${data.totalInstallments}`, 14, 44.2)

  doc.setFontSize(6.1)
  doc.setTextColor(100, 116, 139)
  doc.text('VENCIMENTO', 96, 35.8)
  doc.text('PAGO EM', 96, 41.8)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.6)
  doc.setTextColor(15, 23, 42)
  doc.text(dueDate, 96, 39)
  doc.text(paymentDate, 96, 44.2)

  doc.setFillColor(239, 246, 255)
  doc.setDrawColor(147, 197, 253)
  doc.roundedRect(10, 48.5, pageWidth - 20, 12.5, 3, 3, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.1)
  doc.setTextColor(37, 99, 235)
  doc.text('VALOR RECEBIDO', 14, 53.5)
  doc.setFontSize(14)
  doc.setTextColor(30, 41, 59)
  doc.text(amount, 14, 58.8)

  doc.setTextColor(51, 65, 85)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.3)
  const declaration = `Recebemos de ${data.customerName || 'Consumidor Final'} a importancia de ${amount}, referente ao pagamento da parcela ${data.installmentNumber}/${data.totalInstallments}, com vencimento em ${dueDate}.`
  const declarationLines = doc.splitTextToSize(declaration, pageWidth - 24)
  doc.text(declarationLines.slice(0, 2), 10, 65.5, {
    maxWidth: pageWidth - 24,
    lineHeightFactor: 1,
  })

  doc.setDrawColor(203, 213, 225)
  doc.line(10, pageHeight - 12, pageWidth - 10, pageHeight - 12)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.8)
  doc.setTextColor(100, 116, 139)
  doc.text('Observacoes', 10, pageHeight - 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.6)
  doc.setTextColor(51, 65, 85)
  doc.text('Documento nao fiscal emitido para comprovacao de recebimento desta parcela.', 10, pageHeight - 4)

  doc.setFontSize(5.4)
  doc.setTextColor(148, 163, 184)
  doc.text('Recibo digital gerado para envio via WhatsApp.', pageWidth - 10, pageHeight - 4, { align: 'right' })

  return Buffer.from(doc.output('arraybuffer'))
}
