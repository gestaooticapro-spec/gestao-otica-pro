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
// 🎛️ PAINEL DE CONTROLE DE POSIÇÃO (Tudo em Milímetros - mm)
// ============================================================================

// 1. NOME DO CLIENTE
// Subi 5mm (era 48) e ajustei o X para evitar cortes
const NOME_X = 135 
const NOME_Y = 43  

// 2. VALORES (Total e Repetição)
// Subi 5mm (era 60 e 90)
// Nota: Como é alinhado à direita, o X define onde o texto TERMINA
const VALOR_1_X = 170
const VALOR_1_Y = 55 

const VALOR_2_X = 170
const VALOR_2_Y = 85

// 3. DATA (Dia / Mês / Ano)
// Avancei 10mm para direita (era 225, 235, 245)
const DATA_Y = 60
const DIA_X  = 235
const MES_X  = 245
const ANO_X  = 255

// 4. OBSERVAÇÃO (Lista de itens)
// Avancei 10mm para direita (era 210)
const OBS_X = 220
const OBS_Y = 68
const LARGURA_COLUNA_OBS = 55 // Largura máxima do texto antes de quebrar linha

// 5. CHECKBOXES ("X")
// Mantive o X original (192), mude aqui se precisar
const CHECK_X = 192
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

    doc.setFont('helvetica', 'bold') // Fonte Negrito

    // --- 1. NOME ---
    doc.setFontSize(16)
    // Se o nome estava cortando o início ("Rut"), tente aumentar o NOME_X acima
    doc.text((cliente?.full_name || '').toUpperCase(), NOME_X, NOME_Y)

    // --- 2. VALOR TOTAL (1ª Posição) ---
    doc.setFontSize(16)
    doc.text(valorFormatado, VALOR_1_X, VALOR_1_Y, { align: 'right' })

    // --- 3. VALOR TOTAL (2ª Posição) ---
    doc.setFontSize(18)
    doc.text(valorFormatado, VALOR_2_X, VALOR_2_Y, { align: 'right' })

    // --- 4. DATA ---
    const dataRef = new Date(pagamentos[0].created_at)
    const dia = dataRef.getDate().toString().padStart(2, '0')
    const mes = (dataRef.getMonth() + 1).toString().padStart(2, '0')
    const ano = dataRef.getFullYear().toString().slice(-2)

    doc.setFontSize(14)
    doc.text(dia, DIA_X, DATA_Y)
    doc.text(mes, MES_X, DATA_Y)
    doc.text(ano, ANO_X, DATA_Y)

    // --- 5. OBSERVAÇÃO (Itens) ---
    const resumoItens = itens.map(i => `${i.quantidade}x ${i.descricao}`).join(', ').substring(0, 150)
    const obsTexto = `Ref. Pagamento(s) ${pagamentos.map(p => p.id).join(', ')} - ${resumoItens}`
    
    doc.setFontSize(10)
    const linhasObs = doc.splitTextToSize(obsTexto, LARGURA_COLUNA_OBS) 
    doc.text(linhasObs, OBS_X, OBS_Y)

    // --- 6. CHECKBOXES (X) ---
    const formas = pagamentos.map(p => p.forma_pagamento.toLowerCase())
    const checkPositions: Record<string, number> = {
        'prestacao': 65, 'vista': 72, 'cheque': 79,
        'dinheiro': 86, 'cartao': 93, 'pix': 100
    }

    const checksToMark: number[] = []
    if (formas.some(f => f.includes('crédito') || f.includes('carnê'))) checksToMark.push(checkPositions['prestacao'])
    if (formas.some(f => f.includes('vista'))) checksToMark.push(checkPositions['vista'])
    if (formas.some(f => f.includes('cheque'))) checksToMark.push(checkPositions['cheque'])
    if (formas.some(f => f.includes('dinheiro'))) checksToMark.push(checkPositions['dinheiro'])
    if (formas.some(f => f.includes('cart'))) checksToMark.push(checkPositions['cartao'])
    if (formas.some(f => f.includes('pix'))) checksToMark.push(checkPositions['pix'])
    
    // Se não achou nenhum, marca "Vista" como padrão de segurança
    if (checksToMark.length === 0) checksToMark.push(checkPositions['vista'])

    doc.setFontSize(16)
    checksToMark.forEach(yPos => {
        // Aplica o ajuste vertical global também nos X, se necessário
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