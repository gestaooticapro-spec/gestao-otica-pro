// ARQUIVO: src/app/print/recibo/[id]/page.tsx

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { ReceiptPhantom } from '@/components/print/ReceiptPhantom'
import { ReceiptBlankHalfA4 } from '@/components/print/ReceiptBlankHalfA4'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function PrintReciboPage(
    props: { params: Promise<{ id: string }>, searchParams: Promise<{ reprint?: string }> }
) {
    const searchParams = await props.searchParams;
    const params = await props.params;
    const idsString = params.id
    const ids = idsString.split('-').map(id => parseInt(id)).filter(n => !isNaN(n))

    if (ids.length === 0) return notFound()

    const isReprint = searchParams.reprint === 'true'

    const supabase = createAdminClient()

    // 1. Busca OS Pagamentos
    let { data: pagamentos } = await (supabase
        .from('pagamentos') as any)
        .select('*')
        .in('id', ids)

    // Se não encontrou por ID de pagamento, tenta buscar por ID de venda (vendaIdGerada)
    if (!pagamentos || pagamentos.length === 0) {
        const { data: pagamentosByVenda } = await (supabase
            .from('pagamentos') as any)
            .select('*')
            .in('venda_id', ids)
            .order('created_at', { ascending: false }) // Pega os mais recentes, se houver vários associados àquela venda nesta "sessão"

        if (pagamentosByVenda && pagamentosByVenda.length > 0) {
            pagamentos = pagamentosByVenda;
        }
    }

    if (!pagamentos || pagamentos.length === 0) return <div className="p-10">Pagamentos não encontrados. (Tentei o ID {ids.join(',')} como ID de Pagamento e como ID de Venda)</div>

    const vendaId = pagamentos[0].venda_id

    // 2. Busca a Venda e Cliente
    const { data: vendaRaw } = await (supabase
        .from('vendas') as any)
        .select('*, customers(*), venda_itens(*)')
        .eq('id', vendaId)
        .single()

    if (!vendaRaw) return <div className="p-10">Venda original não encontrada.</div>

    const venda = vendaRaw as any

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
        isReprint
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
    return (
        <script dangerouslySetInnerHTML={{ __html: 'window.onafterprint = function() { window.close(); }; window.print();' }} />
    )
}