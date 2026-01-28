"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, AlertCircle } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/src/utils/supabase/client";
import { emitirNFCe, emitirNFSe } from "@/src/actions/fiscal_emission";

export default function CorrigirNotaPage({ params }: { params: { id: string } }) {
    const { profile } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [invoice, setInvoice] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // Form States
    const [clienteNome, setClienteNome] = useState("");
    const [clienteDoc, setClienteDoc] = useState("");
    const [clienteEndereco, setClienteEndereco] = useState<any>({});
    const [itens, setItens] = useState<any[]>([]);

    useEffect(() => {
        if (profile?.organization_id && params.id) {
            loadInvoice();
        }
    }, [profile, params.id]);

    const loadInvoice = async () => {
        setLoading(true);
        const supabase = createClient();

        try {
            const { data, error } = await supabase
                .from('fiscal_invoices')
                .select('*')
                .eq('id', params.id)
                .single();

            if (error) throw error;
            if (!data) throw new Error("Nota não encontrada");

            setInvoice(data);

            // Parse payload to fill form
            const payload = data.payload_json;

            if (data.tipo_documento === 'NFCe') {
                // NFC-e Payload Structure
                const dest = payload.infNFe.dest;
                setClienteNome(dest?.xNome || "Consumidor Final");
                setClienteDoc(dest?.CNPJ || dest?.CPF || "");

                const det = payload.infNFe.det;
                setItens(det.map((d: any) => ({
                    codigo: d.prod.cProd,
                    descricao: d.prod.xProd,
                    ncm: d.prod.NCM,
                    cfop: d.prod.CFOP,
                    unidade: d.prod.uCom,
                    quantidade: d.prod.qCom,
                    valor_unitario: d.prod.vUnCom,
                    valor_total: d.prod.vProd
                })));
            } else {
                // NFS-e Payload Structure (DPS)
                const toma = payload.infDPS.toma;
                setClienteNome(toma.xNome);
                setClienteDoc(toma.CNPJ || toma.CPF || "");

                if (toma.end) {
                    setClienteEndereco({
                        logradouro: toma.end.xLgr,
                        numero: toma.end.nro,
                        bairro: toma.end.xBairro,
                        codigo_municipio: toma.end.endNac.cMun,
                        cep: toma.end.endNac.CEP
                    });
                }

                const serv = payload.infDPS.serv;
                const valores = payload.infDPS.valores;

                // NFS-e usually has one service item in simple implementations
                setItens([{
                    descricao: serv.cServ.xDescServ,
                    codigo_servico: serv.cServ.cTribNac,
                    valor_total: valores.vServPrest.vServ,
                    aliquota_iss: valores.trib.tribMun.pAliq
                }]);
            }

        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResubmit = async () => {
        if (!profile?.organization_id) {
            alert("Erro: Organização não encontrada.");
            return;
        }
        setSubmitting(true);
        try {
            let result;
            const environment = invoice.environment || 'production';

            if (invoice.tipo_documento === 'NFCe') {
                result = await emitirNFCe({
                    organization_id: profile.organization_id,
                    work_order_id: invoice.work_order_id,
                    cliente: { nome: clienteNome, cpf_cnpj: clienteDoc },
                    itens: itens,
                    valor_total: itens.reduce((acc, i) => acc + i.valor_total, 0),
                    meio_pagamento: '01',
                    environment
                });
            } else {
                result = await emitirNFSe({
                    organization_id: profile.organization_id,
                    work_order_id: invoice.work_order_id,
                    cliente: {
                        nome: clienteNome,
                        cpf_cnpj: clienteDoc,
                        endereco: clienteEndereco
                    },
                    itens: itens.map(i => ({
                        codigo: 'SERV',
                        descricao: i.descricao,
                        ncm: '00000000',
                        cfop: '0000',
                        unidade: 'UN',
                        quantidade: 1,
                        valor_unitario: i.valor_total,
                        valor_total: i.valor_total,
                        codigo_servico: i.codigo_servico,
                        aliquota_iss: i.aliquota_iss
                    })),
                    valor_total: itens.reduce((acc, i) => acc + i.valor_total, 0),
                    meio_pagamento: '01',
                    environment
                });
            }

            if (result.success) {
                alert("Nota reemitida com sucesso!");
                router.push('/fiscal');
            } else {
                alert("Erro ao reemitir: " + result.error);
            }

        } catch (e: any) {
            alert("Erro inesperado: " + e.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;
    if (error) return <div className="p-10 text-red-500">Erro: {error}</div>;

    return (
        <div className="max-w-4xl mx-auto pb-20">
            <div className="flex items-center gap-4 mb-8">
                <Link href="/fiscal">
                    <button className="p-2 hover:bg-stone-100 rounded-full transition">
                        <ArrowLeft size={24} className="text-stone-600" />
                    </button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-[#1A1A1A]">Corrigir Nota</h1>
                    <p className="text-stone-500">Edite os dados e tente emitir novamente.</p>
                </div>
            </div>

            <div className="bg-red-50 p-4 rounded-xl border border-red-100 mb-6 flex items-start gap-3">
                <AlertCircle className="text-red-500 shrink-0 mt-1" size={20} />
                <div>
                    <h3 className="font-bold text-red-700">Motivo da Rejeição Anterior:</h3>
                    <p className="text-red-600 text-sm mt-1">{invoice.error_message || "Erro desconhecido"}</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-6">
                {/* DADOS DO CLIENTE */}
                <div>
                    <h3 className="font-bold text-lg mb-4">Dados do Cliente</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-stone-500 mb-1">Nome</label>
                            <input
                                type="text"
                                value={clienteNome}
                                onChange={e => setClienteNome(e.target.value)}
                                className="w-full bg-stone-50 rounded-lg p-2 border border-stone-200"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-stone-500 mb-1">CPF/CNPJ</label>
                            <input
                                type="text"
                                value={clienteDoc}
                                onChange={e => setClienteDoc(e.target.value)}
                                className="w-full bg-stone-50 rounded-lg p-2 border border-stone-200"
                            />
                        </div>
                    </div>

                    {invoice.tipo_documento === 'NFSe' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                            <div>
                                <label className="block text-xs font-bold text-stone-500 mb-1">CEP</label>
                                <input
                                    type="text"
                                    value={clienteEndereco.cep || ''}
                                    onChange={e => setClienteEndereco({ ...clienteEndereco, cep: e.target.value })}
                                    className="w-full bg-stone-50 rounded-lg p-2 border border-stone-200"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-stone-500 mb-1">Logradouro</label>
                                <input
                                    type="text"
                                    value={clienteEndereco.logradouro || ''}
                                    onChange={e => setClienteEndereco({ ...clienteEndereco, logradouro: e.target.value })}
                                    className="w-full bg-stone-50 rounded-lg p-2 border border-stone-200"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-stone-500 mb-1">Número</label>
                                <input
                                    type="text"
                                    value={clienteEndereco.numero || ''}
                                    onChange={e => setClienteEndereco({ ...clienteEndereco, numero: e.target.value })}
                                    className="w-full bg-stone-50 rounded-lg p-2 border border-stone-200"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-stone-500 mb-1">Bairro</label>
                                <input
                                    type="text"
                                    value={clienteEndereco.bairro || ''}
                                    onChange={e => setClienteEndereco({ ...clienteEndereco, bairro: e.target.value })}
                                    className="w-full bg-stone-50 rounded-lg p-2 border border-stone-200"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-stone-500 mb-1">Cód. Município (IBGE)</label>
                                <input
                                    type="text"
                                    value={clienteEndereco.codigo_municipio || ''}
                                    onChange={e => setClienteEndereco({ ...clienteEndereco, codigo_municipio: e.target.value })}
                                    className="w-full bg-stone-50 rounded-lg p-2 border border-stone-200"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="border-t border-stone-100 my-6"></div>

                {/* ITENS */}
                <div>
                    <h3 className="font-bold text-lg mb-4">Itens / Serviços</h3>
                    {itens.map((item, idx) => (
                        <div key={idx} className="bg-stone-50 p-4 rounded-xl mb-3 border border-stone-100">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-stone-500 mb-1">Descrição</label>
                                    <input
                                        type="text"
                                        value={item.descricao}
                                        onChange={e => {
                                            const newItens = [...itens];
                                            newItens[idx].descricao = e.target.value;
                                            setItens(newItens);
                                        }}
                                        className="w-full bg-white rounded-lg p-2 border border-stone-200"
                                    />
                                </div>
                                {invoice.tipo_documento === 'NFCe' ? (
                                    <div>
                                        <label className="block text-xs font-bold text-stone-500 mb-1">NCM</label>
                                        <input
                                            type="text"
                                            value={item.ncm}
                                            onChange={e => {
                                                const newItens = [...itens];
                                                newItens[idx].ncm = e.target.value;
                                                setItens(newItens);
                                            }}
                                            className="w-full bg-white rounded-lg p-2 border border-stone-200"
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-xs font-bold text-stone-500 mb-1">Cód. Serviço (LC 116)</label>
                                        <input
                                            type="text"
                                            value={item.codigo_servico}
                                            onChange={e => {
                                                const newItens = [...itens];
                                                newItens[idx].codigo_servico = e.target.value;
                                                setItens(newItens);
                                            }}
                                            className="w-full bg-white rounded-lg p-2 border border-stone-200"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-end pt-6">
                    <button
                        onClick={handleResubmit}
                        disabled={submitting}
                        className="bg-[#1A1A1A] text-[#FACC15] px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:scale-105 transition disabled:opacity-50"
                    >
                        {submitting ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                        Reemitir Nota
                    </button>
                </div>
            </div>
        </div>
    );
}
