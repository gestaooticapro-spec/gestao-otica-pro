import { Database } from '@/lib/database.types'

type Pagamento = Database['public']['Tables']['pagamentos']['Row']
type Venda = Database['public']['Tables']['vendas']['Row']
type Cliente = Database['public']['Tables']['customers']['Row']
type Item = Database['public']['Tables']['venda_itens']['Row']
type Store = Database['public']['Tables']['stores']['Row']

export interface ReceiptDataBlank {
    pagamentos: Pagamento[]
    venda: Venda
    cliente: Cliente | null
    itens: Item[]
    store: Store | null
    isReprint?: boolean
}

const formatMoney = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function ReceiptBlankHalfA4({ data }: { data: ReceiptDataBlank }) {
    const { pagamentos, cliente, itens, store, isReprint } = data
    const valorTotalRecibo = pagamentos.reduce((acc, p) => acc + p.valor_pago, 0)

    const resumoItens = itens.map(i => `${i.quantidade}x ${i.descricao}`).join(', ')
    const dataRef = new Date(pagamentos[0].created_at)

    const containerStyle = {
        position: 'relative' as const,
        width: '210mm',
        height: '148mm', // Metade de um A4 (A5)
        color: 'black',
        fontFamily: 'Arial, sans-serif',
        backgroundColor: 'white',
        boxSizing: 'border-box' as const,
        padding: '10mm',
        borderBottom: '1px dashed #ccc' // Linha de corte se impresso em A4 inteira
    }

    const formatCnpj = (cnpj: string | null) => {
        if (!cnpj) return ''
        return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
    }

    // Identificando formas de pagamento agrupadas
    const formas = pagamentos.map(p => p.forma_pagamento)
    const formasUnicas = Array.from(new Set(formas)).join(', ')

    return (
        <div style={containerStyle}>
            {/* Reimpressão */}
            {isReprint && (
                <div style={{
                    position: 'absolute',
                    top: '30mm',
                    left: '50mm',
                    fontSize: '40px',
                    color: 'rgba(0,0,0,0.05)',
                    border: '4px solid rgba(0,0,0,0.05)',
                    padding: '10px',
                    transform: 'rotate(-20deg)',
                    pointerEvents: 'none',
                    zIndex: 0
                }}>
                    REIMPRESSÃO
                </div>
            )}

            <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* CABEÇALHO */}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid black', paddingBottom: '10px', marginBottom: '15px' }}>
                    <div style={{ width: '60%' }}>
                        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                            {store?.name || store?.razao_social || 'LOJA NÃO IDENTIFICADA'}
                        </h1>
                        <p style={{ margin: '5px 0 0 0', fontSize: '12px' }}>
                            {store?.cnpj && `CNPJ: ${formatCnpj(store.cnpj)}`}
                            {(store?.cnpj && store?.inscricao_estadual) && ' | '}
                            {store?.inscricao_estadual && `IE: ${store.inscricao_estadual}`}
                        </p>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px' }}>
                            {store?.street && `${store.street}, ${store.number || 'S/N'} - ${store.neighborhood || ''}`}
                            {store?.city && ` - ${store.city}/${store.state || ''}`}
                        </p>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px' }}>
                            {store?.phone && `Tel: ${store.phone}`}
                            {(store?.phone && store?.whatsapp) && ' | '}
                            {store?.whatsapp && `WhatsApp: ${store.whatsapp}`}
                        </p>
                    </div>
                    <div style={{ width: '35%', textAlign: 'right' }}>
                        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', letterSpacing: '2px' }}>RECIBO</h2>
                        <div style={{ marginTop: '10px', fontSize: '20px', fontWeight: 'bold', padding: '5px', border: '1px solid black', display: 'inline-block' }}>
                            {formatMoney(valorTotalRecibo)}
                        </div>
                    </div>
                </div>

                {/* DADOS DO CLIENTE */}
                <div style={{ marginBottom: '15px', fontSize: '14px', lineHeight: '1.5' }}>
                    <div><strong>Recebemos de:</strong> {cliente?.full_name?.toUpperCase()}</div>
                    {cliente?.cpf && <div><strong>CPF:</strong> {cliente.cpf}</div>}
                    <div><strong>A importância de:</strong> {formatMoney(valorTotalRecibo)}</div>
                    <div><strong>Referente a:</strong> Pagamento da Venda #{pagamentos[0].venda_id}</div>
                </div>

                {/* DETALHES DOS ITENS */}
                <div style={{ marginBottom: '15px', fontSize: '12px', flex: 1 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px', borderBottom: '1px solid #ccc', paddingBottom: '3px' }}>Resumo da Compra:</div>
                    <div style={{ color: '#333' }}>
                        {resumoItens}
                    </div>
                </div>

                {/* RODAPÉ E ASSINATURA */}
                <div style={{ marginTop: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div style={{ fontSize: '12px' }}>
                            <div><strong>Forma de Pagamento:</strong> {formasUnicas.toUpperCase()}</div>
                            <div style={{ marginTop: '10px' }}>
                                <strong>Data:</strong> {dataRef.toLocaleDateString('pt-BR')} {dataRef.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                        
                        <div style={{ width: '40%', textAlign: 'center', marginTop: '30px' }}>
                            <div style={{ borderTop: '1px solid black', paddingTop: '5px', fontSize: '12px' }}>
                                {store?.name || store?.razao_social || 'Assinatura do Recebedor'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
