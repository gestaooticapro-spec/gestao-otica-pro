"use client";

import { useState, useCallback } from "react";
import { getFechamentoData } from "@/lib/actions/fiscal-db.actions";
import { getStoreProfile } from "@/lib/actions/store.actions";
import {
    Download, Loader2, FileArchive, FileText,
    CheckCircle, XCircle, ArrowLeft
} from "lucide-react";
import Link from "next/link";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

type FiscalSummary = {
    autorizadas: number;
    canceladas: number;
    rejeitadas: number;
    valor_total: number;
    xmls: { numero: string | null; chave_acesso: string | null; xml_content: string | null; xml_url: string | null; status: string }[];
};

export default function FechamentoMensalOtica({ params }: { params: { storeId: string } }) {
    const storeId = parseInt(params.storeId);

    const [month, setMonth] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.getMonth();
    });
    const [year, setYear] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.getFullYear();
    });

    const [loading, setLoading] = useState(false);
    const [summary, setSummary] = useState<FiscalSummary | null>(null);
    const [exporting, setExporting] = useState(false);
    const [storeInfo, setStoreInfo] = useState<{ name: string; razao_social: string | null; cnpj: string | null } | null>(null);

    const fetchXmlText = useCallback(async (xmlUrl?: string | null) => {
        if (!xmlUrl) return null;
        try {
            const res = await fetch(xmlUrl);
            if (!res.ok) return null;
            return await res.text();
        } catch {
            return null;
        }
    }, []);

    const fetchSummary = async () => {
        setLoading(true);
        setSummary(null);
        try {
            const [all, profile] = await Promise.all([
                getFechamentoData(storeId, month, year),
                getStoreProfile(storeId),
            ]);
            if (!all) throw new Error("Loja não encontrada.");
            if (profile) {
                setStoreInfo({ name: profile.name, razao_social: profile.razao_social ?? null, cnpj: profile.cnpj ?? null });
            }

            const autorizadas = all.filter(d => d.status === "authorized");
            const canceladas = all.filter(d => d.status === "cancelled");
            const rejeitadas = all.filter(d => d.status === "rejected" || d.status === "error");
            const valorTotal = autorizadas.reduce((sum, d) => sum + (d.valor_total || 0), 0);

            setSummary({
                autorizadas: autorizadas.length,
                canceladas: canceladas.length,
                rejeitadas: rejeitadas.length,
                valor_total: valorTotal,
                xmls: all.map(d => ({
                    numero: d.numero,
                    chave_acesso: d.chave_acesso,
                    xml_content: d.xml_content,
                    xml_url: d.xml_url,
                    status: d.status,
                })),
            });
        } catch (err: any) {
            alert("Erro ao buscar dados: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleExportZip = async () => {
        if (!summary) return;
        setExporting(true);

        try {
            const zip = new JSZip();
            const folderName = `Fechamento_NFCe_${MONTHS[month]}_${year}`;
            const root = zip.folder(folderName)!;

            // CSV de resumo
            const csvRows = [
                ["RELATÓRIO DE FECHAMENTO MENSAL - NFC-e"],
                ["Período", `${MONTHS[month]} / ${year}`],
                ["Nome Fantasia", storeInfo?.name ?? storeId.toString()],
                ["Razão Social", storeInfo?.razao_social ?? ""],
                ["CNPJ", storeInfo?.cnpj ?? ""],
                [""],
                ["RESUMO FISCAL"],
                ["NFC-e Autorizadas", summary.autorizadas.toString()],
                ["NFC-e Canceladas", summary.canceladas.toString()],
                ["NFC-e Rejeitadas/Erro", summary.rejeitadas.toString()],
                ["Valor Total Autorizado", `R$ ${summary.valor_total.toFixed(2).replace(".", ",")}`],
            ];
            root.file("Resumo_Fechamento.csv", "\ufeff" + csvRows.map(r => r.join(";")).join("\n"));

            // PDF de resumo
            const doc = new jsPDF();
            doc.setFontSize(16);
            doc.text("Fechamento Mensal — NFC-e", 14, 20);
            doc.setFontSize(10);
            doc.text(`Período: ${MONTHS[month]} / ${year}`, 14, 30);
            if (storeInfo?.name) doc.text(`Nome Fantasia: ${storeInfo.name}`, 14, 37);
            if (storeInfo?.razao_social) doc.text(`Razão Social: ${storeInfo.razao_social}`, 14, 43);
            if (storeInfo?.cnpj) doc.text(`CNPJ: ${storeInfo.cnpj}`, 14, 49);
            doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, 14, 56);

            autoTable(doc, {
                startY: 66,
                head: [["Movimentação Fiscal (NFC-e)", "Qtd / Valor"]],
                body: [
                    ["NFC-e Autorizadas", `${summary.autorizadas} nota(s)`],
                    ["Valor Total Autorizado", `R$ ${summary.valor_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`],
                    ["NFC-e Canceladas", `${summary.canceladas} nota(s)`],
                    ["NFC-e Rejeitadas / Erro", `${summary.rejeitadas} nota(s)`],
                ],
                styles: { fontSize: 10 },
                headStyles: { fillColor: [26, 26, 26] },
            });

            root.file("Resumo_Fechamento.pdf", doc.output("arraybuffer"));

            // XMLs organizados por status
            const autFolder = root.folder("XMLs_Autorizadas")!;
            const cancelFolder = root.folder("XMLs_Canceladas")!;

            for (const inv of summary.xmls) {
                let xml = inv.xml_content;
                if (!xml && inv.xml_url) xml = await fetchXmlText(inv.xml_url);
                if (!xml) continue;

                const fileName = `${inv.numero || inv.chave_acesso || "doc"}.xml`;
                if (inv.status === "cancelled") {
                    cancelFolder.file(`Cancelado_${fileName}`, xml);
                } else if (inv.status === "authorized") {
                    autFolder.file(fileName, xml);
                }
            }

            const blob = await zip.generateAsync({ type: "blob" });
            saveAs(blob, `${folderName}.zip`);

        } catch (err: any) {
            alert("Erro ao gerar ZIP: " + err.message);
        } finally {
            setExporting(false);
        }
    };

    const years = [2024, 2025, 2026, 2027];

    return (
        <div className="max-w-3xl mx-auto p-6 pb-16">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link href={`/dashboard/loja/${storeId}/fiscal`} className="p-2 hover:bg-stone-100 rounded-lg transition">
                    <ArrowLeft size={20} className="text-stone-500" />
                </Link>
                <div>
                    <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight uppercase">Fechamento para Contador</h1>
                    <p className="text-stone-500 text-xs font-bold uppercase tracking-widest">Exportar XMLs e resumo mensal</p>
                </div>
            </div>

            {/* Seletor de período */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 mb-6">
                <h2 className="font-bold text-stone-700 mb-4 text-sm uppercase tracking-wider">Selecione o período</h2>
                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={month}
                        onChange={e => setMonth(parseInt(e.target.value))}
                        className="border border-stone-300 rounded-xl px-4 py-2 text-sm font-medium text-stone-800 outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] bg-white cursor-pointer"
                    >
                        {MONTHS.map((m, i) => (
                            <option key={i} value={i}>{m}</option>
                        ))}
                    </select>

                    <select
                        value={year}
                        onChange={e => setYear(parseInt(e.target.value))}
                        className="border border-stone-300 rounded-xl px-4 py-2 text-sm font-medium text-stone-800 outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] bg-white cursor-pointer"
                    >
                        {years.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>

                    <button
                        onClick={fetchSummary}
                        disabled={loading}
                        className="bg-[#1A1A1A] hover:bg-black text-[#FACC15] px-5 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition disabled:opacity-60"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                        {loading ? "Buscando..." : "Consultar"}
                    </button>
                </div>

                <p className="text-xs text-stone-400 mt-3">
                    * Considera apenas NFC-e de produção. Homologação é excluída.
                </p>
            </div>

            {/* Resumo */}
            {summary && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 text-center">
                            <CheckCircle size={22} className="text-green-500 mx-auto mb-2" />
                            <p className="text-2xl font-black text-[#1A1A1A]">{summary.autorizadas}</p>
                            <p className="text-xs text-stone-500 font-bold uppercase mt-1">Autorizadas</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 text-center">
                            <XCircle size={22} className="text-gray-400 mx-auto mb-2" />
                            <p className="text-2xl font-black text-[#1A1A1A]">{summary.canceladas}</p>
                            <p className="text-xs text-stone-500 font-bold uppercase mt-1">Canceladas</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 text-center">
                            <XCircle size={22} className="text-red-400 mx-auto mb-2" />
                            <p className="text-2xl font-black text-[#1A1A1A]">{summary.rejeitadas}</p>
                            <p className="text-xs text-stone-500 font-bold uppercase mt-1">Rejeitadas</p>
                        </div>
                        <div className="bg-[#1A1A1A] rounded-2xl p-5 text-center col-span-2 md:col-span-1">
                            <Download size={22} className="text-[#FACC15] mx-auto mb-2" />
                            <p className="text-xl font-black text-white">
                                {summary.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </p>
                            <p className="text-xs text-stone-400 font-bold uppercase mt-1">Total Autorizado</p>
                        </div>
                    </div>

                    {/* Exportar */}
                    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                            <p className="font-bold text-stone-800">Pacote para Contabilidade</p>
                            <p className="text-sm text-stone-500 mt-0.5">
                                ZIP contendo XMLs das NFC-e + resumo em PDF e CSV para {MONTHS[month]}/{year}.
                            </p>
                            <p className="text-xs text-stone-400 mt-1">
                                {summary.xmls.filter(x => x.status === "authorized" || x.status === "cancelled").length} arquivo(s) XML disponíveis.
                            </p>
                        </div>
                        <button
                            onClick={handleExportZip}
                            disabled={exporting || summary.autorizadas + summary.canceladas === 0}
                            className="flex items-center gap-2 bg-stone-900 hover:bg-stone-800 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition disabled:opacity-50 whitespace-nowrap"
                        >
                            {exporting
                                ? <><Loader2 size={16} className="animate-spin" /> Gerando ZIP...</>
                                : <><FileArchive size={16} /> Exportar (.zip)</>
                            }
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
