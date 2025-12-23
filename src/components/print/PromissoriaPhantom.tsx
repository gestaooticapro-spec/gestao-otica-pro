'use client'

import { Database } from '@/lib/database.types'

type Financiamento = Database['public']['Tables']['financiamento_loja']['Row']
type FinanciamentoParcela = Database['public']['Tables']['financiamento_parcelas']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type Store = Database['public']['Tables']['stores']['Row']

type PromissoriaPhantomProps = {
    financiamento: Financiamento & {
        financiamento_parcelas: FinanciamentoParcela[]
        customers: Customer | null
        store: Store | null
    }
}

export default function PromissoriaPhantom({ financiamento }: PromissoriaPhantomProps) {
    const customer = financiamento.customers
    const store = financiamento.store
    const parcelas = financiamento.financiamento_parcelas.sort((a, b) => a.numero_parcela - b.numero_parcela)

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pt-BR')

    // Divide parcelas em duas colunas
    const mid = Math.ceil(parcelas.length / 2)
    const col1 = parcelas.slice(0, mid)
    const col2 = parcelas.slice(mid)

    const renderTable = (items: FinanciamentoParcela[]) => (
        <table className="w-full border-collapse border border-black text-xs">
            <thead>
                <tr className="bg-white">
                    <th className="border border-black p-1 text-center w-10">Parc.</th>
                    <th className="border border-black p-1 text-center">Vencimento</th>
                    <th className="border border-black p-1 text-right">Valor</th>
                </tr>
            </thead>
            <tbody>
                {items.map((p) => (
                    <tr key={p.id}>
                        <td className="border border-black p-1 text-center font-bold">{p.numero_parcela}/{financiamento.quantidade_parcelas}</td>
                        <td className="border border-black p-1 text-center font-black text-sm">{formatDate(p.data_vencimento)}</td>
                        <td className="border border-black p-1 text-right font-bold">{formatCurrency(p.valor_parcela)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    )

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

    const storeAddress = (store as any)?.address || (store ? formatAddress(store.street, store.number, store.neighborhood, store.city, store.state) : 'Endereço da Loja')
    const customerAddress = customer ? formatAddress(customer.rua, customer.numero, customer.bairro, customer.cidade, customer.uf) : 'Endereço não cadastrado'

    return (
        <>
            <style type="text/css" media="print">
                {`
                    @page { size: A4 portrait; margin: 0; }
                    body { margin: 0; padding: 0; }
                `}
            </style>

            <div className="w-full max-w-[210mm] min-h-[148mm] max-h-[148mm] bg-white p-8 mx-auto print:p-8 print:w-full font-sans flex flex-col justify-between box-border">
                <div>
                    {/* CABEÇALHO */}
                    <div className="text-center border-b-2 border-black pb-2 mb-2">
                        <h1 className="text-xl font-bold uppercase">{store?.name || 'NOME DA LOJA'}</h1>
                        <p className="text-xs">{storeAddress}</p>
                        <p className="text-xs">Tel: {store?.phone || '(00) 0000-0000'}</p>
                        <p className="text-xs">CNPJ: {store?.cnpj || 'Não informado'}</p>
                    </div>

                    {/* SUB-CABEÇALHO (DUPLICATA E DATA) */}
                    <div className="flex justify-between items-center mb-4 text-xs font-bold border-b border-black pb-1">
                        <span>Duplicata Nº {financiamento.id}</span>
                        <span>Data da Emissão: {new Date().toLocaleDateString('pt-BR')}</span>
                    </div>

                    {/* DADOS DO CLIENTE */}
                    <div className="text-justify mb-2 leading-snug text-xs">
                        <p className="mb-2">
                            <span className="font-bold">Cliente:</span> {customer?.full_name}<br />
                            <span className="font-bold">CPF:</span> {customer?.cpf || 'Não informado'}<br />
                            <span className="font-bold">Endereço:</span> {customerAddress}
                        </p>
                        <p>
                            Reconheço a dívida no valor total de <span className="font-bold">{formatCurrency(financiamento.valor_total_financiado)}</span>,
                            referente à compra de produtos/serviços nesta data.
                            Comprometo-me a efetuar o pagamento conforme o demonstrativo abaixo:
                        </p>
                    </div>

                    {/* TABELA DE PARCELAS (DUAS COLUNAS) */}
                    <div className="mb-4 flex gap-4 items-start">
                        <div className="flex-1">
                            {renderTable(col1)}
                        </div>
                        {col2.length > 0 && (
                            <div className="flex-1">
                                {renderTable(col2)}
                            </div>
                        )}
                    </div>

                    {/* OBSERVAÇÕES */}
                    {financiamento.obs && (
                        <div className="mb-4 border border-black p-2 text-[10px]">
                            <p className="font-bold">Observações:</p>
                            <p>{financiamento.obs}</p>
                        </div>
                    )}
                </div>

                {/* ASSINATURA (ALINHADA À DIREITA) */}
                <div className="mt-4 flex justify-end text-xs">
                    <div className="text-center w-1/2">
                        <div className="border-t border-black pt-1">
                            <p className="font-bold uppercase">{customer?.full_name}</p>
                            <p className="text-[10px]">Cliente</p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
