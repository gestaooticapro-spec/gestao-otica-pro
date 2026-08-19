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
    parcelaInfo?: {
        numeroParcela: number
        totalParcelas: number
        dataVencimento: string
    } | null
    hasInstallmentAmounts?: boolean
}

const formatMoney = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function Via({ data, label, isRight }: { data: ReceiptDataBlank, label: string, isRight?: boolean }) {
    const { pagamentos, cliente, itens, store, isReprint, parcelaInfo, hasInstallmentAmounts } = data
    const valorTotalRecibo = pagamentos.reduce((acc, p) => acc + p.valor_pago, 0)

    const resumoItens = itens.map(i => `${i.quantidade}x ${i.descricao}`).join(', ')
    const dataRef = new Date(pagamentos[0].created_at)

    const containerStyle = {
        position: 'relative' as const,
        width: '105mm',
        height: '148mm', // Metade de um A4 (altura)
        color: 'black',
        fontFamily: 'Arial, sans-serif',
        backgroundColor: 'white',
        boxSizing: 'border-box' as const,
        padding: '8mm 6mm',
        borderRight: isRight ? 'none' : '1px dashed #ccc', // Linha de corte vertical
        overflow: 'hidden'
    }

    const formatCnpj = (cnpj: string | null) => {
        if (!cnpj) return ''
        return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
    }

    const formas = pagamentos.map(p => p.forma_pagamento)
    const formasUnicas = Array.from(new Set(formas)).join(', ')
    const vencimento = parcelaInfo?.dataVencimento?.slice(0, 10).split('-')
    const vencimentoTexto = vencimento?.length === 3
        ? `${vencimento[2]}/${vencimento[1]}/${vencimento[0]}`
        : ''

    return (
        <div style={containerStyle}>
            {isReprint && (
                <div style={{
                    position: 'absolute',
                    top: '40mm',
                    left: '10mm',
                    fontSize: '30px',
                    color: 'rgba(0,0,0,0.05)',
                    border: '3px solid rgba(0,0,0,0.05)',
                    padding: '5px',
                    transform: 'rotate(-30deg)',
                    pointerEvents: 'none',
                    zIndex: 0
                }}>
                    REIMPRESSÃO
                </div>
            )}

            {/* Marcador da Via */}
            <div style={{ position: 'absolute', top: '3mm', right: '5mm', fontSize: '9px', color: '#666', fontStyle: 'italic' }}>
                {label}
            </div>

            <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
                
                {/* CABEÇALHO DA LOJA */}
                <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                    <h1 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', lineHeight: '1.2' }}>
                        {store?.name || store?.razao_social || 'LOJA NÃO IDENTIFICADA'}
                    </h1>
                    <p style={{ margin: '2px 0', fontSize: '9px', lineHeight: '1.2' }}>
                        {store?.cnpj && `CNPJ: ${formatCnpj(store.cnpj)}`}
                        {(store?.cnpj && store?.inscricao_estadual) && ' | '}
                        {store?.inscricao_estadual && `IE: ${store.inscricao_estadual}`}
                    </p>
                    <p style={{ margin: '2px 0', fontSize: '9px', lineHeight: '1.2' }}>
                        {store?.street && `${store.street}, ${store.number || 'S/N'}`}
                        {store?.city && ` - ${store.city}/${store.state || ''}`}
                    </p>
                    <p style={{ margin: '2px 0', fontSize: '9px', lineHeight: '1.2' }}>
                        {store?.phone && `Tel: ${store.phone}`}
                        {(store?.phone && store?.whatsapp) && ' | '}
                        {store?.whatsapp && `Whats: ${store.whatsapp}`}
                    </p>
                </div>

                <div style={{ borderBottom: '1px solid black', marginBottom: '8px' }} />

                {/* TÍTULO RECIBO E VALOR */}
                <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                    <h2 style={{ margin: '0 0 5px 0', fontSize: '18px', fontWeight: 'bold', letterSpacing: '1px' }}>RECIBO</h2>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', padding: '4px 10px', border: '1px solid black', display: 'inline-block', backgroundColor: '#f9f9f9' }}>
                        {formatMoney(valorTotalRecibo)}
                    </div>
                </div>

                {/* DADOS DO CLIENTE */}
                <div style={{ marginBottom: '12px', fontSize: '10px', lineHeight: '1.4' }}>
                    <div><strong>Cliente:</strong> {cliente?.full_name?.toUpperCase()}</div>
                    {cliente?.cpf && <div><strong>CPF:</strong> {cliente.cpf}</div>}
                    <div><strong>Referente a:</strong> Venda #{pagamentos[0].venda_id}</div>
                    {parcelaInfo && (
                        <div><strong>Parcela recebida:</strong> {parcelaInfo.numeroParcela}/{parcelaInfo.totalParcelas} — Vencimento: {vencimentoTexto}</div>
                    )}
                    {hasInstallmentAmounts && (
                        <div style={{ marginTop: '4px', fontWeight: 'bold' }}>
                            Esse recibo tem valores que representam segunda via de parcelas.
                        </div>
                    )}
                </div>

                {/* DETALHES DOS ITENS */}
                <div style={{ marginBottom: '10px', fontSize: '9px', flex: 1 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '3px', borderBottom: '1px dashed #ccc', paddingBottom: '2px' }}>Resumo:</div>
                    <div style={{ color: '#222', lineHeight: '1.3' }}>
                        {resumoItens}
                    </div>
                </div>

                {/* RODAPÉ E ASSINATURA */}
                <div style={{ marginTop: 'auto' }}>
                    <div style={{ fontSize: '10px', marginBottom: '20px' }}>
                        <div><strong>Forma Pgto:</strong> {formasUnicas.toUpperCase()}</div>
                        <div style={{ marginTop: '2px' }}>
                            <strong>Data:</strong> {dataRef.toLocaleDateString('pt-BR')} às {dataRef.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                    
                    <div style={{ textAlign: 'center', padding: '0 10px' }}>
                        <div style={{ borderTop: '1px solid black', paddingTop: '4px', fontSize: '9px' }}>
                            {store?.name || store?.razao_social || 'Assinatura do Recebedor'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export function ReceiptBlankHalfA4({ data }: { data: ReceiptDataBlank }) {
    return (
        <div style={{ margin: 0, padding: 0, display: 'flex', width: '210mm', height: '148mm', borderBottom: '1px dashed #ccc' }}>
            <Via data={data} label="1ª Via - Cliente" />
            <Via data={data} label="2ª Via - Loja" isRight />
        </div>
    )
}
