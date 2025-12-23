// ARQUIVO: src/app/print/recibo/[id]/page.tsx

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { ReceiptPhantom } from '@/components/print/ReceiptPhantom'

export default async function PrintReciboPage({ params, searchParams }: { params: { id: string }, searchParams: { reprint?: string } }) {
    const idsString = params.id
    const ids = idsString.split('-').map(id => parseInt(id)).filter(n => !isNaN(n))

    if (ids.length === 0) return notFound()

    const isReprint = searchParams.reprint === 'true'

    const supabase = createAdminClient()

    // 1. Busca OS Pagamentos
    const { data: pagamentos } = await (supabase
        .from('pagamentos') as any)
        .select('*')
        .in('id', ids)

    if (!pagamentos || pagamentos.length === 0) return <div className="p-10">Pagamentos não encontrados.</div>

    const vendaId = pagamentos[0].venda_id

    // 2. Busca a Venda e Cliente
    const { data: vendaRaw } = await (supabase
        .from('vendas') as any)
        .select('*, customers(*), venda_itens(*)')
        .eq('id', vendaId)
        .single()

    if (!vendaRaw) return <div className="p-10">Venda original não encontrada.</div>

    const venda = vendaRaw as any

    const receiptData = {
        pagamentos,
        venda,
        cliente: venda.customers,
        itens: venda.venda_itens || [],
        isReprint
    }

    return (
        // REMOVI O padding-top (pt-4) para garantir alinhamento tela/impressão
        <div className="w-full h-screen flex items-start justify-center m-0 p-0">
            <style>{`
                @page { 
                    size: A4 landscape; 
                    margin: 0mm; /* FORÇA MARGEM ZERO NA IMPRESSORA */
                }
                body { 
                    margin: 0px; 
                    padding: 0px;
                }
            `}</style>

            <ReceiptPhantom data={receiptData as any} />
            <PrintTrigger />
        </div>
    )
}

function PrintTrigger() {
    return (
        <script dangerouslySetInnerHTML={{ __html: 'window.print(); window.onafterprint = function() { window.close(); };' }} />
    )
}