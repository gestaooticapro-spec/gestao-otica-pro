import ImportacaoLentesInterface from '@/components/cadastros/ImportacaoLentesInterface'

export default function ImportarLentesPage({ params }: { params: { storeId: string } }) {
    const storeId = parseInt(params.storeId, 10)
    
    return (
        <div className="h-[calc(100vh-64px)] p-6 bg-gray-100">
            <div className="max-w-5xl mx-auto h-full">
                <ImportacaoLentesInterface storeId={storeId} />
            </div>
        </div>
    )
}