import { jsPDF } from 'jspdf'
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
    isReprint?: boolean
}

// ============================================================================
// 🎛️ COORDENADAS CALIBRADAS (Valores em Milímetros - mm)
// Atualizado via Calibrador Visual
// ============================================================================

// 1. NOME DO CLIENTE
const NOME_X = 154
const NOME_Y = 56

// 2. VALORES (Total e Repetição)
const VALOR_1_X = 172
const VALOR_1_Y = 67

const VALOR_2_X = 172
const VALOR_2_Y = 92

// 3. DATA
// DATA_X define onde começa o dia. Mês e Ano são calculados automaticamente (+10mm e +20mm)
const DATA_X = 245 
const DATA_Y = 66

// 4. OBSERVAÇÃO (Lista de itens)
const OBS_X = 239
const OBS_Y = 72
const LARGURA_COLUNA_OBS = 50 // Largura do texto antes de quebrar linha

// 5. CHECKBOXES ("X")
const CHECK_X = 212
// CHECK_START_Y define a altura da PRIMEIRA opção (Prestação/Crédito)
// As outras opções serão desenhadas 7mm abaixo sequencialmente
const CHECK_START_Y = 71 

// ============================================================================

export async function generateReceiptPDF(data: ReceiptData): Promise<Buffer> {
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
    })

    const { pagamentos, cliente, itens, isReprint } = data
    const valorTotalRecibo = pagamentos.reduce((acc, p) => acc + p.valor_pago, 0)
    const valorFormatado = valorTotalRecibo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

    doc.setFont('helvetica', 'bold') // Fonte Negrito global

    // --- 1. NOME ---
    doc.setFontSize(16)
    doc.text((cliente?.full_name || '').toUpperCase(), NOME_X, NOME_Y)

    // --- 2. VALOR TOTAL (1ª Posição) ---
    doc.setFontSize(16)
    // align: 'right' faz o texto terminar no X, crescendo para a esquerda
    doc.text(valorFormatado, VALOR_1_X, VALOR_1_Y, { align: 'right' })

    // --- 3. VALOR TOTAL (2ª Posição) ---
    doc.setFontSize(18)
    doc.text(valorFormatado, VALOR_2_X, VALOR_2_Y, { align: 'right' })

    // --- 4. DATA (Dia / Mês / Ano) ---
    const dataRef = new Date(pagamentos[0].created_at)
    const dia = dataRef.getDate().toString().padStart(2, '0')
    const mes = (dataRef.getMonth() + 1).toString().padStart(2, '0')
    const ano = dataRef.getFullYear().toString().slice(-2) // Apenas 2 dígitos (ex: 24)

    doc.setFontSize(14)
    // Usa DATA_X como base e soma offsets para os próximos campos
    doc.text(dia, DATA_X, DATA_Y)
    doc.text(mes, DATA_X + 10, DATA_Y) 
    doc.text(ano, DATA_X + 20, DATA_Y)

    // --- 5. OBSERVAÇÃO (Itens) ---
    const resumoItens = itens.map(i => `${i.quantidade}x ${i.descricao}`).join(', ').substring(0, 150)
    const obsTexto = `Ref. Pagamento(s) ${pagamentos.map(p => p.id).join(', ')} - ${resumoItens}`
    
    doc.setFontSize(10)
    const linhasObs = doc.splitTextToSize(obsTexto, LARGURA_COLUNA_OBS) 
    doc.text(linhasObs, OBS_X, OBS_Y)

    // --- 6. CHECKBOXES (X) ---
    const formas = pagamentos.map(p => p.forma_pagamento.toLowerCase())
    
    // Calcula posições verticais baseadas no CHECK_START_Y (71)
    // Incremento de 7mm entre cada opção
    const checkPositions: Record<string, number> = {
        'prestacao': CHECK_START_Y,          // 71
        'vista':     CHECK_START_Y + 7,      // 78
        'cheque':    CHECK_START_Y + 14,     // 85
        'dinheiro':  CHECK_START_Y + 21,     // 92
        'cartao':    CHECK_START_Y + 28,     // 99
        'pix':       CHECK_START_Y + 35      // 106
    }

    const checksToMark: number[] = []
    
    // Lógica para identificar qual marcar
    if (formas.some(f => f.includes('crédito') || f.includes('carnê'))) checksToMark.push(checkPositions['prestacao'])
    if (formas.some(f => f.includes('vista'))) checksToMark.push(checkPositions['vista'])
    if (formas.some(f => f.includes('cheque'))) checksToMark.push(checkPositions['cheque'])
    if (formas.some(f => f.includes('dinheiro'))) checksToMark.push(checkPositions['dinheiro'])
    if (formas.some(f => f.includes('cart'))) checksToMark.push(checkPositions['cartao'])
    if (formas.some(f => f.includes('pix'))) checksToMark.push(checkPositions['pix'])
    
    // Fallback: Se não achou nenhum, marca "Vista"
    if (checksToMark.length === 0) checksToMark.push(checkPositions['vista'])

    doc.setFontSize(16)
    checksToMark.forEach(yPos => {
        doc.text('X', CHECK_X, yPos) 
    })

    // --- 7. MARCA D'ÁGUA (REIMPRESSÃO) ---
    if (isReprint) {
        doc.setTextColor(220, 220, 220)
        doc.setFontSize(30)
        doc.text('REIMPRESSÃO', 250, 20, { angle: -15, align: 'center' })
    }

    return Buffer.from(doc.output('arraybuffer'))
}