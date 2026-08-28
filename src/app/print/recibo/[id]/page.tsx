// ARQUIVO: src/app/print/recibo/[id]/page.tsx

import { notFound, redirect } from 'next/navigation'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ReceiptPhantom } from '@/components/print/ReceiptPhantom'
import { ReceiptBlankHalfA4 } from '@/components/print/ReceiptBlankHalfA4'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function PrintReciboPage(
    props: { params: Promise<{ id: string }>, searchParams: Promise<{ reprint?: string, installment_receipt?: string }> }
) {
    const searchParams = await props.searchParams;
    const params = await props.params;
    const idsString = params.id
    const ids = Array.from(new Set(idsString.split('-').map(id => parseInt(id)).filter(n => !isNaN(n))))

    if (ids.length === 0) return notFound()

    const isReprint = searchParams.reprint === 'true'
    const isExperimentalInstallmentReceipt = searchParams.installment_receipt === 'true'

    const session = createClient()
    const { data: { user } } = await session.auth.getUser()
    if (!user) redirect('/login')

    const profile = await getProfileByAdmin(user.id) as { tenant_id?: string | null; role?: string | null; store_id?: number | null } | null
    if (!profile?.tenant_id) return notFound()

    const supabase = createAdminClient()

    // 1. Busca OS Pagamentos
    let pagamentosQuery = (supabase
        .from('pagamentos') as any)
        .select('*')
        .in('id', ids)
        .eq('tenant_id', profile.tenant_id)
    if (profile.role !== 'admin') {
        if (!profile.store_id) return notFound()
        pagamentosQuery = pagamentosQuery.eq('store_id', profile.store_id)
    }
    const { data: pagamentos, error: pagamentosError } = await pagamentosQuery.order('created_at', { ascending: true })

    if (pagamentosError || !pagamentos || pagamentos.length !== ids.length) return notFound()

    const vendaId = pagamentos[0].venda_id

    // 2. Busca a Venda e Cliente
    const { data: vendaRaw } = await (supabase
        .from('vendas') as any)
        .select('*, customers(*), venda_itens(*)')
        .eq('id', vendaId)
        .eq('tenant_id', profile.tenant_id)
        .eq('store_id', pagamentos[0].store_id)
        .single()

    if (!vendaRaw) return <div className="p-10">Venda original não encontrada.</div>

    const venda = vendaRaw as any

    // Pagamentos de parcela chegam por este mesmo endpoint de recibo.
    // Quando todos os pagamentos selecionados pertencem à mesma parcela,
    // carregamos os dados da duplicata para o layout pré-impresso.
    let parcelaInfo: {
        numeroParcela: number
        totalParcelas: number
        dataVencimento: string
    } | null = null

    const parcelaIds = Array.from(new Set(
        pagamentos.map((pagamento: any) => Number(pagamento.parcela_id)).filter(Number.isFinite)
    ))

    // O pagamento pode ser dividido em mais de uma alocação quando há
    // excedente (a parcela atual é recebida e o restante abatido na próxima).
    // Nesse caso, a parcela do primeiro pagamento é a parcela recebida e deve
    // continuar aparecendo no recibo.
    if (pagamentos.length > 0 && parcelaIds.length > 0) {
        const { data: parcelaRaw } = await (supabase
            .from('financiamento_parcelas') as any)
            .select('numero_parcela, data_vencimento, financiamento_id')
            .eq('id', parcelaIds[0])
            .maybeSingle()

        if (parcelaRaw?.financiamento_id) {
            const { data: financiamentoRaw } = await (supabase
                .from('financiamento_loja') as any)
                .select('quantidade_parcelas')
                .eq('id', parcelaRaw.financiamento_id)
                .maybeSingle()
            const { count: totalParcelasCount } = await (supabase
                .from('financiamento_parcelas') as any)
                .select('*', { count: 'exact', head: true })
                .eq('financiamento_id', parcelaRaw.financiamento_id)

            if (parcelaRaw.numero_parcela && parcelaRaw.data_vencimento) {
                parcelaInfo = {
                    numeroParcela: Number(parcelaRaw.numero_parcela),
                    totalParcelas: Number(totalParcelasCount || financiamentoRaw?.quantidade_parcelas || 1),
                    dataVencimento: parcelaRaw.data_vencimento,
                }
            }
        }
    }

    // 3. Busca a loja
    const { data: storeRaw } = await (supabase
        .from('stores') as any)
        .select('*')
        .eq('id', venda.store_id)
        .single()

    const store = storeRaw as any
    const receiptType = store?.settings?.receipt_type || 'pre_printed'

    const receiptData = {
        pagamentos,
        venda,
        cliente: venda.customers,
        itens: venda.venda_itens || [],
        store,
        isReprint,
        parcelaInfo,
        // A primeira emissão de uma parcela é um recibo normal. A mensagem
        // serve apenas para identificar uma segunda via/reimpressão.
        hasInstallmentAmounts: isExperimentalInstallmentReceipt
            && pagamentos.length > 0
            && pagamentos.every((pagamento: any) => pagamento.parcela_id != null),
    }

    return (
        // REMOVI O padding-top (pt-4) para garantir alinhamento tela/impressão
        <div className="w-full h-screen flex items-start justify-center m-0 p-0">
            <style>{`
                @page { 
                    size: ${receiptType === 'half_a4' ? 'A4 portrait' : 'A4 landscape'}; 
                    margin: 0mm; /* FORÇA MARGEM ZERO NA IMPRESSORA */
                }
                body { 
                    margin: 0px; 
                    padding: 0px;
                }
            `}</style>
            {receiptType === 'half_a4' ? (
                <ReceiptBlankHalfA4 data={receiptData as any} />
            ) : (
                <ReceiptPhantom data={receiptData as any} />
            )}
            <PrintTrigger />
        </div>
    );
}

function PrintTrigger() {
    const printScript = `
        (() => {
            const closeAfterPrint = () => {
                window.removeEventListener('afterprint', closeAfterPrint)
                window.close()
            }

            const startPrint = () => {
                window.addEventListener('afterprint', closeAfterPrint, { once: true })
                window.print()
            }

            // Aguarda a página terminar de carregar para garantir que o recibo
            // esteja renderizado antes de abrir a janela de impressão.
            if (document.readyState === 'complete') {
                window.setTimeout(startPrint, 800)
            } else {
                window.addEventListener('load', () => window.setTimeout(startPrint, 800), { once: true })
            }
        })()
    `

    return (
        <script dangerouslySetInnerHTML={{ __html: printScript }} />
    )
}
