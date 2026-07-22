"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getFiscalInvoices } from "@/lib/actions/fiscal-db.actions";
import { consultarNFCe, consultarNFe, cancelarNota } from "@/lib/actions/fiscal.actions";
import BackButton from "@/components/ui/BackButton";
import {
    FileText, Plus, Search, Loader2, AlertCircle,
    CheckCircle, XCircle, Clock, Download, RefreshCw, Ban, MessageCircle, FileArchive, Printer
} from "lucide-react";
import { useStoreModules } from '@/lib/contexts/StoreModulesContext';
import ModuleDisabledState from '@/components/modules/ModuleDisabledState';

type Invoice = {
    id: string;
    numero: string | null;
    serie: string | null;
    status: string;
    tipo_documento: string;
    direction: string | null;
    created_at: string;
    data_emissao: string | null;
    environment: string;
    pdf_url: string | null;
    xml_url: string | null;
    error_message: string | null;
    motivo_rejeicao: string | null;
    chave_acesso: string | null;
    work_order_id: number | null;
    destinatario_nome: string | null;
    valor_total: number | null;
};

function formatFiscalStatusMessage(message?: string | null) {
    const normalized = String(message || "").trim();
    const lower = normalized.toLowerCase();

    if (
        lower.includes("could not connect to server") ||
        lower.includes("winhttp operation") ||
        lower.includes("nfeautorizacao4") ||
        lower.includes("error: (12029)")
    ) {
        return `Instabilidade externa na SEFAZ/PR.\nA autorizacao nao foi concluida e voce pode tentar novamente mais tarde.\n\nDetalhe tecnico:\n${normalized}`;
    }

    if (
        lower.includes("ora-04025") ||
        (lower.includes("erro nao catalogado") && lower.includes("sql"))
    ) {
        return `A SEFAZ/PR respondeu com instabilidade interna.\nNao parece ser erro de preenchimento da nota.\n\nDetalhe tecnico:\n${normalized}`;
    }

    return normalized || "Erro desconhecido";
}

export default function FiscalDashboard(props: { params: { storeId: string } }) {
    const params = props.params;
    const storeId = parseInt(params.storeId);
    const router = useRouter();
    const modules = useStoreModules();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [environment, setEnvironment] = useState<"production" | "homologation">("production");
    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
    });

    const invoicesRef = useRef<Invoice[]>([]);
    invoicesRef.current = invoices;

    // Smart polling para notas em processamento
    useEffect(() => {
        if (!modules.fiscal) return;

        const checkForUpdates = async () => {
            const processingInvoices = invoicesRef.current.filter(
                (inv) => inv.status === "processing" && inv.environment === environment
            );
            if (processingInvoices.length === 0) return;

            let updated = false;
            for (const inv of processingInvoices) {
                if (inv.tipo_documento === "NFCe") {
                    const res = await consultarNFCe(inv.id);
                    if (res.success && res.status !== "processing") updated = true;
                } else if (inv.tipo_documento === "NFe") {
                    const res = await consultarNFe(inv.id);
                    if (res.success && res.status !== "processing") updated = true;
                }
            }
            if (updated) fetchInvoices();
        };

        const getInterval = () => {
            const processing = invoicesRef.current.filter(
                (inv) => inv.status === "processing" && inv.environment === environment
            );
            if (processing.length === 0) return null;
            const hasRecent = processing.some((inv) => {
                return (Date.now() - new Date(inv.created_at).getTime()) < 60000;
            });
            return hasRecent ? 5000 : 30000;
        };

        const intervalMs = getInterval();
        if (!intervalMs) return;
        const intervalId = setInterval(checkForUpdates, intervalMs);
        return () => clearInterval(intervalId);
    }, [invoices.filter((inv) => inv.status === "processing").length, environment, modules.fiscal]);

    useEffect(() => {
        if (storeId && modules.fiscal) fetchInvoices();
    }, [storeId, modules.fiscal]);

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
        alert("Consultando status na Nuvem Local...");
        try {
            const invoice = invoices.find((inv) => inv.id === invoiceId);
            const tipo = invoice?.tipo_documento;
            const res = tipo === "NFe"
                ? await consultarNFe(invoiceId)
                : await consultarNFCe(invoiceId);
            if (res.success) {
                if (res.status === "error" || res.status === "rejected") {
                    let msg = res.data?.autorizacao?.motivo_status || res.data?.motivo_status || res.data?.error?.message;
                    if (res.data?.mensagens && Array.isArray(res.data.mensagens)) {
                        const detalhes = res.data.mensagens.map((m: any) => `${m.codigo}: ${m.descricao}`).join("\n");
                        if (detalhes) msg = detalhes;
                    }
                    alert(`Status fiscal com falha:\n\n${formatFiscalStatusMessage(msg)}`);
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
        const justificativa = prompt("Motivo do cancelamento (mínimo 15 caracteres):");
        if (!justificativa) return;
        if (justificativa.length < 15) { alert("Justificativa muito curta."); return; }
        if (!confirm("Cancelar esta nota? Ação irreversível.")) return;

        try {
            const res = await cancelarNota(invoiceId, justificativa);
            if (res.success) {
                alert("Nota cancelada: " + res.message);
                fetchInvoices();
            } else {
                alert("Erro: " + res.error);
            }
        } catch (e: any) {
            alert("Erro ao cancelar: " + e.message);
        }
    };

    const handlePrint = (invoiceId: string) => {
        const url = `/api/fiscal/print/${invoiceId}`;
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = url;
        document.body.appendChild(iframe);
        iframe.onload = () => {
            try {
                iframe.contentWindow?.print();
            } catch (e) {
                window.open(url, "_blank");
            }
            setTimeout(() => document.body.removeChild(iframe), 60000);
        };
    };

    const handleWhatsApp = (inv: Invoice) => {
        const pdfLink = `${window.location.origin}/api/fiscal/print/${inv.id}?download=true`;
        const firstName = inv.destinatario_nome?.split(" ")[0] || "";
        const tipoText = inv.tipo_documento === "NFSe"
            ? "Nota Fiscal de Serviço (NFS-e)"
            : inv.tipo_documento === "NFe"
                ? "Nota Fiscal Eletrônica (NF-e)"
                : "Nota Fiscal de Consumidor (NFC-e)";
        const text = `Olá${firstName ? `, ${firstName}` : ""}! Segue o link para baixar sua ${tipoText}:\n\n${pdfLink}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "authorized":
                return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 w-fit"><CheckCircle size={12} /> Autorizada</span>;
            case "rejected":
                return <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 w-fit"><XCircle size={12} /> Rejeitada</span>;
            case "error":
                return <span className="bg-red-100 text-red-700 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 w-fit"><XCircle size={12} /> Erro</span>;
            case "processing":
                return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 w-fit"><Loader2 size={12} className="animate-spin" /> Processando</span>;
            case "cancelled":
                return <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 w-fit"><XCircle size={12} /> Cancelada</span>;
            default:
                return <span className="bg-white/10 text-slate-200 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 w-fit"><Clock size={12} /> Rascunho</span>;
        }
    };

    const displayDate = (inv: Invoice) => inv.data_emissao || inv.created_at;

    const filteredInvoices = invoices.filter((inv) => {
        if (inv.environment !== environment) return false;

        const matchesStatus = statusFilter === "all" || inv.status === statusFilter;

        const invDate = new Date(displayDate(inv));
        let matchesDate = true;
        if (startDate) matchesDate = invDate >= new Date(startDate + "T00:00:00");
        if (endDate && matchesDate) matchesDate = invDate <= new Date(endDate + "T23:59:59");

        const matchesSearch = !searchTerm ||
            (inv.numero || "").includes(searchTerm) ||
            (inv.destinatario_nome || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (inv.tipo_documento || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (inv.chave_acesso || "").includes(searchTerm);

        return matchesStatus && matchesDate && matchesSearch;
    });

    const authorizedInvoices = filteredInvoices.filter((i) => i.status === "authorized");
    const countAuthorized = authorizedInvoices.length;
    const sumAuthorized = authorizedInvoices.reduce((acc, inv) => acc + (inv.valor_total || 0), 0);
    const countError = filteredInvoices.filter((i) => i.status === "error" || i.status === "rejected").length;
    const countPending = filteredInvoices.filter((i) => i.status === "processing" || i.status === "draft").length;

    if (!modules.fiscal) {
        return <ModuleDisabledState storeId={storeId} moduleLabel="Fiscal" />;
    }

    return (
        <div className="space-y-6 pb-32 p-6">
            {/* CABEÇALHO */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <BackButton title="Voltar" fallbackHref={`/dashboard/loja/${storeId}?menu=gerencia`} />
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight uppercase">Fiscal</h1>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Gerencie NFC-e, NF-e e documentos fiscais da loja.</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 backdrop-blur-md shadow-sm">
                        <button
                            onClick={() => setEnvironment("homologation")}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${environment === "homologation" ? "bg-yellow-100 text-yellow-700" : "text-white/60 hover:text-white"}`}
                        >
                            Homologação
                        </button>
                        <button
                            onClick={() => setEnvironment("production")}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${environment === "production" ? "bg-green-100 text-green-700" : "text-white/60 hover:text-white"}`}
                        >
                            Produção
                        </button>
                    </div>

                    <Link href={`/dashboard/loja/${storeId}/fiscal/fechamento`}>
                        <button className="bg-white/5 border border-white/10 hover:border-white/20 text-white/80 px-5 py-2.5 rounded-full font-bold text-sm shadow-sm flex items-center gap-2 transition hover:scale-105">
                            <FileArchive size={18} /> Área Contabilidade
                        </button>
                    </Link>

                    <Link href={`/dashboard/loja/${storeId}/fiscal/emitir?env=${environment}`}>
                        <button className="bg-[#1A1A1A] hover:bg-black text-[#FACC15] px-5 py-2.5 rounded-full font-bold text-sm shadow-lg flex items-center gap-2 transition hover:scale-105">
                            <Plus size={18} /> Nova NFC-e
                        </button>
                    </Link>

                    <Link href={`/dashboard/loja/${storeId}/fiscal/nfe?env=${environment}`}>
                        <button className="bg-amber-500 hover:bg-amber-400 text-white px-5 py-2.5 rounded-full font-bold text-sm shadow-lg flex items-center gap-2 transition hover:scale-105">
                            <FileText size={18} /> Nova NF-e
                        </button>
                    </Link>
                </div>
            </div>

            {/* CARDS RESUMO */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-black/40 p-5 rounded-[20px] border border-white/10 backdrop-blur-md shadow-sm flex items-center gap-4">
                    <div className="w-11 h-11 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 shrink-0"><CheckCircle size={22} /></div>
                    <div className="flex-1">
                        <div className="flex items-baseline justify-between">
                            <p className="text-2xl font-bold text-white">{countAuthorized}</p>
                            <p className="font-bold text-green-400 text-sm">
                                {sumAuthorized.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </p>
                        </div>
                        <p className="text-xs text-white/60 font-bold uppercase">Autorizadas</p>
                    </div>
                </div>
                <div className="bg-black/40 p-5 rounded-[20px] border border-white/10 backdrop-blur-md shadow-sm flex items-center gap-4">
                    <div className="w-11 h-11 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 shrink-0"><AlertCircle size={22} /></div>
                    <div>
                        <p className="text-2xl font-bold text-white">{countError}</p>
                        <p className="text-xs text-white/60 font-bold uppercase">Com Erro / Rejeitadas</p>
                    </div>
                </div>
                <div className="bg-black/40 p-5 rounded-[20px] border border-white/10 backdrop-blur-md shadow-sm flex items-center gap-4">
                    <div className="w-11 h-11 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0"><Clock size={22} /></div>
                    <div>
                        <p className="text-2xl font-bold text-white">{countPending}</p>
                        <p className="text-xs text-white/60 font-bold uppercase">Pendentes</p>
                    </div>
                </div>
            </div>

            {/* TABELA */}
            <div className="bg-black/40 rounded-[28px] border border-white/10 backdrop-blur-md shadow-lg overflow-hidden">
                {/* Filtros */}
                <div className="p-5 border-b border-white/10 flex flex-col gap-3">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <h3 className="font-bold text-white flex items-center gap-2 shrink-0"><FileText size={18} /> Histórico de Emissões</h3>

                        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] text-white font-medium cursor-pointer"
                            >
                                <option value="all">Status: Todos</option>
                                <option value="authorized">Autorizadas</option>
                                <option value="processing">Processando</option>
                                <option value="rejected">Rejeitadas</option>
                                <option value="error">Com Erro</option>
                                <option value="cancelled">Canceladas</option>
                            </select>

                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] text-white"
                                title="Data inicial"
                            />
                            <span className="text-white/40 text-sm">até</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] text-white"
                                title="Data final"
                            />

                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                <input
                                    type="text"
                                    placeholder="Nº, cliente, chave..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-black/20 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] w-48"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[700px]">
                        <thead className="bg-white/5 text-slate-300 text-xs uppercase font-bold">
                            <tr>
                                <th className="px-5 py-4">Nº / Série</th>
                                <th className="px-5 py-4">Tipo</th>
                                <th className="px-5 py-4">Cliente</th>
                                <th className="px-5 py-4">Data</th>
                                <th className="px-5 py-4">Valor</th>
                                <th className="px-5 py-4">Status</th>
                                <th className="px-5 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {loading ? (
                                <tr><td colSpan={7} className="text-center py-12"><Loader2 className="animate-spin mx-auto text-[#FACC15]" size={28} /></td></tr>
                            ) : filteredInvoices.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-12 text-slate-400">
                                    Nenhuma nota encontrada{environment === "homologation" ? " em homologação" : " em produção"}.
                                </td></tr>
                            ) : (
                                filteredInvoices.map((inv) => {
                                    const invDate = new Date(displayDate(inv));
                                    return (
                                        <tr key={inv.id} className="border-b border-white/5 hover:bg-white/5 transition">
                                            <td className="px-5 py-4">
                                                <p className="font-bold text-white">{inv.numero ? `#${inv.numero}` : "S/N"}</p>
                                                <p className="text-xs text-slate-400">Série {inv.serie || "—"}</p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="bg-white/10 text-slate-200 px-2 py-1 rounded text-xs font-bold">{inv.tipo_documento}</span>
                                            </td>
                                            <td className="px-5 py-4 text-slate-200 max-w-[160px]">
                                                <p className="truncate">{inv.destinatario_nome || "—"}</p>
                                            </td>
                                            <td className="px-5 py-4 text-slate-400 whitespace-nowrap">
                                                {invDate.toLocaleDateString("pt-BR")}{" "}
                                                <span className="text-slate-400 text-xs">{invDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                                            </td>
                                            <td className="px-5 py-4 text-slate-200 whitespace-nowrap">
                                                {inv.valor_total != null
                                                    ? inv.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                                                    : "—"}
                                            </td>
                                            <td className="px-5 py-4">
                                                {getStatusBadge(inv.status)}
                                                {(inv.error_message || inv.motivo_rejeicao) && (
                                                    <p className="text-[10px] text-red-400 mt-1 max-w-[180px] truncate" title={inv.motivo_rejeicao || inv.error_message || ""}>
                                                        {inv.motivo_rejeicao || inv.error_message}
                                                    </p>
                                                )}
                                                {inv.status === "authorized" && inv.chave_acesso && (
                                                    <p className="text-[10px] text-slate-400 mt-1 font-mono truncate max-w-[180px]" title={inv.chave_acesso}>
                                                        {inv.chave_acesso.slice(-8)}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex justify-end gap-1.5">
                                                    {/* Imprimir PDF */}
                                                    {(inv.status === "authorized" || inv.status === "cancelled") && (
                                                        <button
                                                            onClick={() => handlePrint(inv.id)}
                                                            className="p-2 bg-white/5 hover:bg-white/10 text-slate-200 rounded-lg transition"
                                                            title="Imprimir DANFE"
                                                        >
                                                            <Printer size={15} />
                                                        </button>
                                                    )}

                                                    {/* Download PDF */}
                                                    {(inv.status === "authorized" || inv.status === "cancelled") && (
                                                        <a
                                                            href={`/api/fiscal/print/${inv.id}?download=true`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-2 bg-white/5 hover:bg-white/10 text-slate-200 rounded-lg transition"
                                                            title="Baixar DANFE (PDF)"
                                                        >
                                                            <Download size={15} />
                                                        </a>
                                                    )}

                                                    {/* WhatsApp */}
                                                    {inv.status === "authorized" && (
                                                        <button
                                                            onClick={() => handleWhatsApp(inv)}
                                                            className="p-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg transition"
                                                            title="Compartilhar no WhatsApp"
                                                        >
                                                            <MessageCircle size={15} />
                                                        </button>
                                                    )}

                                                    {/* Atualizar status (processing/error) */}
                                                    {(inv.status === "processing" || inv.status === "error") && (
                                                        <button
                                                            onClick={() => handleRefreshStatus(inv.id)}
                                                            className={`p-2 rounded-lg transition ${inv.status === "error" ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"}`}
                                                            title={inv.status === "error" ? "Retentar / Ver status" : "Atualizar status"}
                                                        >
                                                            <RefreshCw size={15} />
                                                        </button>
                                                    )}

                                                    {/* Detalhes erro/rejeição */}
                                                    {(inv.status === "error" || inv.status === "rejected") && (
                                                        <button
                                                            onClick={() => alert(`Detalhes:\n\n${inv.motivo_rejeicao || inv.error_message || "Sem detalhes disponíveis."}`)}
                                                            className="p-2 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 rounded-lg transition"
                                                            title="Ver detalhes do erro"
                                                        >
                                                            <AlertCircle size={15} />
                                                        </button>
                                                    )}

                                                    {/* Cancelar (authorized only) */}
                                                    {inv.status === "authorized" && (
                                                        <button
                                                            onClick={() => handleCancelar(inv.id)}
                                                            className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition"
                                                            title={inv.tipo_documento === "NFe" ? "Cancelar NF-e (24h)" : "Cancelar NFC-e (30 min)"}
                                                        >
                                                            <Ban size={15} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
