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

const formatMoney = (val: number) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

export function ReceiptPhantom({ data }: { data: ReceiptData }) {
    const { pagamentos, cliente, itens, isReprint } = data

    // 1. Soma Total
    const valorTotalRecibo = pagamentos.reduce((acc, p) => acc + p.valor_pago, 0)

    // 2. Checkboxes (VOLTAMOS O TOP PARA O ORIGINAL)
    const formas = pagamentos.map(p => p.forma_pagamento.toLowerCase())
    const checkPositions: Record<string, number> = {
        'prestacao': 65,
        'vista': 72,
        'cheque': 79,
        'dinheiro': 86,
        'cartao': 93,
        'pix': 100
    }

    const checksToMark: number[] = []
    if (formas.some(f => f.includes('crédito') || f.includes('carnê'))) checksToMark.push(checkPositions['prestacao'])
    if (formas.some(f => f.includes('vista'))) checksToMark.push(checkPositions['vista'])
    if (formas.some(f => f.includes('cheque'))) checksToMark.push(checkPositions['cheque'])
    if (formas.some(f => f.includes('dinheiro'))) checksToMark.push(checkPositions['dinheiro'])
    if (formas.some(f => f.includes('cart'))) checksToMark.push(checkPositions['cartao'])
    if (formas.some(f => f.includes('pix'))) checksToMark.push(checkPositions['pix'])
    
    if (checksToMark.length === 0) checksToMark.push(checkPositions['vista'])

    // 3. Resumo e Data
    const resumoItens = itens.map(i => `${i.quantidade}x ${i.descricao}`).join(', ').substring(0, 80)
    const dataRef = new Date(pagamentos[0].created_at) 
    const obsTexto = `Ref. Pagamento(s) ${pagamentos.map(p => p.id).join(', ')} - ${resumoItens}`

    return (
        <div className="relative w-[297mm] h-[210mm] bg-white text-black font-sans text-sm font-bold overflow-hidden">
            
            {/* Marca d'água de Reimpressão */}
            {isReprint && (
                <div className="absolute top-[10mm] right-[40mm] text-gray-400/40 text-2xl border-4 border-gray-400/40 p-2 rounded-lg uppercase -rotate-12 font-black z-0 pointer-events-none tracking-widest">
                    REIMPRESSÃO
                </div>
            )}

            {/* 1. NOME (Top: 48mm | Left: 35+50 = 85mm) */}
            <div className="absolute top-[48mm] left-[85mm] w-[120mm] truncate uppercase text-lg">
                {cliente?.full_name}
            </div>

            {/* 2. VALOR TOTAL (Top: 60mm | Left: 80+50 = 130mm) */}
            <div className="absolute top-[60mm] left-[130mm] w-[40mm] text-right text-lg">
                {formatMoney(valorTotalRecibo)}
            </div>

            {/* 3. TOTAL REPETIDO (Top: 90mm | Left: 80+50 = 130mm) */}
            <div className="absolute top-[90mm] left-[130mm] w-[40mm] text-right text-xl">
                {formatMoney(valorTotalRecibo)}
            </div>

            {/* 4. CHECKBOXES (Left: 142+50 = 192mm) */}
            {checksToMark.map((topPos, idx) => (
                <div 
                    key={idx}
                    className="absolute left-[192mm] text-lg font-black" 
                    style={{ top: `${topPos}mm` }}
                >
                    X
                </div>
            ))}

            {/* 5. DATA (Top: 60mm | Left: +50mm em cada) */}
            {/* Dia: 175 -> 225mm */}
            <div className="absolute top-[60mm] left-[225mm]">{dataRef.getDate().toString().padStart(2, '0')}</div>
            {/* Mês: 185 -> 235mm */}
            <div className="absolute top-[60mm] left-[235mm]">{(dataRef.getMonth() + 1).toString().padStart(2, '0')}</div>
            {/* Ano: 195 -> 245mm */}
            <div className="absolute top-[60mm] left-[245mm]">{dataRef.getFullYear().toString().slice(-2)}</div>

            {/* 6. OBS (Top: 68mm | Left: 160+50 = 210mm) */}
            <div className="absolute top-[68mm] left-[210mm] w-[55mm] h-[20mm] text-[10px] leading-tight whitespace-normal break-words text-gray-800">
                {obsTexto}
            </div>

        </div>
    )
}