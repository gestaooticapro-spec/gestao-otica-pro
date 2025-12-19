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

// --- AJUSTE FINO (Edite aqui se precisar mover tudo) ---
const AJUSTE_VERTICAL = 0 
const AJUSTE_HORIZONTAL = 0 

const formatMoney = (val: number) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

export function ReceiptPhantom({ data }: { data: ReceiptData }) {
    const { pagamentos, cliente, itens, isReprint } = data
    const valorTotalRecibo = pagamentos.reduce((acc, p) => acc + p.valor_pago, 0)

    // Checkboxes
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
    if (checksToMark.length === 0) checksToMark.push(checkPositions['vista'])

    const resumoItens = itens.map(i => `${i.quantidade}x ${i.descricao}`).join(', ').substring(0, 80)
    const dataRef = new Date(pagamentos[0].created_at) 
    const obsTexto = `Ref. Pagamento(s) ${pagamentos.map(p => p.id).join(', ')} - ${resumoItens}`

    // Função auxiliar de estilo
    const getStyle = (topMm: number, leftMm: number, extraStyles: any = {}) => {
        return {
            position: 'absolute' as const,
            top: `${topMm + AJUSTE_VERTICAL}mm`,
            left: `${leftMm + AJUSTE_HORIZONTAL}mm`,
            ...extraStyles
        }
    }

    // Estilo Container Principal (Garante tamanho A4)
    const containerStyle = {
        position: 'relative' as const,
        width: '297mm',
        height: '210mm',
        minWidth: '1100px', // Fallback em pixels para email
        minHeight: '790px', // Fallback em pixels para email
        color: 'black',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        fontWeight: 'bold',
        overflow: 'hidden',
        backgroundColor: 'white' // Garante fundo branco
    }

    return (
        <div style={containerStyle}>
            
            {/* Reimpressão */}
            {isReprint && (
                <div style={getStyle(10, 0, { 
                    right: '40mm', left: 'auto',
                    fontSize: '24px', color: '#ccc', border: '4px solid #ccc', 
                    padding: '10px', transform: 'rotate(-12deg)'
                })}>
                    REIMPRESSÃO
                </div>
            )}

            {/* 1. NOME */}
            <div style={getStyle(48, 135, { fontSize: '18px', textTransform: 'uppercase' })}>
                {cliente?.full_name}
            </div>

            {/* 2. VALOR TOTAL */}
            <div style={getStyle(60, 130, { width: '40mm', textAlign: 'right', fontSize: '18px' })}>
                {formatMoney(valorTotalRecibo)}
            </div>

            {/* 3. TOTAL REPETIDO */}
            <div style={getStyle(90, 130, { width: '40mm', textAlign: 'right', fontSize: '20px' })}>
                {formatMoney(valorTotalRecibo)}
            </div>

            {/* 4. CHECKBOXES */}
            {checksToMark.map((topPos, idx) => (
                <div key={idx} style={getStyle(topPos, 192, { fontSize: '18px', fontWeight: '900' })}>X</div>
            ))}

            {/* 5. DATA */}
            <div style={getStyle(60, 225)}>{dataRef.getDate().toString().padStart(2, '0')}</div>
            <div style={getStyle(60, 235)}>{(dataRef.getMonth() + 1).toString().padStart(2, '0')}</div>
            <div style={getStyle(60, 245)}>{dataRef.getFullYear().toString().slice(-2)}</div>

            {/* 6. OBS */}
            <div style={getStyle(68, 210, { width: '55mm', fontSize: '10px', lineHeight: '1.2' })}>
                {obsTexto}
            </div>

        </div>
    )
}