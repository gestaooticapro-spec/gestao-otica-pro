"use client";

import { useEffect, useState, useRef } from "react";
import { getFiscalInvoices } from "@/lib/actions/fiscal-db.actions";
import { consultarNFCe, cancelarNota } from "@/lib/actions/fiscal.actions";
import {
    FileText, Plus, Search, Loader2, AlertCircle,
    CheckCircle, XCircle, Clock, Download, RefreshCw, Edit, Ban
} from "lucide-react";
import Link from "next/link";

type Invoice = {
    id: string;
    numero: string;
    serie: string;
    status: string;
    tipo_documento: string;
    created_at: string;
    pdf_url: string | null;
    xml_url: string | null;
    error_message: string | null;
    work_order_id: number | null;
};

export default function FiscalDashboard({ params }: { params: { storeId: string } }) {
    const storeId = parseInt(params.storeId);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [environment, setEnvironment] = useState<'production' | 'homologation'>('production');

    // Ref para evitar loop infinito no polling
    const invoicesRef = useRef<Invoice[]>([]);
    invoicesRef.current = invoices;

    // Smart Polling Logic
    useEffect(() => {
        const checkForUpdates = async () => {
            const processingInvoices = invoicesRef.current.filter(inv => inv.status === 'processing');
            if (processingInvoices.length === 0) return;

            let updated = false;
            for (const inv of processingInvoices) {
                if (inv.tipo_documento === 'NFCe') {
                    const res = await consultarNFCe(inv.id);
                    if (res.success && res.status !== 'processing') {
                        updated = true;
                    }
                }
            }
            if (updated) {
                fetchInvoices();
            }
        };

        // Calcula intervalo baseado em notas recentes
        const getInterval = () => {
            const processingInvoices = invoicesRef.current.filter(inv => inv.status === 'processing');
            if (processingInvoices.length === 0) return null;

            const hasRecent = processingInvoices.some(inv => {
                const created = new Date(inv.created_at).getTime();
                return (Date.now() - created) < 60000;
            });
            return hasRecent ? 5000 : 30000;
        };

        const intervalMs = getInterval();
        if (!intervalMs) return;

        console.log(`[Smart Polling] Intervalo: ${intervalMs}ms`);
        const intervalId = setInterval(checkForUpdates, intervalMs);

        return () => clearInterval(intervalId);
    }, [invoices.filter(inv => inv.status === 'processing').length]);

    useEffect(() => {
        if (storeId) {
            fetchInvoices();
        }
    }, [storeId]);

    const fetchInvoices = async () => {
        setLoading(true);
        try {
            const data = await getFiscalInvoices(storeId);
            setInvoices(data as Invoice[]);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleRefreshStatus = async (invoiceId: string) => {
        const toastId = alert("Consultando status...");
        try {
            const res = await consultarNFCe(invoiceId);
            if (res.success) {
                if (res.status === 'error') {
                    // Tenta pegar a mensagem de erro mais específica possível
                    let msg = res.data?.motivo_status || res.data?.error?.message;

                    // Verifica se tem mensagens de erro detalhadas (comum na NuvemFiscal)
                    if (res.data?.mensagens && Array.isArray(res.data.mensagens)) {
                        const detalhes = res.data.mensagens.map((m: any) => `${m.codigo}: ${m.descricao}`).join('\n');
                        if (detalhes) msg = detalhes;
                    }

                    alert(`Erro da Sefaz/NuvemFiscal:\n${msg || "Erro desconhecido"}`);
                } else {
                    alert(`Status atualizado: ${res.status}`);
                }
                fetchInvoices();
            } else {
                alert(`Erro: ${res.error}`);
            }
        } catch (e) {
            alert("Erro ao consultar.");
        }
    };

    const handleCancelar = async (invoiceId: string) => {
        const justificativa = prompt("Motivo do cancelamento (Mínimo 15 caracteres):");
        if (!justificativa) return;
        if (justificativa.length < 15) return alert("Justificativa muito curta.");

        if (!confirm("Tem certeza que deseja cancelar esta nota? Ação irreversível.")) return;

        try {
            const res = await cancelarNota(invoiceId, justificativa);
            if (res.success) {
                alert("Sucesso: " + res.message);
                fetchInvoices();
            } else {
                alert("Erro: " + res.error);
            }
        } catch (e: any) {
            alert("Erro ao cancelar: " + e.message);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'authorized':
                return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1"><CheckCircle size={12} /> Autorizada</span>;
            case 'error':
                return <span className="bg-red-100 text-red-700 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1"><XCircle size={12} /> Erro</span>;
            case 'processing':
                return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Processando</span>;
            case 'cancelled':
                return <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1"><XCircle size={12} /> Cancelada</span>;
            default:
                return <span className="bg-stone-100 text-stone-600 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1"><Clock size={12} /> Rascunho</span>;
        }
    };

    const filteredInvoices = invoices.filter(inv =>
        (inv.numero || "").includes(searchTerm) ||
        (inv.status || "").includes(searchTerm)
    );

    return (
        <div className="space-y-6 pb-32 p-6">
            {/* CABEÇALHO */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-[#1A1A1A]">Fiscal (NFC-e)</h1>
                    <p className="text-stone-500">Gerencie suas notas fiscais de consumidor.</p>
                </div>

                <div className="flex items-center gap-3 bg-white p-1 rounded-xl border border-stone-200 shadow-sm">
                    <button
                        onClick={() => setEnvironment('homologation')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition ${environment === 'homologation' ? 'bg-yellow-100 text-yellow-700' : 'text-stone-400 hover:text-stone-600'}`}
                    >
                        Homologação
                    </button>
                    <button
                        onClick={() => setEnvironment('production')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition ${environment === 'production' ? 'bg-green-100 text-green-700' : 'text-stone-400 hover:text-stone-600'}`}
                    >
                        Produção
                    </button>
                </div>
            </div>

            {/* BÚSCA E AÇÕES */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por número ou status..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white rounded-xl py-3 pl-12 pr-4 border border-stone-200 outline-none focus:ring-2 focus:ring-[#FACC15]"
                    />
                </div>

                <Link href={`/dashboard/loja/${storeId}/fiscal/emitir?env=${environment}`}>
                    <button className="bg-[#1A1A1A] hover:bg-black text-[#FACC15] px-6 py-3 rounded-full font-bold text-sm shadow-lg flex items-center gap-2 transition hover:scale-105">
                        <Plus size={20} /> Nova Nota
                    </button>
                </Link>
            </div>

            {/* FILTROS E RESUMO */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600"><CheckCircle size={24} /></div>
                    <div>
                        <p className="text-2xl font-bold text-[#1A1A1A]">{invoices.filter(i => i.status === 'authorized').length}</p>
                        <p className="text-xs text-stone-500 font-bold uppercase">Autorizadas</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-500"><AlertCircle size={24} /></div>
                    <div>
                        <p className="text-2xl font-bold text-[#1A1A1A]">{invoices.filter(i => i.status === 'error').length}</p>
                        <p className="text-xs text-stone-500 font-bold uppercase">Com Erro</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-500"><Clock size={24} /></div>
                    <div>
                        <p className="text-2xl font-bold text-[#1A1A1A]">{invoices.filter(i => i.status === 'processing' || i.status === 'draft').length}</p>
                        <p className="text-xs text-stone-500 font-bold uppercase">Pendentes</p>
                    </div>
                </div>
            </div>

            {/* LISTA */}
            <div className="bg-white rounded-[32px] border border-stone-100 shadow-sm overflow-hidden min-h-[400px]">
                <div className="p-6 border-b border-stone-50 flex flex-col md:flex-row justify-between gap-4">
                    <h3 className="font-bold text-[#1A1A1A] flex items-center gap-2"><FileText size={20} /> Histórico de Emissões</h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[#F8F7F2] text-stone-500 text-xs uppercase font-bold">
                            <tr>
                                <th className="px-6 py-4">Número / Série</th>
                                <th className="px-6 py-4">Tipo</th>
                                <th className="px-6 py-4">Data</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {loading ? (
                                <tr><td colSpan={5} className="text-center py-10"><Loader2 className="animate-spin mx-auto text-[#FACC15]" /></td></tr>
                            ) : filteredInvoices.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-10 text-stone-400">Nenhuma nota encontrada.</td></tr>
                            ) : (
                                filteredInvoices.map(inv => (
                                    <tr key={inv.id} className="border-b border-stone-50 hover:bg-[#F9F8F4] transition">
                                        <td className="px-6 py-4">
                                            <p className="font-bold text-[#1A1A1A]">{inv.numero ? `#${inv.numero}` : 'S/N'}</p>
                                            <p className="text-xs text-stone-400">Série {inv.serie || '-'}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="bg-stone-100 text-stone-600 px-2 py-1 rounded text-xs font-bold">{inv.tipo_documento}</span>
                                        </td>
                                        <td className="px-6 py-4 text-stone-600">
                                            {new Date(inv.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            {getStatusBadge(inv.status)}
                                            {inv.error_message && (
                                                <p className="text-[10px] text-red-500 mt-1 max-w-[200px] truncate" title={inv.error_message}>{inv.error_message}</p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {inv.pdf_url && (
                                                    <a href={inv.pdf_url} target="_blank" className="p-2 bg-stone-100 hover:bg-[#1A1A1A] hover:text-[#FACC15] rounded-lg transition" title="Baixar PDF">
                                                        <Download size={16} />
                                                    </a>
                                                )}
                                                {/* Botão de Cancelar (Apenas Autorizadas) */}
                                                {inv.status === 'authorized' && (
                                                    <button
                                                        onClick={() => handleCancelar(inv.id)}
                                                        className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition"
                                                        title="Cancelar Nota"
                                                    >
                                                        <Ban size={16} />
                                                    </button>
                                                )}
                                                {/* Botão de Detalhes ou Reenviar se erro */}
                                                {(inv.status === 'processing' || inv.status === 'error') && (
                                                    <button
                                                        onClick={() => handleRefreshStatus(inv.id)}
                                                        className={`p-2 rounded-lg transition ${inv.status === 'error' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                                                        title={inv.status === 'error' ? "Ver Detalhes do Erro" : "Atualizar Status"}
                                                    >
                                                        {inv.status === 'error' ? <AlertCircle size={16} /> : <RefreshCw size={16} />}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div >
    );
}
