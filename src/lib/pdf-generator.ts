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

// DATA (Referência base, os dias/mês/ano são calculados relativos a este X)
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

  data.pagamentos.forEach((pagamento, index) => {
    if (index > 0) doc.addPage()

    // Fonte Courier, Negrito, Tamanho 12
    doc.setFont('courier', 'bold') 
    doc.setFontSize(12) 

    // --- LÓGICA DE REIMPRESSÃO (Corrigido para receipt_printed_at) ---
    if (pagamento.receipt_printed_at) {
        doc.text('*** REIMPRESSÃO (2ª VIA) ***', REIMPRESSAO_X, REIMPRESSAO_Y)
    }

    // 1. NOME
    const nomeCliente = data.cliente?.full_name || 'Consumidor Final'
    doc.text(nomeCliente.toUpperCase(), NOME_X, NOME_Y)

    // 2. DATA (DESMEMBRADA)
    const dateObj = new Date(pagamento.created_at)
    const dia = String(dateObj.getDate()).padStart(2, '0') // Ex: "20"
    const mes = String(dateObj.getMonth() + 1).padStart(2, '0') // Ex: "12"
    const ano = String(dateObj.getFullYear()) // Ex: "2025"

    // Cálculos de posição baseados no seu pedido:
    const diaX = DATA_X + 4
    const mesX = diaX + 10
    const anoX = mesX + 8

    doc.text(dia, diaX, DATA_Y)
    doc.text(mes, mesX, DATA_Y)
    doc.text(ano, anoX, DATA_Y)

    // 3. VALOR
    const valorFormatado = pagamento.valor_pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    doc.text(valorFormatado, VALOR_NUMERICO_X, VALOR_NUMERICO_Y)

    // 4. EXTENSO
    doc.setFontSize(11) 
    doc.text(`${valorFormatado}`, VALOR_EXTENSO_X, VALOR_EXTENSO_Y)
    doc.setFontSize(12) 

    // 5. OBSERVAÇÕES
    const textoObs = `Ref. Pgto Venda #${pagamento.venda_id}`
    doc.setFontSize(10) 
    doc.text(textoObs, OBS_X, OBS_Y, { 
        maxWidth: OBS_LARGURA_MAXIMA, 
        align: 'left'
    })
    doc.setFontSize(12)

    // 6. CHECKBOX FIXO
    doc.text('X', CHECK_FIXO_X, CHECK_FIXO_Y)

    // 7. FORMA DE PAGAMENTO
    const forma = pagamento.forma_pagamento.toLowerCase().trim()
    let yPagamento = 0

    if (forma.includes('cheque')) yPagamento = Y_CHEQUE
    else if (forma.includes('dinheiro')) yPagamento = Y_DINHEIRO
    else if (forma.includes('crédito') || forma.includes('debito') || forma.includes('cartão')) yPagamento = Y_CARTAO
    else if (forma.includes('pix')) yPagamento = Y_PIX

    if (yPagamento > 0) {
        doc.text('X', PAGAMENTO_COLUNA_X, yPagamento)
    }

  })

  return Buffer.from(doc.output('arraybuffer'))
}