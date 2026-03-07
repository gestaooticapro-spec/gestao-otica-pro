'use client'

import { useState, useMemo } from 'react'
import {
    useReactTable,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    flexRender,
    createColumnHelper,
    SortingState,
    Column
} from '@tanstack/react-table'
import { EstoqueReportItem } from '@/lib/actions/reports.actions'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function Filter({ column }: { column: Column<any, unknown> }) {
    const columnFilterValue = column.getFilterValue()

    return (
        <div className="mt-2" onClick={e => e.stopPropagation()}>
            <input
                type="text"
                value={(columnFilterValue ?? '') as string}
                onChange={e => column.setFilterValue(e.target.value)}
                placeholder={`Buscar...`}
                className="w-full border border-white/10 rounded px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-pink-500 font-normal bg-white/5 placeholder:text-slate-500"
            />
        </div>
    )
}

export default function TabelaEstoque({ data }: { data: EstoqueReportItem[] }) {
    const [sorting, setSorting] = useState<SortingState>([])

    const columnHelper = createColumnHelper<EstoqueReportItem>()

    const columns = useMemo(() => [
        columnHelper.accessor('id', {
            header: 'ID',
            cell: info => <span className="font-bold text-slate-200">#{info.getValue()}</span>,
            size: 70,
        }),
        columnHelper.accessor('tipo_produto', {
            header: 'Tipo',
            cell: info => <span className="font-medium text-slate-300">{info.getValue()}</span>,
            size: 100,
        }),
        columnHelper.accessor('categoria', {
            header: 'Categoria',
            cell: info => <span className="text-slate-400">{info.getValue() || '-'}</span>,
            size: 120,
        }),
        columnHelper.accessor('marca', {
            header: 'Marca',
            cell: info => <span className="font-bold text-pink-400">{info.getValue()}</span>,
            enableColumnFilter: false,
            size: 150,
        }),
        columnHelper.accessor('nome', {
            header: 'Produto',
            cell: info => <span className="truncate block max-w-[250px]" title={info.getValue()}>{info.getValue()}</span>,
            size: 250,
        }),
        columnHelper.accessor('preco_custo', {
            header: 'Custo Und.',
            cell: info => <span className="text-slate-500">{formatCurrency(info.getValue())}</span>,
            filterFn: (row, columnId, filterValue) => {
                const valStr = formatCurrency(row.getValue(columnId))
                const normalizedVal = valStr.replace(/[R$\s.]/g, '')
                const normalizedFilter = filterValue.replace(/[R$\s.]/g, '')
                return normalizedVal.includes(normalizedFilter)
            },
            meta: { isNumeric: true },
            size: 100,
        }),
        columnHelper.accessor('preco_venda', {
            header: 'Venda Und.',
            cell: info => <span className="text-emerald-400 font-medium">{formatCurrency(info.getValue())}</span>,
            filterFn: (row, columnId, filterValue) => {
                const valStr = formatCurrency(row.getValue(columnId))
                const normalizedVal = valStr.replace(/[R$\s.]/g, '')
                const normalizedFilter = filterValue.replace(/[R$\s.]/g, '')
                return normalizedVal.includes(normalizedFilter)
            },
            meta: { isNumeric: true },
            size: 100,
        }),
        columnHelper.accessor('estoque_atual', {
            header: 'Estoque Qtd',
            cell: info => {
                const val = info.getValue();
                return <span className={`font-bold ${val > 0 ? 'text-blue-400' : 'text-red-400'}`}>{val} un</span>;
            },
            filterFn: (row, columnId, filterValue) => {
                const valStr = String(row.getValue(columnId))
                return valStr.includes(filterValue)
            },
            meta: { isNumeric: true },
            size: 100,
        }),
        columnHelper.accessor('valor_total_venda_estimado', {
            header: 'Valor Total (Venda)',
            cell: info => <span className="font-bold text-amber-400">{formatCurrency(info.getValue())}</span>,
            filterFn: (row, columnId, filterValue) => {
                const valStr = formatCurrency(row.getValue(columnId))
                const normalizedVal = valStr.replace(/[R$\s.]/g, '')
                const normalizedFilter = filterValue.replace(/[R$\s.]/g, '')
                return normalizedVal.includes(normalizedFilter)
            },
            meta: { isNumeric: true },
            size: 140,
        })
    ], [])

    const table = useReactTable({
        data,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        columnResizeMode: 'onChange',
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
    })

    const rows = table.getRowModel().rows

    const totalEstoque = rows.reduce((acc, row) => acc + row.original.estoque_atual, 0)
    const totalCusto = rows.reduce((acc, row) => acc + (row.original.estoque_atual * row.original.preco_custo), 0)
    const totalVendaEstimada = rows.reduce((acc, row) => acc + row.original.valor_total_venda_estimado, 0)

    return (
        <div className="flex flex-col h-full bg-white/5 border border-white/10 rounded-xl backdrop-blur-md shadow-2xl shadow-black/20 overflow-hidden text-xs">
            <div className="flex-1 overflow-auto w-full">
                <table className="w-full text-left border-collapse" style={{ width: table.getTotalSize() }}>

                    <thead className="bg-[#0f172a] text-slate-300 sticky top-0 z-10 border-b border-white/10 shadow-sm">
                        {table.getHeaderGroups().map(headerGroup => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map(header => (
                                    <th
                                        key={header.id}
                                        colSpan={header.colSpan}
                                        className="relative p-2 border-r border-white/10 last:border-r-0 font-bold uppercase tracking-wider group align-top"
                                        style={{ width: header.getSize() }}
                                    >
                                        <div
                                            className={`flex items-center gap-1 cursor-pointer select-none mb-1 ${header.column.getCanSort() ? 'hover:text-pink-400' : ''}`}
                                            onClick={header.column.getToggleSortingHandler()}
                                        >
                                            {flexRender(header.column.columnDef.header, header.getContext())}

                                            {header.column.getCanSort() && (
                                                <span className="ml-1">
                                                    {{
                                                        asc: <ArrowUp className="h-3 w-3 text-pink-400" />,
                                                        desc: <ArrowDown className="h-3 w-3 text-pink-400" />,
                                                    }[header.column.getIsSorted() as string] ?? <ArrowUpDown className="h-3 w-3 text-slate-500 opacity-50" />}
                                                </span>
                                            )}
                                        </div>

                                        {header.column.getCanFilter() ? (
                                            <Filter column={header.column} />
                                        ) : null}

                                        <div
                                            onMouseDown={header.getResizeHandler()}
                                            onTouchStart={header.getResizeHandler()}
                                            className={`absolute right-0 top-0 h-full w-[4px] cursor-col-resize select-none touch-none hover:bg-pink-400 ${header.column.getIsResizing() ? 'bg-pink-500 opacity-100' : 'opacity-0 group-hover:opacity-100'
                                                }`}
                                        />
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>

                    <tbody className="divide-y divide-white/5">
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="p-10 text-center text-slate-500">
                                    Nenhuma peça de estoque encontrada para estes filtros.
                                </td>
                            </tr>
                        ) : (
                            rows.map((row, i) => (
                                <tr
                                    key={row.id}
                                    className={`hover:bg-white/10 transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'}`}
                                >
                                    {row.getVisibleCells().map(cell => (
                                        <td
                                            key={cell.id}
                                            className={`p-2 border-r border-white/5 last:border-r-0 text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis ${(cell.column.columnDef.meta as Record<string, unknown>)?.isNumeric ? 'text-right' : ''}`}
                                            style={{ width: cell.column.getSize() }}
                                        >
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>

                    <tfoot className="bg-[#0f172a]/90 text-white sticky bottom-0 z-10 font-bold backdrop-blur-xl border-t border-white/20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                        <tr>
                            <td className="p-3 border-r border-white/10 border-t border-white/20">Total de Registros: {rows.length}</td>
                            <td colSpan={4} className="p-3 border-r border-white/10 text-right text-sm text-pink-300 border-t border-white/20">SOMAS DOS FILTROS ATUAIS:</td>
                            <td className="p-3 border-r border-white/10 text-right text-slate-400 border-t border-white/20 text-[10px] leading-tight flex flex-col items-end justify-center">
                                <span>Custo Subtotal</span>
                                <span className="font-normal">{formatCurrency(totalCusto)}</span>
                            </td>
                            <td className="p-3 border-r border-white/10 text-right border-t border-white/20"></td>
                            <td className="p-3 border-r border-white/10 text-right text-blue-400 text-sm border-t border-white/20">{totalEstoque} un</td>
                            <td className="p-3 border-r border-white/10 text-right text-amber-400 text-sm border-t border-white/20">{formatCurrency(totalVendaEstimada)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    )
}
