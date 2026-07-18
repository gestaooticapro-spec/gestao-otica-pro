import ImportacaoLentesInterface from '@/components/cadastros/ImportacaoLentesInterface'
import ModuleDisabledState from '@/components/modules/ModuleDisabledState'
import { isStoreModuleEnabledForStore } from '@/lib/store-modules.server'

export default async function ImportarLentesPage(props: { params: Promise<{ storeId: string }> }) {
    const params = await props.params;
    const storeId = parseInt(params.storeId, 10)

    const globalTablesEnabled = await isStoreModuleEnabledForStore(storeId, 'globalTables')
    if (!globalTablesEnabled) {
        return (
            <ModuleDisabledState
                storeId={storeId}
                moduleLabel="Tabelas Globais"
                backHref={`/dashboard/loja/${storeId}/cadastros`}
            />
        )
    }

    return (
        <div className="h-[calc(100vh-64px)] p-6 bg-gray-100">
            <div className="max-w-5xl mx-auto h-full">
                <ImportacaoLentesInterface storeId={storeId} />
            </div>
        </div>
    )
}
