"use client";

import { useState, useCallback, useEffect, use } from "react";
import { getFechamentoData } from "@/lib/actions/fiscal-db.actions";
import { recuperarXmlsNFCePeriodo, inutilizarNumeracaoFiscal, listarInutilizacoesFiscal } from "@/lib/actions/fiscal.actions";
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
import { useStoreModules } from '@/lib/contexts/StoreModulesContext';
import ModuleDisabledState from '@/components/modules/ModuleDisabledState';

const MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

type FiscalSummary = {
    autorizadas: number;
    canceladas: number;
    rejeitadas: number;
    valor_total: number;
    xmls: {
        numero: string | null;
        chave_acesso: string | null;
        xml_content: string | null;
        xml_url: string | null;
        status: string;
        motivo_rejeicao?: string | null;
        error_message?: string | null;
    }[];
};

type InutilizacaoItem = {
    id: number;
    model?: "NFCe" | "NFe";
    environment: "production" | "homologation";
    year: number;
    serie: number;
    numero_inicial: number;
    numero_final: number;
    justificativa: string;
    protocol: string | null;
    external_id: string | null;
    status: string | null;
    response_json: any;
    created_at: string;
};

const hasXmlSource = (item: { xml_content: string | null; xml_url: string | null }) => {
    return Boolean(item.xml_content || item.xml_url);
};

export default function FechamentoMensalOtica(props: { params: Promise<{ storeId: string }> }) {
    const params = use(props.params);
    const storeId = parseInt(params.storeId);
    const modules = useStoreModules();

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

    const [recovering, setRecovering] = useState(false);
    const [invalidating, setInvalidating] = useState(false);
    const [invalidateModel, setInvalidateModel] = useState<"NFCe" | "NFe">("NFCe");
    const [invalidateEnvironment, setInvalidateEnvironment] = useState<"production" | "homologation">("production");
    const [invalidateSerie, setInvalidateSerie] = useState(2);
    const [invalidateStart, setInvalidateStart] = useState("");
    const [invalidateEnd, setInvalidateEnd] = useState("");
    const [invalidateReason, setInvalidateReason] = useState("Falha operacional no controle de numeração, sem autorização de uso para os números informados.");
    const [storeInfo, setStoreInfo] = useState<{ name: string; razao_social: string | null; cnpj: string | null } | null>(null);
    const [inutilizacoes, setInutilizacoes] = useState<InutilizacaoItem[]>([]);

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

    useEffect(() => {
        let active = true;

        const loadInutilizacoes = async () => {
            const res = await listarInutilizacoesFiscal({
                storeId,
                year,
                model: invalidateModel,
                environment: invalidateEnvironment,
            });

            if (active && res.success) {
                setInutilizacoes((res.data as InutilizacaoItem[]) || []);
            }
        };

        void loadInutilizacoes();

        return () => {
            active = false;
        };
    }, [storeId, year, invalidateModel, invalidateEnvironment]);

    const fetchSummary = async () => {
        setLoading(true);
        setSummary(null);
        try {
            const [all, profile, inutilRes] = await Promise.all([
                getFechamentoData(storeId, month, year),
                getStoreProfile(storeId),
                listarInutilizacoesFiscal({ storeId, year, model: invalidateModel, environment: invalidateEnvironment }),
            ]);
            if (!all) throw new Error("Loja não encontrada.");
            if (profile) {
                setStoreInfo({ name: profile.name, razao_social: profile.razao_social ?? null, cnpj: profile.cnpj ?? null });
            }
            if (inutilRes.success) {
                setInutilizacoes((inutilRes.data as InutilizacaoItem[]) || []);
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
                    motivo_rejeicao: (d as any).motivo_rejeicao ?? null,
                    error_message: (d as any).error_message ?? null,
                })),
            });
        } catch (err: any) {
            alert("Erro ao buscar dados: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const downloadJson = (item: InutilizacaoItem) => {
        const model = item.model || "NFCe";
        const blob = new Blob([JSON.stringify(item.response_json, null, 2)], { type: "application/json;charset=utf-8" });
        saveAs(blob, `Inutilizacao_${model}_S${item.serie}_${item.numero_inicial}-${item.numero_final}_${item.year}.json`);
    };

    const downloadPdf = (item: InutilizacaoItem) => {
        const model = item.model || "NFCe";
        const doc = new jsPDF();
        doc.setFontSize(14);
        doc.text(`Comprovante de Inutilizacao de Numeracao ${model}`, 14, 18);
        doc.setFontSize(10);
        doc.text(`Loja: ${storeInfo?.name || storeId}`, 14, 28);
        doc.text(`CNPJ: ${storeInfo?.cnpj || "-"}`, 14, 34);
        doc.text(`Ambiente: ${item.environment === "production" ? "Producao" : "Homologacao"}`, 14, 40);
        doc.text(`Ano: ${item.year}`, 14, 46);
        doc.text(`Serie: ${item.serie}`, 14, 52);
        doc.text(`Faixa: ${item.numero_inicial} a ${item.numero_final}`, 14, 58);
        doc.text(`Protocolo: ${item.protocol || "-"}`, 14, 64);
        doc.text(`Status: ${item.status || "-"}`, 14, 70);
        doc.text(`Data da solicitacao: ${new Date(item.created_at).toLocaleString("pt-BR")}`, 14, 76);
        autoTable(doc, {
            startY: 84,
            head: [["Campo", "Valor"]],
            body: [
                ["Justificativa", item.justificativa],
                ["ID externo", item.external_id || "-"],
            ],
            styles: { fontSize: 9, cellWidth: "wrap" },
            headStyles: { fillColor: [26, 26, 26] },
        });
        doc.save(`Comprovante_Inutilizacao_${model}_S${item.serie}_${item.numero_inicial}-${item.numero_final}_${item.year}.pdf`);
    };

    const handleExportZip = async () => {
        if (!summary) return;
        setExporting(true);

        try {
            const inutilRes = await listarInutilizacoesFiscal({ storeId, year, model: "NFCe", environment: "production" });
            const inutilizacoesExport = inutilRes.success ? ((inutilRes.data as InutilizacaoItem[]) || []) : [];

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

            // CSV de rejeições para justificar numeração não autorizada
            const rejectedDocs = summary.xmls.filter(x => x.status === "rejected" || x.status === "error");
            const rejectedRows = [
                ["NUMERO", "STATUS", "MOTIVO", "CHAVE_ACESSO"],
                ...rejectedDocs.map(d => [
                    d.numero || "",
                    d.status || "",
                    (d.motivo_rejeicao || d.error_message || "").replace(/\r?\n/g, " "),
                    d.chave_acesso || "",
                ])
            ];
            root.file("Numeracoes_Rejeitadas.csv", "\ufeff" + rejectedRows.map(r => r.join(";")).join("\n"));

            // CSV de inutilizações homologadas/solicitadas para o ano
            const inutilRows = [
                ["AMBIENTE", "ANO", "SERIE", "NUMERO_INICIAL", "NUMERO_FINAL", "PROTOCOLO", "STATUS", "DATA", "JUSTIFICATIVA"],
                ...inutilizacoesExport.map(i => [
                    i.environment === "production" ? "producao" : "homologacao",
                    String(i.year),
                    String(i.serie),
                    String(i.numero_inicial),
                    String(i.numero_final),
                    i.protocol || "",
                    i.status || "",
                    new Date(i.created_at).toLocaleString("pt-BR"),
                    (i.justificativa || "").replace(/\r?\n/g, " "),
                ])
            ];
            root.file("Inutilizacoes_NFCe.csv", "\ufeff" + inutilRows.map(r => r.join(";")).join("\n"));

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

            // Comprovantes técnicos das inutilizações
            if (inutilizacoesExport.length > 0) {
                const inutilFolder = root.folder("Inutilizacoes_Comprovantes")!;
                for (const i of inutilizacoesExport) {
                    const file = `NFCe_S${i.serie}_${i.numero_inicial}-${i.numero_final}_${i.year}.json`;
                    inutilFolder.file(file, JSON.stringify(i.response_json ?? {}, null, 2));
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

    const handleRecoverXmls = async () => {
        setRecovering(true);
        try {
            const res = await recuperarXmlsNFCePeriodo({
                storeId,
                month,
                year,
                environment: "production",
            });

            if (!res.success) {
                alert(`Erro ao recuperar XMLs: ${res.error}`);
                return;
            }

            alert(
                `Recuperação concluída.\n` +
                `Notas no período: ${res.total}\n` +
                `Com XML/URL: ${res.withXml}\n` +
                `Faltando: ${res.missing}\n` +
                `Notas consultadas agora: ${res.refreshed}`
            );

            await fetchSummary();
        } catch (err: any) {
            alert("Erro ao recuperar XMLs: " + err.message);
        } finally {
            setRecovering(false);
        }
    };

    const handleInvalidateNumbers = async () => {
        const start = parseInt(invalidateStart, 10);
        const end = parseInt(invalidateEnd, 10);
        if (!start || !end) {
            alert("Informe número inicial e final para inutilização.");
            return;
        }
        if (end < start) {
            alert("Número final deve ser maior ou igual ao inicial.");
            return;
        }
        if (!invalidateReason || invalidateReason.trim().length < 15) {
            alert("A justificativa deve ter no mínimo 15 caracteres.");
            return;
        }
        const envLabel = invalidateEnvironment === "production" ? "produção" : "homologação";
        if (!confirm(`Confirmar inutilização ${invalidateModel} série ${invalidateSerie}, faixa ${start} a ${end}, ano ${year}, em ${envLabel}?`)) {
            return;
        }

        setInvalidating(true);
        try {
            const res = await inutilizarNumeracaoFiscal({
                storeId,
                year,
                serie: invalidateSerie,
                numeroInicial: start,
                numeroFinal: end,
                justificativa: invalidateReason,
                model: invalidateModel,
                environment: invalidateEnvironment,
            });

            if (!res.success) {
                alert(`Erro na inutilização: ${res.error}`);
                return;
            }

            const protocolo = res.data?.numero_protocolo
                || res.data?.autorizacao?.numero_protocolo
                || String(res.data?.motivo_status || "").match(/nProt:?\s*(\d+)/i)?.[1]
                || "N/A";
            const status = res.data?.status || res.data?.autorizacao?.status || "solicitado";
            alert(`${res.warning || "Inutilização enviada com sucesso."}\nStatus: ${status}\nProtocolo: ${protocolo}`);
            const updated = await listarInutilizacoesFiscal({ storeId, year, model: invalidateModel, environment: invalidateEnvironment });
            if (updated.success) setInutilizacoes((updated.data as InutilizacaoItem[]) || []);
        } catch (err: any) {
            alert("Erro ao inutilizar faixa: " + err.message);
        } finally {
            setInvalidating(false);
        }
    };

    const years = [2024, 2025, 2026, 2027];

    if (!modules.fiscal) {
        return <ModuleDisabledState storeId={storeId} moduleLabel="Fiscal" backHref={`/dashboard/loja/${storeId}/fiscal`} />;
    }

    return (
        <div className="max-w-3xl mx-auto p-6 pb-16">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link href={`/dashboard/loja/${storeId}/fiscal`} className="p-2 hover:bg-white/10 rounded-lg transition">
                    <ArrowLeft size={20} className="text-slate-400" />
                </Link>
                <div>
                    <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight uppercase">Fechamento para Contador</h1>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Exportar XMLs e resumo mensal</p>
                </div>
            </div>

            {/* Seletor de período */}
            <div className="bg-black/40 rounded-2xl border border-white/10 shadow-sm p-6 mb-6">
                <h2 className="font-bold text-slate-200 mb-4 text-sm uppercase tracking-wider">Selecione o período</h2>
                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={month}
                        onChange={e => setMonth(parseInt(e.target.value))}
                        className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-medium text-white outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] cursor-pointer"
                    >
                        {MONTHS.map((m, i) => (
                            <option key={i} value={i}>{m}</option>
                        ))}
                    </select>

                    <select
                        value={year}
                        onChange={e => setYear(parseInt(e.target.value))}
                        className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-medium text-white outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] cursor-pointer"
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

                <p className="text-xs text-slate-500 mt-3">
                    * Considera apenas NFC-e de produção. Homologação é excluída.
                </p>
            </div>

            {/* Resumo */}
            {summary && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-black/40 rounded-2xl border border-white/10 shadow-sm p-5 text-center">
                            <CheckCircle size={22} className="text-green-500 mx-auto mb-2" />
                            <p className="text-2xl font-black text-[#1A1A1A]">{summary.autorizadas}</p>
                            <p className="text-xs text-slate-400 font-bold uppercase mt-1">Autorizadas</p>
                        </div>
                        <div className="bg-black/40 rounded-2xl border border-white/10 shadow-sm p-5 text-center">
                            <XCircle size={22} className="text-gray-400 mx-auto mb-2" />
                            <p className="text-2xl font-black text-[#1A1A1A]">{summary.canceladas}</p>
                            <p className="text-xs text-slate-400 font-bold uppercase mt-1">Canceladas</p>
                        </div>
                        <div className="bg-black/40 rounded-2xl border border-white/10 shadow-sm p-5 text-center">
                            <XCircle size={22} className="text-red-400 mx-auto mb-2" />
                            <p className="text-2xl font-black text-[#1A1A1A]">{summary.rejeitadas}</p>
                            <p className="text-xs text-slate-400 font-bold uppercase mt-1">Rejeitadas</p>
                        </div>
                        <div className="bg-[#1A1A1A] rounded-2xl p-5 text-center col-span-2 md:col-span-1">
                            <Download size={22} className="text-[#FACC15] mx-auto mb-2" />
                            <p className="text-xl font-black text-white">
                                {summary.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </p>
                            <p className="text-xs text-slate-500 font-bold uppercase mt-1">Total Autorizado</p>
                        </div>
                    </div>

                    {/* Exportar */}
                    <div className="bg-black/40 rounded-2xl border border-white/10 shadow-sm p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                            <p className="font-bold text-white">Pacote para Contabilidade</p>
                            <p className="text-sm text-slate-400 mt-0.5">
                                ZIP contendo XMLs das NFC-e + resumo em PDF e CSV para {MONTHS[month]}/{year}.
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                                {(() => {
                                    const expectedXmlCount = summary.autorizadas + summary.canceladas;
                                    const availableXmlCount = summary.xmls.filter(
                                        x => (x.status === "authorized" || x.status === "cancelled") && hasXmlSource(x)
                                    ).length;
                                    const missingXmlCount = Math.max(0, expectedXmlCount - availableXmlCount);

                                    if (missingXmlCount > 0) {
                                        return `${availableXmlCount} XML(s) disponível(is) de ${expectedXmlCount}. Faltando ${missingXmlCount}.`;
                                    }

                                    return `${availableXmlCount} arquivo(s) XML disponível(is).`;
                                })()}
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
                        <button
                            onClick={handleRecoverXmls}
                            disabled={recovering || summary.autorizadas + summary.canceladas === 0}
                            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition disabled:opacity-50 whitespace-nowrap"
                        >
                            {recovering
                                ? <><Loader2 size={16} className="animate-spin" /> Buscando XMLs...</>
                                : <>Buscar XMLs faltantes</>
                            }
                        </button>
                    </div>

                    <div className="bg-black/40 rounded-2xl border border-white/10 shadow-sm p-6 mt-4">
                        <p className="font-bold text-white">Inutilização de numeração</p>
                        <p className="text-xs text-slate-400 mt-1">
                            Automatiza o envio da solicitação para SEFAZ via Nuvem Local no modelo e ambiente escolhidos. Antes do envio, validamos o cadastro/contrato da empresa na Nuvem Local.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
                            <select
                                value={invalidateModel}
                                onChange={e => setInvalidateModel(e.target.value as "NFCe" | "NFe")}
                                className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-medium text-white outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] cursor-pointer"
                            >
                                <option value="NFCe">NFC-e</option>
                                <option value="NFe">NF-e</option>
                            </select>
                            <select
                                value={invalidateEnvironment}
                                onChange={e => setInvalidateEnvironment(e.target.value as "production" | "homologation")}
                                className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-medium text-white outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] cursor-pointer"
                            >
                                <option value="production">Produção</option>
                                <option value="homologation">Homologação</option>
                            </select>
                            <input
                                type="number"
                                value={invalidateSerie}
                                onChange={e => setInvalidateSerie(parseInt(e.target.value || "0", 10))}
                                className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-medium text-white outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] placeholder-slate-400"
                                placeholder="Série"
                                min={1}
                            />
                            <input
                                type="number"
                                value={invalidateStart}
                                onChange={e => setInvalidateStart(e.target.value)}
                                className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-medium text-white outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] placeholder-slate-400"
                                placeholder="Nº inicial"
                                min={1}
                            />
                            <input
                                type="number"
                                value={invalidateEnd}
                                onChange={e => setInvalidateEnd(e.target.value)}
                                className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-medium text-white outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] placeholder-slate-400"
                                placeholder="Nº final"
                                min={1}
                            />
                            <button
                                onClick={handleInvalidateNumbers}
                                disabled={invalidating}
                                className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition disabled:opacity-50 whitespace-nowrap"
                            >
                                {invalidating
                                    ? <><Loader2 size={16} className="animate-spin" /> Enviando...</>
                                    : <>Inutilizar faixa</>
                                }
                            </button>
                        </div>
                        <p className="text-xs mt-2 font-semibold text-amber-700">
                            Modelo atual: {invalidateModel}. Ambiente atual da inutilização: {invalidateEnvironment === "production" ? "Produção" : "Homologação"}.
                        </p>
                        <textarea
                            value={invalidateReason}
                            onChange={e => setInvalidateReason(e.target.value)}
                            rows={3}
                            className="mt-3 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-medium text-white outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] placeholder-slate-400"
                            placeholder="Justificativa (mínimo 15 caracteres)"
                        />
                        <div className="mt-5">
                            <p className="font-semibold text-white text-sm">Comprovantes salvos</p>
                            {inutilizacoes.length === 0 ? (
                                <p className="text-xs text-slate-400 mt-1">Nenhuma inutilização salva de {invalidateModel} para {year} neste ambiente.</p>
                            ) : (
                                <div className="mt-2 space-y-2">
                                    {inutilizacoes.map(item => (
                                        <div key={item.id} className="border border-white/10 rounded-xl p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold text-white">
                                                    {(item.model || invalidateModel)} • Série {item.serie} • Faixa {item.numero_inicial} a {item.numero_final}
                                                </p>
                                                <p className="text-xs text-slate-400">
                                                    Protocolo: {item.protocol || "-"} • Status: {item.status || "-"} • {new Date(item.created_at).toLocaleString("pt-BR")}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => downloadPdf(item)}
                                                    className="bg-stone-900 hover:bg-stone-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                                                >
                                                    Baixar PDF
                                                </button>
                                                <button
                                                    onClick={() => downloadJson(item)}
                                                    className="bg-stone-200 hover:bg-stone-300 text-stone-900 px-3 py-1.5 rounded-lg text-xs font-bold"
                                                >
                                                    Baixar JSON
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
