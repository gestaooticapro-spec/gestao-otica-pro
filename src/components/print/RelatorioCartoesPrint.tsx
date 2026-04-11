'use client'

import { useEffect, useRef } from 'react'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pt-BR')

type Movimento = {
    id: number
    valor_pago: number
    forma_pagamento: string
    created_at: string
    customer_name?: string
    obs?: string
}

export default function RelatorioCartoesPrint({
    storeName,
    data,
    periodo
}: {
    storeName: string,
    data: Movimento[],
    periodo: string
}) {
    useEffect(() => {
        const timer = setTimeout(() => {
            window.onafterprint = () => window.close()
            window.print()
        }, 800)
        return () => clearTimeout(timer)
    }, [])

    const credito = data.filter(d => d.forma_pagamento.toLowerCase().includes('crédito'))
    const debito = data.filter(d => d.forma_pagamento.toLowerCase().includes('débito'))

    // Outros: nem crédito nem débito explícito
    const outros = data.filter(d => !d.forma_pagamento.toLowerCase().includes('crédito') && !d.forma_pagamento.toLowerCase().includes('débito'))

    const totalCredito = credito.reduce((acc, curr) => acc + Number(curr.valor_pago), 0)
    const totalDebito = debito.reduce((acc, curr) => acc + Number(curr.valor_pago), 0)
    const totalOutros = outros.reduce((acc, curr) => acc + Number(curr.valor_pago), 0)
    const totalGeral = totalCredito + totalDebito + totalOutros

    const renderTable = (items: Movimento[], title: string) => {
        const total = items.reduce((acc, curr) => acc + Number(curr.valor_pago), 0)

        return (
            <div className="mb-8" key={title}>
                <h3 className="font-bold text-md mb-2 bg-gray-100 p-1 border border-gray-300 uppercase">{title}</h3>
                <table className="w-full text-left mb-2">
                    <thead>
                        <tr className="border-b border-black text-xs">
                            <th className="py-1 w-20">Data</th>
                            <th className="py-1">Cliente / Detalhe</th>
                            <th className="py-1 text-right w-24">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 && (
                            <tr><td colSpan={3} className="py-2 text-center text-xs italic">Sem registros.</td></tr>
                        )}
                        {items.map((item) => (
                            <tr key={item.id} className="border-b border-gray-100 break-inside-avoid">
                                <td className="py-1 align-top">
                                    {formatDate(item.created_at)}
                                </td>
                                <td className="py-1 align-top uppercase">
                                    {item.customer_name || 'Consumidor Final'}
                                </td>
                                <td className="py-1 text-right font-bold align-top">
                                    {formatCurrency(item.valor_pago)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="border-t-2 border-black font-bold text-lg flex justify-between pt-2 px-1 break-inside-avoid">
                    <span>TOTAL {title.toUpperCase()}:</span>
                    <span>{formatCurrency(total)}</span>
                </div>
            </div >
        )
    }

    return (
        <div className="bg-white min-h-screen text-black font-mono text-sm">
            <style type="text/css" media="print">
                {`
                @page { 
                    margin: 0;
                    size: auto;
                }
                body { 
                    margin: 0;
                    padding: 0;
                    -webkit-print-color-adjust: exact;
                }
                /* Garante que o thead/tfoot repitam */
                table { page-break-inside: auto; }
                tr { page-break-inside: auto; page-break-after: auto; }
                thead { display: table-header-group; }
                tfoot { display: table-footer-group; }
                `}
            </style>

            <table className="w-full">
                {/* MARGEM SUPERIOR (Repete em todas as páginas) */}
                <thead>
                    <tr>
                        <td className="h-[20mm]"></td>
                    </tr>
                </thead>

                {/* MARGEM INFERIOR (Repete em todas as páginas) */}
                <tfoot>
                    <tr>
                        <td className="h-[20mm]"></td>
                    </tr>
                </tfoot>

                {/* CONTEÚDO PRINCIPAL (Com margens laterais) */}
                <tbody>
                    <tr>
                        <td className="px-[20mm] align-top">
                            {/* CABEÇALHO DO RELATÓRIO */}
                            <div className="text-center mb-6 border-b border-black pb-4">
                                <h1 className="font-bold text-xl uppercase mb-1">{storeName}</h1>
                                <h2 className="font-bold text-lg uppercase">Relatório de Recebimentos - Cartões</h2>
                                <p className="text-sm mt-1">Período: {periodo}</p>
                            </div>

                            {renderTable(credito, 'Cartão de Crédito')}
                            {renderTable(debito, 'Cartão de Débito')}

                            {outros.length > 0 && (
                                renderTable(outros, 'Outros Cartões')
                            )}

                            <div className="mt-4 pt-4 border-t-2 border-black flex justify-between items-center text-xl font-bold break-inside-avoid">
                                <span>TOTAL GERAL:</span>
                                <span>{formatCurrency(totalGeral)}</span>
                            </div>

                            {/* RODAPÉ DE INFO */}
                            <div className="text-center text-[10px] mt-4 pt-2 border-t border-gray-300">
                                <p>Relatório gerado em {new Date().toLocaleDateString('pt-BR')}</p>
                                <p>Sistema Gestão Ótica Pro</p>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    )
}
