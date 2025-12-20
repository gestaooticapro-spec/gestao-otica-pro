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
// 🎯 CONFIGURAÇÃO DAS COORDENADAS (Milímetros)
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

const OBS_X = 239
const OBS_Y = 72

// 2. Formas de Pagamento (Checkbox 'X')
// A coluna é a mesma para todos (seu CHECK_X)
const CHECKBOX_COLUNA_X = 208 

// As alturas (Y). Ajuste esses números se o X cair na linha errada.
// Ordem descrita: Cheque (Topo) -> Dinheiro -> Cartão -> PIX (Baixo)
const Y_CHEQUE = 66      // Um pouco acima do 71
const Y_DINHEIRO = 71    // Seu CHECK_Y original
const Y_CARTAO = 76      // 5mm abaixo
const Y_PIX = 81         // 10mm abaixo

// ==========================================

export async function generateReceiptPDF(data: ReceiptData): Promise<Buffer> {
  // Cria o PDF no formato paisagem (landscape) para caber no formulário
  // A4 Landscape tem aprox 297mm de largura
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4' 
  })

  // Loop por cada pagamento selecionado (gera uma página por recibo)
  data.pagamentos.forEach((pagamento, index) => {
    if (index > 0) doc.addPage() // Adiciona nova página se tiver mais de um recibo

    // Configuração de Fonte (Padrão maquina de escrever ou simples)
    doc.setFont('courier', 'bold') // Courier ajuda a alinhar números
    doc.setFontSize(11) // Tamanho da letra (aumente ou diminua se precisar)

    // 1. NOME DO CLIENTE
    const nomeCliente = data.cliente?.full_name || 'Consumidor Final'
    doc.text(nomeCliente.toUpperCase(), NOME_X, NOME_Y)

    // 2. DATA
    const dataFormatada = new Date(pagamento.created_at).toLocaleDateString('pt-BR')
    doc.text(dataFormatada, DATA_X, DATA_Y)

    // 3. VALOR (R$ 100,00)
    const valorFormatado = pagamento.valor_pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    doc.text(valorFormatado, VALOR_NUMERICO_X, VALOR_NUMERICO_Y)

    // 4. VALOR POR EXTENSO (Opcional, repetindo o valor ou texto personalizado)
    // Se quiser converter numero pra extenso real, precisaria de uma lib extra.
    // Por enquanto, vamos repetir o valor formatado ou deixar em branco se preferir.
    doc.setFontSize(10)
    doc.text(`*** ${valorFormatado} ***`, VALOR_EXTENSO_X, VALOR_EXTENSO_Y)
    doc.setFontSize(11)

    // 5. OBSERVAÇÕES (Usamos para colocar o ID da venda ou obs do pagamento)
    const obsTexto = `Ref. Venda #${pagamento.venda_id}`
    doc.text(obsTexto, OBS_X, OBS_Y)

    // 6. MARCAÇÃO DO X NA FORMA DE PAGAMENTO
    // Normalizamos o texto para garantir que "Dinheiro" ou "dinheiro" funcionem
    const forma = pagamento.forma_pagamento.toLowerCase().trim()
    
    let yParaMarcar = 0

    if (forma.includes('cheque')) {
        yParaMarcar = Y_CHEQUE
    } else if (forma.includes('dinheiro')) {
        yParaMarcar = Y_DINHEIRO
    } else if (forma.includes('crédito') || forma.includes('debito') || forma.includes('cartão') || forma.includes('cartao')) {
        yParaMarcar = Y_CARTAO
    } else if (forma.includes('pix')) {
        yParaMarcar = Y_PIX
    } else {
        // Se for "Outros" ou crediário, marcamos no Dinheiro ou deixamos sem marcar?
        // Vou deixar sem marcar para não errar.
    }

    // Se encontrou uma posição, desenha o X
    if (yParaMarcar > 0) {
        doc.text('X', CHECKBOX_COLUNA_X, yParaMarcar)
    }

  })

  // Retorna o arquivo gerado
  return Buffer.from(doc.output('arraybuffer'))
}