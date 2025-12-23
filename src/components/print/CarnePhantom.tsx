'use client'

import { Database } from '@/lib/database.types'
import { QRCodeSVG } from 'qrcode.react'
import { PixPayload } from '@/lib/pix'

type Financiamento = Database['public']['Tables']['financiamento_loja']['Row']
type FinanciamentoParcela = Database['public']['Tables']['financiamento_parcelas']['Row']
type Store = Database['public']['Tables']['stores']['Row']
type Customer = Database['public']['Tables']['customers']['Row']

interface CarnePhantomProps {
    financiamento: Financiamento & {
        financiamento_parcelas: FinanciamentoParcela[]
        store: Store | null
        customers: Customer | null
    }
}

export default function CarnePhantom({ financiamento }: CarnePhantomProps) {
    const customer = financiamento.customers
    const store = financiamento.store
    const parcelas = financiamento.financiamento_parcelas.sort((a, b) => a.numero_parcela - b.numero_parcela)

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pt-BR')

    const formatAddress = (
        street?: string | null,
        number?: string | null,
        neighborhood?: string | null,
        city?: string | null,
        state?: string | null
    ) => {
        const parts = [
            street,
            number,
            neighborhood ? `- ${neighborhood}` : null,
            city,
            state
        ].filter(Boolean)
        return parts.length > 0 ? parts.join(', ') : 'Endereço não informado'
    }

    // FIX: Tenta ler o campo 'address' direto (caso exista fora da tipagem) ou monta com os campos padrão
    const storeAddress = (store as any)?.address || (store ? formatAddress(store.street, store.number, store.neighborhood, store.city, store.state) : 'Endereço da Loja')

    const settings = store?.settings as any
    const logoUrl = settings?.logo ? `/logos/${settings.logo}` : null

    // Dados para o Pix
    const pixKey = (store as any)?.pix_key
    const pixCity = (store as any)?.pix_city || store?.city || 'Cidade'
    const pixName = store?.razao_social || store?.name || 'Loja'

    return (
        <>
            <style type="text/css" media="print">
                {`
                    @page { size: A4 portrait; margin: 0; }
                    body { margin: 0; padding: 0; }
                    .break-after-page { page-break-after: always; }
                `}
            </style>

            <div className="w-[170mm] bg-white mx-auto font-sans">
                {parcelas.map((p, index) => {
                    const isPageBreak = (index + 1) % 5 === 0 && index !== parcelas.length - 1;

                    // Gera o Payload Pix se houver chave
                    let pixPayload = null
                    if (pixKey) {
                        try {
                            // TxID: ID do financiamento + ID da parcela (único)
                            const txid = `${financiamento.id}${p.id}`.substring(0, 25)
                            const pix = new PixPayload(pixKey, pixName, pixCity, p.valor_parcela, txid)
                            pixPayload = pix.getPayload()
                        } catch (e) {
                            console.error('Erro ao gerar Pix:', e)
                        }
                    }

                    return (
                        <div key={p.id} className={`w-full h-[59mm] border-b border-dashed border-gray-400 box-border flex ${isPageBreak ? 'break-after-page' : ''}`}>

                            {/* COLUNA ESQUERDA: CONTEÚDO */}
                            <div className="flex-1 flex flex-col justify-between p-2 pr-4">
                                {/* LINHA 1: CABEÇALHO */}
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-2">
                                        {logoUrl && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
                                        )}
                                        <div className="leading-tight">
                                            <h1 className="text-xs font-bold uppercase">{store?.name || 'NOME DA LOJA'}</h1>
                                            <p className="text-[9px] text-gray-600 max-w-[250px] truncate">{storeAddress}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-sm font-black bg-gray-100 px-2 py-1 rounded border border-gray-200">
                                            {p.numero_parcela}/{financiamento.quantidade_parcelas}
                                        </span>
                                    </div>
                                </div>

                                {/* LINHA 2: INFO BAR */}
                                <div className="flex items-center gap-4 text-[10px] border-y border-gray-200 py-1 bg-gray-50 px-2">
                                    <span className="font-bold">Duplicata: <span className="font-normal">{financiamento.id}</span></span>
                                    <span className="text-gray-300">|</span>
                                    <span className="font-bold">Emissão: <span className="font-normal">{new Date().toLocaleDateString('pt-BR')}</span></span>
                                    <span className="text-gray-300">|</span>
                                    <span className="font-bold truncate flex-1">Cliente: <span className="font-normal uppercase">{customer?.full_name}</span></span>
                                </div>

                                {/* LINHA 3: VALORES */}
                                <div className="flex gap-8 pl-2">
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-500 uppercase">Vencimento</p>
                                        <p className="text-xl font-black text-gray-900">{formatDate(p.data_vencimento)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-500 uppercase">Valor</p>
                                        <p className="text-xl font-black text-gray-900">{formatCurrency(p.valor_parcela)}</p>
                                    </div>
                                </div>

                                {/* LINHA 4: RODAPÉ */}
                                <div className="text-center">
                                    <p className="text-[8px] text-gray-400 uppercase font-bold tracking-wider">
                                        Este carnê é meramente informativo. NÃO SERVE COMO RECIBO.
                                    </p>
                                </div>
                            </div>

                            {/* COLUNA DIREITA: QR CODE */}
                            <div className="w-[45mm] border-l border-gray-200 flex items-center justify-center bg-gray-50/30">
                                {pixPayload ? (
                                    <div className="flex flex-col items-center gap-1">
                                        <div className="bg-white p-1 border border-gray-300 rounded shadow-sm">
                                            <QRCodeSVG value={pixPayload} size={80} />
                                        </div>
                                        <span className="text-[8px] font-bold text-gray-500">PIX COPIA E COLA</span>
                                    </div>
                                ) : (
                                    <div className="w-24 h-24 bg-white border border-gray-300 flex items-center justify-center rounded shadow-sm">
                                        <span className="text-[8px] text-gray-400 text-center font-bold">SEM CHAVE<br />PIX</span>
                                    </div>
                                )}
                            </div>

                        </div>
                    )
                })}
            </div>
        </>
    )
}
