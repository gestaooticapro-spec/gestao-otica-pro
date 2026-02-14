
'use client'

import { useEffect, useRef } from 'react'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pt-BR')
const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

type Movimento = {
    id: number
    valor_pago: number
    forma_pagamento: string
    created_at: string
    customer_name?: string
    obs?: string
}

export default function RelatorioPixPrint({
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
            window.print()
            window.close()
        }, 800)
        return () => clearTimeout(timer)
    }, [])

    const total = data.reduce((acc, curr) => acc + Number(curr.valor_pago), 0)

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
                            {/* CABEÇALHO */}
                            <div className="text-center mb-6 border-b border-black pb-4">
                                <h1 className="font-bold text-xl uppercase mb-1">{storeName}</h1>
                                <h2 className="font-bold text-lg uppercase">Relatório de Recebimentos - PIX</h2>
                                <p className="text-sm mt-1">Período: {periodo}</p>
                            </div>

                            {/* TABELA */}
                            <table className="w-full text-left mb-6">
                                <thead>
                                    <tr className="border-b border-black">
                                        <th className="py-2 w-24">Data</th>
                                        <th className="py-2">Cliente / Descrição</th>
                                        <th className="py-2 text-right w-32">Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="py-4 text-center italic">Nenhum registro encontrado.</td>
                                        </tr>
                                    )}
                                    {data.map((item) => (
                                        <tr key={item.id} className="border-b border-gray-300">
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
                                <span>TOTAL GERAL:</span>
                                <span>{formatCurrency(total)}</span>
                            </div>

                            {/* RODAPÉ */}
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
