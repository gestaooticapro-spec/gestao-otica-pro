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

// Observações (Onde vão os itens)
const OBS_X = 144 // Ajustei para 144 (mesmo alinhamento do Nome) para caber mais texto
const OBS_Y = 72
const LARGURA_MAXIMA_OBS = 100 // Largura para quebrar linha se o texto for longo

// 2. O Checkbox "Fixo" (O que já existia e não podia mexer)
const CHECK_FIXO_X = 208
const CHECK_FIXO_Y = 71
// (Se esse check for condicional, me avise. Por enquanto vou deixar fixo ou vinculado a algo)

// 3. Formas de Pagamento (4 Checks: Cheque, Dinheiro, Cartão, PIX)
const PAGAMENTO_COLUNA_X = 208 

// Alturas baseadas no seu feedback (PIX antigo caiu no Cheque -> Cheque é ~81)
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

    // Fonte aumentada e mais legível
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

    // 4. EXTENSO (Opcional, repetindo valor limpo)
    doc.setFontSize(11)
    doc.text(`${valorFormatado}`, VALOR_EXTENSO_X, VALOR_EXTENSO_Y)
    doc.setFontSize(12)

    // 5. OBSERVAÇÕES (LISTA DE ITENS DA VENDA)
    // Monta texto: "1x Armação Rayban, 2x Lente Multifocal..."
    let textoItens = ''
    if (data.itens && data.itens.length > 0) {
        const lista = data.itens.map(item => {
            // Tenta pegar nome do produto ou tipo
            const nome = item.produto_id ? `Prod #${item.produto_id}` : (item.tipo || 'Item')
            // Se tiver descrição na tabela (depende do seu banco), usaria item.descricao
            return `${item.quantidade || 1}x ${nome}`
        })
        textoItens = lista.join(', ')
    } else {
        textoItens = `Ref. Venda #${pagamento.venda_id}`
    }
    
    // Adiciona "Venda #123" no final se couber
    textoItens += ` (Venda #${pagamento.venda_id})`

    // Imprime com quebra de linha automática se for muito grande
    doc.setFontSize(10) // Diminui um pouco pra caber a lista
    doc.text(textoItens, OBS_X, OBS_Y, { maxWidth: LARGURA_MAXIMA_OBS })
    doc.setFontSize(12)

    // 6. CHECKBOX FIXO (O "que já existia")
    // Vou desenhar um X nele sempre. Se ele só deve aparecer em algum caso, me avise.
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