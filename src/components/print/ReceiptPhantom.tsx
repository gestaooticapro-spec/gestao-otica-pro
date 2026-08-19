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
    parcelaInfo?: {
        numeroParcela: number
        totalParcelas: number
        dataVencimento: string
    } | null
    hasInstallmentAmounts?: boolean
}

// --- AJUSTE FINO (Edite aqui se precisar mover tudo) ---
// O jsPDF desenha de baixo para cima na linha de base da fonte. 
// O CSS desenha do topo para baixo. 
// -4mm em Y compensa a diferença da altura da fonte para ficar idêntico ao antigo.
const OFFSET_Y = -4

const NOME_X = 144
const NOME_Y = 56 + OFFSET_Y

const DATA_X = 246
const DATA_Y = 65 + OFFSET_Y

const VALOR_NUMERICO_X = 185
const VALOR_NUMERICO_Y = 66 + OFFSET_Y

const VALOR_EXTENSO_X = 185
const VALOR_EXTENSO_Y = 90 + OFFSET_Y

const OBS_X = 239
const OBS_Y = 73 + OFFSET_Y

const REIMPRESSAO_X = 144
const REIMPRESSAO_Y = 50 + OFFSET_Y

const CHECK_FIXO_X = 208
const CHECK_FIXO_Y = 71 + OFFSET_Y

const PAGAMENTO_COLUNA_X = 208
const Y_CHEQUE = 81 + OFFSET_Y
const Y_DINHEIRO = 86 + OFFSET_Y
const Y_CARTAO = 91 + OFFSET_Y
const Y_PIX = 96 + OFFSET_Y

const formatMoney = (val: number) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

function Via({ data, isSegundaVia }: { data: ReceiptData, isSegundaVia: boolean }) {
    const { pagamentos, cliente, isReprint, parcelaInfo, hasInstallmentAmounts } = data
    const valorTotalRecibo = pagamentos.reduce((acc, p) => acc + p.valor_pago, 0)
    
    // Data mais recente
    const dataMaisRecente = pagamentos.reduce((latest, p) => {
        return new Date(p.created_at) > new Date(latest) ? p.created_at : latest
    }, pagamentos[0]?.created_at || new Date().toISOString())
    
    const dateObj = new Date(dataMaisRecente)
    const dia = String(dateObj.getDate()).padStart(2, '0')
    const mes = String(dateObj.getMonth() + 1).padStart(2, '0')
    const ano = String(dateObj.getFullYear())

    // Usa apenas o parâmetro da URL: receipt_printed_at é setado antes da página carregar (race condition)
    const isReimpressaoReal = isReprint

    const formasPagamento = pagamentos.map(p => p.forma_pagamento.toLowerCase().trim())
    const idsPagamentos = pagamentos.map(p => p.id).join(', ')

    const formatDate = (value: string) => {
        const date = value.slice(0, 10).split('-')
        return date.length === 3 ? `${date[2]}/${date[1]}/${date[0].slice(-2)}` : ''
    }
    
    const labelIds = pagamentos.length > 1 ? 'Pgtos' : 'Pgto'
    const obsTexto = `Ref. ${labelIds} #${idsPagamentos} - Venda #${data.venda.id}`
    const rastreabilidadeTexto = 'Esse recibo tem valores que representam segunda via de parcelas.'

    const getStyle = (topMm: number, leftMm: number, extraStyles: any = {}) => {
        return {
            position: 'absolute' as const,
            top: `${topMm}mm`,
            left: `${leftMm}mm`,
            ...extraStyles
        }
    }

    const containerStyle = {
        position: 'relative' as const,
        width: '297mm',
        height: '210mm',
        color: 'black',
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: '16px', // No JS PDF era size 12 mas Courier costuma ser menor em HTML, 16px aproxima.
        fontWeight: 'bold',
        overflow: 'hidden',
        backgroundColor: 'white',
        pageBreakAfter: 'always' as const
    }

    return (
        <div style={containerStyle}>
            {/* Reimpressão */}
            {isReimpressaoReal && (
                <div style={getStyle(REIMPRESSAO_Y, REIMPRESSAO_X)}>
                    *** REIMPRESSÃO ***
                </div>
            )}

            {/* Dados da duplicata: aparecem somente em recibos de parcela. */}
            {parcelaInfo && (
                <>
                    <div style={getStyle(41, 223)}>
                        {parcelaInfo.numeroParcela}/{parcelaInfo.totalParcelas}
                    </div>
                    <div style={getStyle(41, 267)}>
                        {formatDate(parcelaInfo.dataVencimento)}
                    </div>
                </>
            )}

            {/* 1. NOME */}
            <div style={getStyle(NOME_Y, NOME_X)}>
                {(cliente?.full_name || 'Consumidor Final').toUpperCase()}
            </div>

            {/* 2. DATA */}
            <div style={getStyle(DATA_Y, DATA_X + 4)}>{dia}</div>
            <div style={getStyle(DATA_Y, DATA_X + 14)}>{mes}</div>
            <div style={getStyle(DATA_Y, DATA_X + 22)}>{ano}</div>

            {/* 3. VALOR TOTAL NUMERICO */}
            <div style={getStyle(VALOR_NUMERICO_Y, VALOR_NUMERICO_X)}>
                {formatMoney(valorTotalRecibo)}
            </div>

            {/* 4. EXTENSO (Usado como repetição numerica na otica) */}
            <div style={getStyle(VALOR_EXTENSO_Y, VALOR_EXTENSO_X, { fontSize: '15px' })}>
                {formatMoney(valorTotalRecibo)}
            </div>

            {/* 5. OBSERVAÇÕES */}
            <div style={getStyle(OBS_Y, OBS_X, { width: '45mm', fontSize: '13px', lineHeight: '1.2' })}>
                {obsTexto}
                {hasInstallmentAmounts && (
                    <div style={{ marginTop: '2mm' }}>{rastreabilidadeTexto}</div>
                )}
            </div>

            {/* 6. CHECKBOX FIXO */}
            <div style={getStyle(CHECK_FIXO_Y, CHECK_FIXO_X)}>X</div>

            {/* 7. FORMAS DE PAGAMENTO */}
            {formasPagamento.some(f => f.includes('cheque')) && <div style={getStyle(Y_CHEQUE, PAGAMENTO_COLUNA_X)}>X</div>}
            {formasPagamento.some(f => f.includes('dinheiro')) && <div style={getStyle(Y_DINHEIRO, PAGAMENTO_COLUNA_X)}>X</div>}
            {formasPagamento.some(f => f.includes('crédito') || f.includes('debito') || f.includes('cartão')) && <div style={getStyle(Y_CARTAO, PAGAMENTO_COLUNA_X)}>X</div>}
            {formasPagamento.some(f => f.includes('pix')) && <div style={getStyle(Y_PIX, PAGAMENTO_COLUNA_X)}>X</div>}
        </div>
    )
}

export function ReceiptPhantom({ data }: { data: ReceiptData }) {
    return (
        <div style={{ margin: 0, padding: 0 }}>
            <Via data={data} isSegundaVia={false} />
            <Via data={data} isSegundaVia={true} />
        </div>
    )
}
