import { Database } from '@/lib/database.types'

// Tipos de dados que o template vai receber
type VendaCompleta = Database['public']['Tables']['vendas']['Row'] & {
    customers: Database['public']['Tables']['customers']['Row'] | null
    pagamentos: Database['public']['Tables']['pagamentos']['Row'][]
    store: { name: string } // Nome da loja
}

const formatMoney = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR')

// ============================================================================
// TEMPLATE 1: CLÁSSICO (CÓPIA DO SEU PAPEL AZUL)
// ============================================================================
export function ReceiptClassic({ venda }: { venda: VendaCompleta }) {
    const pagamentos = venda.pagamentos || []
    
    // Detecta formas de pagamento para marcar o "X"
    const formas = pagamentos.map(p => p.forma_pagamento.toLowerCase())
    const isDinheiro = formas.some(f => f.includes('dinheiro'))
    const isCartao = formas.some(f => f.includes('cart') || f.includes('débito') || f.includes('crédito'))
    const isPix = formas.some(f => f.includes('pix'))
    const isCheque = formas.some(f => f.includes('cheque'))
    const isCreditoLoja = formas.some(f => f.includes('crédito em loja'))

    return (
        <div className="w-[210mm] border-2 border-black p-1 mx-auto my-4 text-sm font-sans bg-white text-black">
            {/* CABEÇALHO */}
            <div className="border border-black p-2 mb-1 flex justify-between items-center bg-gray-100 print:bg-gray-100">
                <div className="flex-1 text-center">
                    <h1 className="text-3xl font-black uppercase tracking-widest">{venda.store?.name || 'NOME DA ÓTICA'}</h1>
                    <p className="text-[10px] mt-1">Óculos, Lentes e Armações</p>
                </div>
                <div className="text-right pl-4">
                    <p className="text-xl font-bold text-red-600">Nº {venda.id}</p>
                </div>
            </div>

            {/* FAIXA DE GARANTIA E VENCIMENTO */}
            <div className="grid grid-cols-3 border border-black mb-1 text-center text-xs font-bold divide-x divide-black bg-gray-50 print:bg-gray-50">
                <div className="p-1">
                    PERÍODO DE GARANTIA
                    <p className="text-[10px] font-normal mt-1">3 Meses (Conf. CDC)</p>
                </div>
                <div className="p-1 flex flex-col justify-center">
                    Nº DA DUPLICATA
                    <span className="text-lg">{venda.id}/1</span>
                </div>
                <div className="p-1 flex flex-col justify-center">
                    VENCIMENTO
                    <span className="text-lg">À Vista</span>
                </div>
            </div>

            {/* CORPO DO RECIBO */}
            <div className="border border-black flex">
                
                {/* LADO ESQUERDO (VALORES) */}
                <div className="flex-1 border-r border-black">
                    {/* Linha Nome */}
                    <div className="border-b border-black p-2 flex items-end">
                        <span className="font-bold mr-2 w-16 text-xs uppercase">Nome:</span>
                        <span className="font-bold text-base flex-1 border-b border-dotted border-black">{venda.customers?.full_name}</span>
                    </div>

                    {/* Linha Valor Bruto */}
                    <div className="border-b border-black p-2 flex justify-between items-center h-12">
                        <span className="font-bold text-xs uppercase w-24">Valor R$</span>
                        <span className="font-bold text-xl">{formatMoney(venda.valor_total)}</span>
                    </div>

                    {/* Linha Desconto */}
                    <div className="border-b border-black p-2 flex justify-between items-center h-12 bg-gray-50 print:bg-gray-50">
                        <span className="font-bold text-xs uppercase w-24">Desconto</span>
                        <span className="font-bold text-lg text-black">{formatMoney(venda.valor_desconto)}</span>
                    </div>

                    {/* Linha TOTAL */}
                    <div className="p-2 flex justify-between items-center h-14 bg-gray-200 print:bg-gray-200">
                        <span className="font-black text-sm uppercase w-24">TOTAL R$</span>
                        <span className="font-black text-2xl">{formatMoney(venda.valor_final)}</span>
                    </div>
                </div>

                {/* LADO DIREITO (FORMA PAGTO E DATA) */}
                <div className="w-[40%] flex flex-col">
                    
                    {/* Checkboxes de Forma de Pagamento */}
                    <div className="flex-1 p-2 space-y-1 text-xs font-bold border-b border-black">
                        <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 border border-black flex items-center justify-center`}>{isCheque ? 'X' : ''}</div> Cheque
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 border border-black flex items-center justify-center`}>{isDinheiro ? 'X' : ''}</div> Dinheiro
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 border border-black flex items-center justify-center`}>{isCartao ? 'X' : ''}</div> Cartão
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 border border-black flex items-center justify-center`}>{isPix ? 'X' : ''}</div> Pix
                        </div>
                        {isCreditoLoja && (
                             <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border border-black flex items-center justify-center">X</div> Crédito
                            </div>
                        )}
                    </div>

                    {/* Data e Assinatura */}
                    <div className="h-24 p-2 flex flex-col justify-between">
                        <div className="flex justify-end gap-2 text-sm font-bold">
                            <span>DATA:</span>
                            <span className="border-b border-black w-24 text-center">{formatDate(venda.created_at)}</span>
                        </div>
                        <div className="text-center mt-4">
                            <div className="border-b border-black w-[90%] mx-auto"></div>
                            <p className="text-[10px] font-bold mt-1">Assinatura</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="text-[10px] text-right mt-1 pr-1 italic">
                Documento não fiscal - Controle Interno
            </div>
        </div>
    )
}

// ============================================================================
// TEMPLATE 2: TÉRMICO (BOBINA 80MM - MODERNO)
// ============================================================================
export function ReceiptThermal({ venda }: { venda: VendaCompleta }) {
    const pagamentos = venda.pagamentos || []

    return (
        <div className="w-[80mm] p-2 font-mono text-xs bg-white text-black">
            <div className="text-center border-b border-dashed border-black pb-2 mb-2">
                <h2 className="text-sm font-bold uppercase">{venda.store?.name}</h2>
                <p>Recibo de Venda #{venda.id}</p>
                <p>{new Date(venda.created_at).toLocaleString('pt-BR')}</p>
            </div>

            <div className="mb-2">
                <p><strong>Cliente:</strong> {venda.customers?.full_name}</p>
            </div>

            <table className="w-full mb-2">
                <tbody>
                    <tr>
                        <td className="py-1">Subtotal</td>
                        <td className="text-right">{formatMoney(venda.valor_total)}</td>
                    </tr>
                    {venda.valor_desconto > 0 && (
                        <tr>
                            <td className="py-1">Desconto</td>
                            <td className="text-right">-{formatMoney(venda.valor_desconto)}</td>
                        </tr>
                    )}
                    <tr className="font-bold text-sm">
                        <td className="py-1 border-t border-dashed border-black">TOTAL</td>
                        <td className="text-right border-t border-dashed border-black">{formatMoney(venda.valor_final)}</td>
                    </tr>
                </tbody>
            </table>

            <div className="border-t border-dashed border-black pt-2 mb-4">
                <p className="font-bold mb-1">Pagamentos:</p>
                {pagamentos.map((pg, i) => (
                    <div key={i} className="flex justify-between">
                        <span>{pg.forma_pagamento} ({pg.parcelas}x)</span>
                        <span>{formatMoney(pg.valor_pago)}</span>
                    </div>
                ))}
            </div>

            <div className="text-center text-[10px] mt-4">
                <p>Obrigado pela preferência!</p>
                <p>*** NÃO É DOCUMENTO FISCAL ***</p>
            </div>
        </div>
    )
}