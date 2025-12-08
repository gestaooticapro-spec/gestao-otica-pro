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
    // CORREÇÃO: Cast 'as any' para garantir o select
    const { data: pagamentos } = await (supabase
        .from('pagamentos') as any)
        .select('*')
        .in('id', ids)

    if (!pagamentos || pagamentos.length === 0) return <div className="p-10">Pagamentos não encontrados.</div>

    // Como pagamentos é 'any' no retorno do supabase acima (se não tipado estritamente), garantimos acesso seguro
    const vendaId = pagamentos[0].venda_id

    // 2. Busca a Venda e Cliente
    // CORREÇÃO: Cast 'as any' para permitir os joins (customers, venda_itens)
    const { data: vendaRaw } = await (supabase
        .from('vendas') as any)
        .select('*, customers(*), venda_itens(*)')
        .eq('id', vendaId)
        .single()

    if (!vendaRaw) return <div className="p-10">Venda original não encontrada.</div>

    // CORREÇÃO: Tratamos vendaRaw como any para acessar .customers e .venda_itens sem erro
    const venda = vendaRaw as any

    const receiptData = {
        pagamentos,
        venda,
        cliente: venda.customers,
        itens: venda.venda_itens || [],
        isReprint
    }

    return (
        <div className="w-full h-screen flex items-start justify-center pt-4 print:pt-0">
            <style>{`
                @page { size: A4 landscape; margin: 0; }
                body { margin: 0; }
            `}</style>
            {/* O 'as any' aqui garante que o componente aceite o objeto montado manualmente */}
            <ReceiptPhantom data={receiptData as any} />
        </div>
    )
}