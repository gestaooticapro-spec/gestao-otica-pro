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
        className="w-full border border-gray-300 rounded px-2 py-1 text-[10px] text-gray-600 focus:outline-none focus:border-blue-500 font-normal bg-white"
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
      cell: info => <span className="font-bold text-gray-700">#{info.getValue()}</span>,
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
    columnHelper.accessor('itens_resumo', {
      header: 'Produtos (Resumo)',
      cell: info => (
        <div className="text-[10px] text-gray-500 truncate" title={info.getValue()}>
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
        let color = 'bg-gray-100 text-gray-600'
        if(val === 'Fechada') color = 'bg-green-100 text-green-700'
        if(val === 'Cancelada') color = 'bg-red-100 text-red-700'
        if(val === 'Em Aberto') color = 'bg-yellow-100 text-yellow-800'
        
        return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${color}`}>{val}</span>
      },
      size: 110,
    }),

    // CORREÇÃO DOS FILTROS DE VALORES:
    // Removemos R$, espaços e pontos (.) antes de comparar. 
    // Assim "1.040" vira "1040" e o input "1040" dá match.
    columnHelper.accessor('valor_total', {
      header: 'Total',
      cell: info => <span className="text-gray-600">{formatCurrency(info.getValue())}</span>,
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
        cell: info => <span className="text-blue-700 font-bold">{formatCurrency(info.getValue())}</span>,
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
            return <span className={`${val > 0.01 ? 'text-red-600 bg-red-50 px-1 rounded' : 'text-gray-300'} font-bold`}>{formatCurrency(val)}</span>
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
                href={`/dashboard/loja/${storeId}/vendas/${props.row.original.id}`}
                // REMOVIDO: target="_blank"
                className="flex justify-center items-center text-blue-500 hover:text-blue-700 hover:bg-blue-50 w-8 h-8 rounded transition-colors"
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
    <div className="flex flex-col h-full bg-white border border-gray-300 rounded shadow-sm overflow-hidden text-xs">
      <div className="flex-1 overflow-auto w-full">
        <table className="w-full text-left border-collapse" style={{ width: table.getTotalSize() }}>
          
          <thead className="bg-gray-100 text-gray-700 sticky top-0 z-10 shadow-sm">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th 
                    key={header.id} 
                    colSpan={header.colSpan}
                    className="relative p-2 border-b border-r border-gray-300 last:border-r-0 font-bold uppercase tracking-wider group align-top"
                    style={{ width: header.getSize() }}
                  >
                    <div 
                        className={`flex items-center gap-1 cursor-pointer select-none mb-1 ${header.column.getCanSort() ? 'hover:text-blue-600' : ''}`}
                        onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      
                      {header.column.getCanSort() && (
                          <span className="ml-1">
                              {{
                                asc: <ArrowUp className="h-3 w-3 text-blue-600" />,
                                desc: <ArrowDown className="h-3 w-3 text-blue-600" />,
                              }[header.column.getIsSorted() as string] ?? <ArrowUpDown className="h-3 w-3 text-gray-500" />}
                          </span>
                      )}
                    </div>
                    
                    {header.column.getCanFilter() ? (
                        <Filter column={header.column} />
                    ) : null}

                    <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={`absolute right-0 top-0 h-full w-[4px] cursor-col-resize select-none touch-none hover:bg-blue-400 ${
                            header.column.getIsResizing() ? 'bg-blue-600 opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-gray-200">
            {rows.length === 0 ? (
                <tr>
                    <td colSpan={columns.length} className="p-10 text-center text-gray-400">
                        Nenhum registro encontrado.
                    </td>
                </tr>
            ) : (
                rows.map((row, i) => (
                <tr 
                    key={row.id} 
                    className={`hover:bg-blue-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-100'}`} 
                >
                    {row.getVisibleCells().map(cell => (
                    <td 
                        key={cell.id} 
                        className={`p-1.5 border-r border-gray-200 last:border-r-0 text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis ${(cell.column.columnDef.meta as any)?.isNumeric ? 'text-right' : ''}`}
                        style={{ width: cell.column.getSize() }}
                    >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                    ))}
                </tr>
                ))
            )}
          </tbody>
          
          <tfoot className="bg-gray-800 text-white sticky bottom-0 z-10 font-bold">
             <tr>
                <td className="p-2 border-r border-gray-600">Total: {rows.length}</td>
                <td colSpan={5} className="p-2 border-r border-gray-600 text-right">TOTAIS VISÍVEIS:</td>
                <td className="p-2 border-r border-gray-600 text-right">{formatCurrency(totalGeral)}</td>
                <td className="p-2 border-r border-gray-600 text-right text-emerald-300">{formatCurrency(totalPago)}</td>
                <td className="p-2 border-r border-gray-600 text-right text-red-300">{formatCurrency(totalDevedor)}</td>
                <td></td>
             </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}