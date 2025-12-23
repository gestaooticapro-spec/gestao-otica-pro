import { getFinanciamentoById } from '@/lib/actions/vendas.actions'
import CarnePhantom from '@/components/print/CarnePhantom'
import { notFound } from 'next/navigation'

export default async function PrintCarnePage({ params }: { params: { id: string } }) {
    const id = parseInt(params.id)
    if (isNaN(id)) return notFound()

    const financiamento = await getFinanciamentoById(id)

    if (!financiamento) {
        return notFound()
    }

    return (
        <div className="min-h-screen bg-gray-100 print:bg-white flex justify-center items-start py-10 print:py-0">
            <CarnePhantom financiamento={financiamento} />
            <PrintTrigger />
        </div>
    )
}

function PrintTrigger() {
    return (
        <script dangerouslySetInnerHTML={{ __html: 'window.print(); window.onafterprint = function() { window.close(); };' }} />
    )
}
