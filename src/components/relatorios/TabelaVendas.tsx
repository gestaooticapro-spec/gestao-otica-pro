// Caminho: src/components/relatorios/TabelaVendas.tsx
'use client'

import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState
} from '@tanstack/react-table'
import { VendaRelatorioItem } from '@/lib/actions/reports.actions'
import { ArrowUp, ArrowDown, ArrowUpDown, ExternalLink } from 'lucide-react'
import Link from 'next/link'

// Helpers
const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR')

// --- COMPONENTE DE FILTRO DA COLUNA ---
function Filter({ column }: { column: any }) {
  const columnFilterValue = column.getFilterValue()

  return (
    <div className="mt-2" onClick={e => e.stopPropagation()}>
      <input
        type="text"
        value={(columnFilterValue ?? '') as string}
        onChange={e => column.setFilterValue(e.target.value)}
        placeholder={`Buscar...`}
        className="w-full border border-white/10 rounded px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-blue-500 font-normal bg-white/5 placeholder:text-slate-500"
      />
    </div>
  )
}

export default function TabelaVendas({ data, storeId }: { data: VendaRelatorioItem[], storeId: number }) {
  const [sorting, setSorting] = useState<SortingState>([])

  const columnHelper = createColumnHelper<VendaRelatorioItem>()

  // --- DEFINIÇÃO DAS COLUNAS ---
  const columns = useMemo(() => [
    columnHelper.accessor('id', {
      header: 'ID',
      cell: info => <span className="font-bold text-slate-200">#{info.getValue()}</span>,
      size: 70,
    }),

    columnHelper.accessor('data', {
      header: 'Data',
      cell: info => formatDate(info.getValue()),
      filterFn: (row, columnId, filterValue) => {
        const dateStr = formatDate(row.getValue(columnId))
        return dateStr.includes(filterValue)
      },
      size: 100,
    }),

    columnHelper.accessor('data_fechamento', {
      header: 'Fechamento',
      cell: info => {
        const val = info.getValue()
        return val ? <span className="text-emerald-400 font-medium">{formatDate(val)}</span> : <span className="text-slate-600">-</span>
      },
      size: 100,
    }),

    columnHelper.accessor('cliente', {
      header: 'Cliente',
      cell: info => <span className="truncate block" title={info.getValue()}>{info.getValue()}</span>,
      size: 200,
    }),
    columnHelper.accessor('vendedor', {
      header: 'Vendedor',
      cell: info => <span className="truncate block">{info.getValue()}</span>,
      size: 120,
    }),
    columnHelper.accessor('medico', {
      header: 'Médico',
      cell: info => {
        const val = info.getValue()
        return val === '-'
          ? <span className="text-slate-600">-</span>
          : <span className="truncate block text-teal-400 font-medium" title={val}>{val}</span>
      },
      size: 150,
    }),
    columnHelper.accessor('itens_resumo', {
      header: 'Produtos (Resumo)',
      cell: info => (
        <div className="text-[10px] text-slate-500 truncate" title={info.getValue()}>
          {info.getValue()}
        </div>
      ),
      enableSorting: false,
      size: 250,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: info => {
        const val = info.getValue()
        let color = 'bg-slate-500/20 text-slate-400'
        if (val === 'Fechada') color = 'bg-emerald-500/20 text-emerald-400'
        if (val === 'Cancelada') color = 'bg-red-500/20 text-red-400'
        if (val === 'Em Aberto') color = 'bg-amber-500/20 text-amber-400'

        return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${color}`}>{val}</span>
      },
      size: 110,
    }),

    // CORREÇÃO DOS FILTROS DE VALORES:
    // Removemos R$, espaços e pontos (.) antes de comparar. 
    // Assim "1.040" vira "1040" e o input "1040" dá match.
    columnHelper.accessor('valor_total', {
      header: 'Total',
      cell: info => <span className="text-slate-300">{formatCurrency(info.getValue())}</span>,
      filterFn: (row, columnId, filterValue) => {
        const valStr = formatCurrency(row.getValue(columnId))
        // Normaliza: remove "R$", espaços e pontos de milhar. Mantém a vírgula.
        const normalizedVal = valStr.replace(/[R$\s.]/g, '')
        const normalizedFilter = filterValue.replace(/[R$\s.]/g, '')
        return normalizedVal.includes(normalizedFilter)
      },
      meta: { isNumeric: true },
      size: 100,
    }),
    columnHelper.accessor('valor_pago', {
      header: 'Pago',
      cell: info => <span className="text-blue-400 font-bold">{formatCurrency(info.getValue())}</span>,
      filterFn: (row, columnId, filterValue) => {
        const valStr = formatCurrency(row.getValue(columnId))
        const normalizedVal = valStr.replace(/[R$\s.]/g, '')
        const normalizedFilter = filterValue.replace(/[R$\s.]/g, '')
        return normalizedVal.includes(normalizedFilter)
      },
      meta: { isNumeric: true },
      size: 100,
    }),
    columnHelper.accessor('saldo_devedor', {
      header: 'Devedor',
      cell: info => {
        const val = info.getValue()
        return <span className={`${val > 0.01 ? 'text-red-400 bg-red-500/15 px-1 rounded' : 'text-slate-600'} font-bold`}>{formatCurrency(val)}</span>
      },
      filterFn: (row, columnId, filterValue) => {
        const valStr = formatCurrency(row.getValue(columnId))
        const normalizedVal = valStr.replace(/[R$\s.]/g, '')
        const normalizedFilter = filterValue.replace(/[R$\s.]/g, '')
        return normalizedVal.includes(normalizedFilter)
      },
      meta: { isNumeric: true },
      size: 100,
    }),

    columnHelper.display({
      id: 'actions',
      header: 'Ver',
      cell: (props) => (
        <Link
          href={`/dashboard/loja/${storeId}/vendas/${props.row.original.id}/experimental`}
          className="flex justify-center items-center text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 w-8 h-8 rounded transition-colors"
          title="Abrir Venda"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      ),
      size: 50,
      enableResizing: false,
    })
  ], [storeId])

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

  // Dados processados para o rodapé e corpo
  const rows = table.getRowModel().rows

  const totalGeral = rows.reduce((acc, row) => acc + row.original.valor_final, 0)
  const totalPago = rows.reduce((acc, row) => acc + row.original.valor_pago, 0)
  const totalDevedor = rows.reduce((acc, row) => acc + row.original.saldo_devedor, 0)

  return (
    <div className="flex flex-col h-full bg-white/5 border border-white/10 rounded-xl backdrop-blur-md shadow-2xl shadow-black/20 overflow-hidden text-xs">
      <div className="flex-1 overflow-auto w-full">
        <table className="w-full text-left border-collapse" style={{ width: table.getTotalSize() }}>

          <thead className="bg-slate-900 text-slate-300 sticky top-0 z-10">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    className="relative p-2 border-b border-r border-white/10 last:border-r-0 font-bold uppercase tracking-wider group align-top"
                    style={{ width: header.getSize() }}
                  >
                    <div
                      className={`flex items-center gap-1 cursor-pointer select-none mb-1 ${header.column.getCanSort() ? 'hover:text-blue-400' : ''}`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}

                      {header.column.getCanSort() && (
                        <span className="ml-1">
                          {{
                            asc: <ArrowUp className="h-3 w-3 text-blue-400" />,
                            desc: <ArrowDown className="h-3 w-3 text-blue-400" />,
                          }[header.column.getIsSorted() as string] ?? <ArrowUpDown className="h-3 w-3 text-slate-500" />}
                        </span>
                      )}
                    </div>

                    {header.column.getCanFilter() ? (
                      <Filter column={header.column} />
                    ) : null}

                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className={`absolute right-0 top-0 h-full w-[4px] cursor-col-resize select-none touch-none hover:bg-blue-400 ${header.column.getIsResizing() ? 'bg-blue-500 opacity-100' : 'opacity-0 group-hover:opacity-100'
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
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={`hover:bg-white/5 transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'}`}
                >
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      className={`p-1.5 border-r border-white/5 last:border-r-0 text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis ${(cell.column.columnDef.meta as any)?.isNumeric ? 'text-right' : ''}`}
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>

          <tfoot className="bg-slate-900/80 text-white sticky bottom-0 z-10 font-bold backdrop-blur-xl border-t border-white/10">
            <tr>
              <td className="p-2 border-r border-white/10">Total: {rows.length}</td>
              <td colSpan={6} className="p-2 border-r border-white/10 text-right">TOTAIS VISÍVEIS:</td>
              <td className="p-2 border-r border-white/10 text-right">{formatCurrency(totalGeral)}</td>
              <td className="p-2 border-r border-white/10 text-right text-emerald-400">{formatCurrency(totalPago)}</td>
              <td className="p-2 border-r border-white/10 text-right text-red-400">{formatCurrency(totalDevedor)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}