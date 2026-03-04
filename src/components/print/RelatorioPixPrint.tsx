
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

    const pixRemoto = data.filter(item => item.forma_pagamento?.toLowerCase().includes('remoto'))
    const pixMaquina = data.filter(item => item.forma_pagamento?.toLowerCase().includes('maquininha') || item.forma_pagamento?.toLowerCase().includes('máquina'))
    const pixOutros = data.filter(item => {
        const p = item.forma_pagamento?.toLowerCase() || ''
        return !p.includes('remoto') && !p.includes('maquininha') && !p.includes('máquina')
    })

    const totalRemoto = pixRemoto.reduce((acc, curr) => acc + Number(curr.valor_pago), 0)
    const totalMaquina = pixMaquina.reduce((acc, curr) => acc + Number(curr.valor_pago), 0)
    const totalOutros = pixOutros.reduce((acc, curr) => acc + Number(curr.valor_pago), 0)
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

                            {/* RENDERIZAÇÃO POR GRUPOS */}
                            {data.length === 0 && (
                                <table className="w-full text-left mb-6">
                                    <thead>
                                        <tr className="border-b border-black"><th className="py-2">Data</th><th>Cliente</th><th className="py-2 text-right">Valor</th></tr>
                                    </thead>
                                    <tbody><tr><td colSpan={3} className="py-4 text-center italic">Nenhum registro encontrado.</td></tr></tbody>
                                </table>
                            )}

                            {pixRemoto.length > 0 && (
                                <div className="mb-6">
                                    <h3 className="font-bold text-md border-b-2 border-black mb-2 pb-1 uppercase">PIX REMOTO (Direto na Conta)</h3>
                                    <table className="w-full text-left">
                                        <thead><tr className="border-b border-black text-xs"><th className="py-1 w-24">Data</th><th className="py-1">Cliente / Descrição</th><th className="py-1 text-right w-32">Valor</th></tr></thead>
                                        <tbody>
                                            {pixRemoto.map((item) => (
                                                <tr key={item.id} className="border-b border-gray-300"><td className="py-1 align-top">{formatDate(item.created_at)}</td><td className="py-1 align-top uppercase">{item.customer_name || 'Consumidor Final'}</td><td className="py-1 text-right font-bold align-top">{formatCurrency(item.valor_pago)}</td></tr>
                                            ))}
                                            <tr><td colSpan={2} className="py-2 font-bold text-right">Subtotal PIX Remoto:</td><td className="py-2 font-bold text-right">{formatCurrency(totalRemoto)}</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {pixMaquina.length > 0 && (
                                <div className="mb-6">
                                    <h3 className="font-bold text-md border-b-2 border-black mb-2 pb-1 uppercase">PIX NA MAQUININHA</h3>
                                    <table className="w-full text-left">
                                        <thead><tr className="border-b border-black text-xs"><th className="py-1 w-24">Data</th><th className="py-1">Cliente / Descrição</th><th className="py-1 text-right w-32">Valor</th></tr></thead>
                                        <tbody>
                                            {pixMaquina.map((item) => (
                                                <tr key={item.id} className="border-b border-gray-300"><td className="py-1 align-top">{formatDate(item.created_at)}</td><td className="py-1 align-top uppercase">{item.customer_name || 'Consumidor Final'}</td><td className="py-1 text-right font-bold align-top">{formatCurrency(item.valor_pago)}</td></tr>
                                            ))}
                                            <tr><td colSpan={2} className="py-2 font-bold text-right">Subtotal PIX Maquininha:</td><td className="py-2 font-bold text-right">{formatCurrency(totalMaquina)}</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {pixOutros.length > 0 && (
                                <div className="mb-6">
                                    <h3 className="font-bold text-md border-b-2 border-black mb-2 pb-1 uppercase">OUTROS PIX (Sem Classificação)</h3>
                                    <table className="w-full text-left">
                                        <thead><tr className="border-b border-black text-xs"><th className="py-1 w-24">Data</th><th className="py-1">Cliente / Descrição</th><th className="py-1 text-right w-32">Valor</th></tr></thead>
                                        <tbody>
                                            {pixOutros.map((item) => (
                                                <tr key={item.id} className="border-b border-gray-300"><td className="py-1 align-top">{formatDate(item.created_at)}</td><td className="py-1 align-top uppercase">{item.customer_name || 'Consumidor Final'}</td><td className="py-1 text-right font-bold align-top">{formatCurrency(item.valor_pago)}</td></tr>
                                            ))}
                                            <tr><td colSpan={2} className="py-2 font-bold text-right">Subtotal Outros:</td><td className="py-2 font-bold text-right">{formatCurrency(totalOutros)}</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="border-t-4 border-black font-black text-xl flex justify-between pt-3 px-1 break-inside-avoid mt-4">
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
