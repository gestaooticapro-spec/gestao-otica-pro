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

const DATA_X = 246
const DATA_Y = 65

const VALOR_NUMERICO_X = 185
const VALOR_NUMERICO_Y = 66

const VALOR_EXTENSO_X = 185
const VALOR_EXTENSO_Y = 90

// Observações (Onde vão os itens da venda)
const OBS_X = 144 
const OBS_Y = 72
const LARGURA_MAXIMA_OBS = 100 

// 2. O Checkbox "Fixo" (O que já existia e não podia mexer)
const CHECK_FIXO_X = 208
const CHECK_FIXO_Y = 71

// 3. Formas de Pagamento (4 Checks: Cheque, Dinheiro, Cartão, PIX)
const PAGAMENTO_COLUNA_X = 208 

// Alturas (PIX antigo caiu no Cheque -> Cheque é ~81)
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

    // Fonte aumentada e mais legível (Arial/Helvetica Bold)
    doc.setFont('helvetica', 'bold') 
    doc.setFontSize(12) 

    // 1. NOME
    const nomeCliente = data.cliente?.full_name || 'Consumidor Final'
    doc.text(nomeCliente.toUpperCase(), NOME_X, NOME_Y)

    // 2. DATA
    const dataFormatada = new Date(pagamento.created_at).toLocaleDateString('pt-BR')
    doc.text(dataFormatada, DATA_X, DATA_Y)

    // 3. VALOR (Sem os **)
    const valorFormatado = pagamento.valor_pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    doc.text(valorFormatado, VALOR_NUMERICO_X, VALOR_NUMERICO_Y)

    // 4. EXTENSO (Repetindo valor limpo)
    doc.setFontSize(11)
    doc.text(`${valorFormatado}`, VALOR_EXTENSO_X, VALOR_EXTENSO_Y)
    doc.setFontSize(12)

    // 5. OBSERVAÇÕES (LISTA DE ITENS DA VENDA)
    let textoItens = ''
    if (data.itens && data.itens.length > 0) {
        const lista = data.itens.map(item => {
            // CORREÇÃO AQUI: Usando os nomes corretos do banco (product_id, item_tipo, descricao)
            // Prioridade: Descrição > Tipo > ID
            const nome = item.descricao || (item.item_tipo || `Prod #${item.product_id}`)
            return `${item.quantidade || 1}x ${nome}`
        })
        textoItens = lista.join(', ')
    } else {
        textoItens = `Ref. Venda #${pagamento.venda_id}`
    }
    
    // Adiciona ID da venda
    textoItens += ` (Venda #${pagamento.venda_id})`

    // Imprime com quebra de linha automática
    doc.setFontSize(10)
    doc.text(textoItens, OBS_X, OBS_Y, { maxWidth: LARGURA_MAXIMA_OBS })
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