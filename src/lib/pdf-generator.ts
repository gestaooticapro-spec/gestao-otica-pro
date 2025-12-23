import jsPDF from 'jspdf'
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
  const desenharVia = (isSegundaVia: boolean) => {
    // Fonte Courier, Negrito, Tamanho 12
    doc.setFont('courier', 'bold')
    doc.setFontSize(12)

    // Lógica de Reimpressão ou 2ª Via
    if (isReimpressao) {
      doc.text('*** REIMPRESSÃO ***', REIMPRESSAO_X, REIMPRESSAO_Y)
    } else if (isSegundaVia) {
      doc.text('*** 2ª VIA ***', REIMPRESSAO_X, REIMPRESSAO_Y)
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
  desenharVia(false)

  // 2ª Via (Restaurada conforme solicitado)
  doc.addPage()
  desenharVia(true)

  return Buffer.from(doc.output('arraybuffer'))
}