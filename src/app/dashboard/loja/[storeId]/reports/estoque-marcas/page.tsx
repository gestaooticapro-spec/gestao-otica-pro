import { getEstoqueSolaresArmacoes, getMarcasFiltroEstoque } from '@/lib/actions/reports.actions'
import TabelaEstoque from '@/components/relatorios/TabelaEstoque'
import FiltroMarcaEstoque from '@/components/relatorios/FiltroMarcaEstoque'
import { ArrowLeft, PackageSearch } from 'lucide-react'
import Link from 'next/link'

export default async function EstoqueDetalhadoPage({
    params,
    searchParams,
}: {
    params: { storeId: string }
    searchParams: { marca?: string }
}) {
    const storeId = parseInt(params.storeId, 10)

    // 1. Busca lista de marcas disponíveis
    const marcasDisponiveis = await getMarcasFiltroEstoque(storeId)

    // 2. Define a marca atual (escolhida ou a primeira da lista)
    const marcaAtual = searchParams.marca || (marcasDisponiveis.length > 0 ? marcasDisponiveis[0] : '')

    // 3. Busca Dados no Server filtrados
    const dados = await getEstoqueSolaresArmacoes(storeId, marcaAtual)

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden">

            {/* HEADER DE FILTROS GLOBAIS */}
            <div className="bg-white/5 border-b border-white/10 px-4 py-3 flex flex-wrap lg:flex-nowrap items-center justify-between gap-4 backdrop-blur-xl flex-shrink-0">
                <div className="flex items-center gap-4 flex-shrink-0">
                    <Link
                        href={`/dashboard/loja/${storeId}/reports`}
                        className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm font-medium group"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        Voltar
                    </Link>
                    <div className="h-4 w-[1px] bg-white/10 mx-1 hidden sm:block" />
                    <h1 className="text-sm font-bold text-white flex items-center gap-2">
                        <PackageSearch className="h-5 w-5 text-pink-400" />
                        <span className="hidden sm:inline">Estoque Detalhado</span>
                    </h1>
                </div>

                {/* Componente de Filtro de Marca (Dropdown) */}
                <div className="flex-1 w-full lg:w-auto flex lg:justify-center">
                    <FiltroMarcaEstoque
                        marcas={marcasDisponiveis}
                        selecionada={marcaAtual}
                    />
                </div>

                <div className="flex items-center justify-end flex-shrink-0">
                    <span className="text-[10px] text-slate-400 uppercase font-black text-right line-clamp-2">Itens na Marca selecionada: <strong className="text-pink-400 ml-1">{dados.length}</strong></span>
                </div>
            </div>

            {/* ÁREA DA TABELA */}
            <div className="flex-1 p-4 overflow-hidden">
                <TabelaEstoque data={dados} />
            </div>
        </div>
    )
}
