"use client";

import { useEffect, useState, use } from "react";
import { emitirNFCe } from "@/lib/actions/fiscal.actions";
import { getPendingSales, searchProducts, getProductFiscalData, getSaleData, getTenantIdByStore } from "@/lib/actions/fiscal-db.actions";
import {
    ArrowLeft, FileText, Loader2, CheckCircle,
    ShoppingCart, User, Trash2, Plus, MapPin, Search, X
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useStoreModules } from '@/lib/contexts/StoreModulesContext';
import ModuleDisabledState from '@/components/modules/ModuleDisabledState';

// Tipos
type PendingSale = {
    id: number;
    client_id: number;
    created_at: string;
    total: number;
    status: string;
    clients: { nome: string; cpf_cnpj?: string } | null;
};

type InvoiceItem = {
    codigo: string;
    descricao: string;
    ncm: string;
    cfop: string;
    unidade: string;
    quantidade: number;
    valor_unitario: number;
    valor_total: number;
    tipo_origem: 'peca' | 'avulso';
};

export default function EmitirNotaPage(props: { params: Promise<{ storeId: string }> }) {
    const params = use(props.params);
    const storeId = parseInt(params.storeId);
    const router = useRouter();
    const searchParams = useSearchParams();
    const modules = useStoreModules();
    const environment = (searchParams.get('env') as 'production' | 'homologation') || 'production';

    // Estados
    const [step, setStep] = useState<1 | 2>(1);
    const [loadingSales, setLoadingSales] = useState(true);
    const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
    const [selectedSale, setSelectedSale] = useState<PendingSale | null>(null);

    // Formulário de Emissão
    const [clienteNome, setClienteNome] = useState("");
    const [clienteDoc, setClienteDoc] = useState("");
    const [itens, setItens] = useState<InvoiceItem[]>([]);
    const [emitting, setEmitting] = useState(false);
    const [focusedField, setFocusedField] = useState<{ type: 'prod', idx: number } | null>(null);

    // Carga Inicial
    useEffect(() => {
        if (storeId && modules.fiscal) {
            loadPendingSales();
        }
    }, [storeId, modules.fiscal, environment]);

    const loadPendingSales = async () => {
        setLoadingSales(true);
        try {
            const data = await getPendingSales(storeId, environment);
            setPendingSales(data as unknown as PendingSale[]);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingSales(false);
        }
    };

    if (!modules.fiscal) {
        return <ModuleDisabledState storeId={storeId} moduleLabel="Fiscal" backHref={`/dashboard/loja/${storeId}/fiscal`} />;
    }

    const handleSelectSale = async (sale: PendingSale) => {
        setSelectedSale(sale);
        setClienteNome(sale.clients?.nome || "");
        setClienteDoc(sale.clients?.cpf_cnpj || "");

        // Buscar itens da Venda
        const saleData = await getSaleData(sale.id);

        if (saleData && saleData.venda_itens) {
            const produtos: InvoiceItem[] = [];

            // Processar itens em paralelo para buscar dados fiscais atualizados
            await Promise.all(saleData.venda_itens.map(async (item: any) => {
                let fiscalData = { ncm: '00000000', cfop: '5102', unidade: 'UN' };

                if (item.product_id) {
                    const dbData = await getProductFiscalData(item.product_id);
                    if (dbData) {
                        fiscalData = {
                            ncm: dbData.ncm || '00000000',
                            cfop: dbData.cfop || '5102',
                            unidade: dbData.unidade || 'UN'
                        };
                    }
                }

                produtos.push({
                    codigo: item.product_id ? String(item.product_id) : 'GEN',
                    descricao: item.descricao || "Produto sem nome",
                    ncm: fiscalData.ncm,
                    cfop: fiscalData.cfop,
                    unidade: fiscalData.unidade,
                    quantidade: item.quantidade,
                    valor_unitario: item.valor_unitario,
                    valor_total: item.valor_total_item,
                    tipo_origem: 'peca'
                });
            }));

            setItens(produtos);
        }

        setStep(2);
    };

    const handleAvulsa = () => {
        setSelectedSale(null);
        setClienteNome("");
        setClienteDoc("");
        setItens([{
            codigo: "AVULSO",
            descricao: "",
            ncm: "",
            cfop: "5102",
            unidade: "UN",
            quantidade: 1,
            valor_unitario: 0,
            valor_total: 0,
            tipo_origem: 'avulso'
        }]);
        setStep(2);
    };

    const handleEmitir = async () => {
        if (itens.length === 0) return alert("Adicione pelo menos um item.");
        // if (!clienteNome) return alert("Informe o nome do cliente."); // NFC-e pode ser sem cliente (consumidor não identificado) se < valor limite

        setEmitting(true);
        try {
            const totalProdutos = itens.reduce((acc, item) => acc + item.valor_total, 0);

            // Buscar tenant_id (organization_id)
            const tenantId = await getTenantIdByStore(storeId);
            if (!tenantId) throw new Error("Organização não encontrada para esta loja.");

            const resNFCe = await emitirNFCe({
                organization_id: tenantId,
                store_id: storeId, // Necessário para buscar a série NFCe da loja
                work_order_id: selectedSale?.id, // Mapeado para work_order_id no banco, mas é venda_id
                cliente: { nome: clienteNome || "CONSUMIDOR FINAL", cpf_cnpj: clienteDoc },
                itens: itens,
                valor_total: totalProdutos,
                pagamentos: [{ meio: '01', valor: totalProdutos }], // Dinheiro por padrão na emissão avulsa
                environment
            });

            if (resNFCe.success) {
                alert("Emissão realizada com sucesso!");
                router.push(`/dashboard/loja/${storeId}/fiscal`);
            } else {
                alert(`Erro na emissão: ${resNFCe.error}`);
            }

        } catch (e: any) {
            alert("Erro: " + e.message);
        } finally {
            setEmitting(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto pb-16 p-6">

            {/* HEADER */}
            <div className="flex items-center gap-3 mb-6">
                <Link href={`/dashboard/loja/${storeId}/fiscal`}>
                    <button className="w-8 h-8 bg-black/40 rounded-full flex items-center justify-center shadow-sm hover:bg-white/5 text-slate-300"><ArrowLeft size={16} /></button>
                </Link>
                <div>
                    <h1 className="text-xl font-bold text-[#1A1A1A]">Nova Emissão Fiscal</h1>
                    <p className="text-slate-500 text-xs">NFC-e (Consumidor)</p>
                </div>
            </div>

            {/* STEP 1: SELEÇÃO */}
            {step === 1 && (
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-sm text-[#1A1A1A] flex items-center gap-2"><FileText size={16} /> Importar Venda Pendente</h3>
                        <button onClick={handleAvulsa} className="text-xs font-bold text-[#FACC15] bg-[#1A1A1A] px-3 py-1.5 rounded-full hover:scale-105 transition">
                            Criar Nota Avulsa
                        </button>
                    </div>

                    {loadingSales ? (
                        <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-[#FACC15]" size={20} /></div>
                    ) : pendingSales.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 text-sm">
                            <CheckCircle size={28} className="mx-auto mb-2 text-green-200" />
                            <p>Nenhuma venda pendente de nota.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {pendingSales.map(sale => (
                                <div key={sale.id} className="border border-white/5 p-3 rounded-xl flex justify-between items-center hover:bg-[#F9F8F4] transition cursor-pointer" onClick={() => handleSelectSale(sale)}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-slate-400 font-bold text-[10px]">#{sale.id}</div>
                                        <div>
                                            <p className="font-bold text-xs text-[#1A1A1A]">{sale.clients?.nome || "Consumidor"}</p>
                                            <p className="text-[10px] text-slate-400">{new Date(sale.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-xs text-[#1A1A1A]">R$ {sale.total.toFixed(2)}</p>
                                        <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">{sale.status}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* STEP 2: CONFERÊNCIA E EMISSÃO */}
            {step === 2 && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

                    {/* FORMULÁRIO (ESQUERDA - 3 colunas) */}
                    <div className="lg:col-span-3 space-y-4">

                        {/* DADOS CLIENTE */}
                        <div className="bg-black/40 p-4 rounded-2xl border border-white/5 shadow-sm">
                            <h3 className="font-bold text-sm text-[#1A1A1A] mb-3 flex items-center gap-2"><User size={14} /> Destinatário</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 ml-1">NOME</label>
                                    <input value={clienteNome} onChange={e => setClienteNome(e.target.value)} className="w-full bg-[#F8F7F2] p-2 rounded-lg text-sm font-medium outline-none" placeholder="Consumidor Final" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 ml-1">CPF / CNPJ</label>
                                    <input value={clienteDoc} onChange={e => setClienteDoc(e.target.value)} className="w-full bg-[#F8F7F2] p-2 rounded-lg text-sm font-medium outline-none" placeholder="000.000.000-00" />
                                </div>
                            </div>
                        </div>

                        {/* PRODUTOS (NFC-e) */}
                        <div className="bg-black/40 p-4 rounded-2xl border border-white/5 shadow-sm">
                            <h3 className="font-bold text-sm text-[#1A1A1A] mb-3 flex items-center gap-2"><ShoppingCart size={14} /> Produtos</h3>
                            <div className="space-y-2">
                                {itens.map((item, idx) => (
                                    <div key={idx} className="bg-[#F8F7F2] p-2 rounded-xl">
                                        <div className="grid grid-cols-12 gap-2 items-center">
                                            <div className="col-span-4 relative group">
                                                {/* Combobox de Produto */}
                                                <input
                                                    value={item.descricao}
                                                    onChange={async e => {
                                                        const val = e.target.value;
                                                        const newItens = [...itens];
                                                        newItens[idx].descricao = val;
                                                        setItens(newItens);
                                                    }}
                                                    className="w-full bg-black/40 p-1.5 rounded-lg text-xs font-medium outline-none border border-transparent focus:border-[#FACC15]"
                                                    placeholder="Buscar Produto..."
                                                    onFocus={() => setFocusedField({ type: 'prod', idx })}
                                                    onBlur={() => setTimeout(() => setFocusedField(null), 200)}
                                                />

                                                {/* Botão de Busca Rápida (Simulação de Dropdown Customizado) */}
                                                {focusedField?.type === 'prod' && focusedField?.idx === idx && (
                                                    <div className="absolute top-full left-0 w-full bg-black/40 shadow-xl rounded-lg z-[100] max-h-48 overflow-y-auto border border-white/5">
                                                        <ProductSearch
                                                            query={item.descricao}
                                                            onSelect={(prod) => {
                                                                const newItens = [...itens];
                                                                newItens[idx].codigo = String(prod.id);
                                                                newItens[idx].descricao = prod.nome;
                                                                newItens[idx].ncm = prod.ncm || '00000000';
                                                                newItens[idx].cfop = prod.cfop || '5102';
                                                                newItens[idx].unidade = prod.unidade || 'UN';
                                                                newItens[idx].valor_unitario = prod.preco_venda;
                                                                newItens[idx].valor_total = prod.preco_venda * newItens[idx].quantidade;
                                                                setItens(newItens);
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="col-span-2">
                                                <input value={item.ncm} onChange={e => {
                                                    const newItens = [...itens]; newItens[idx].ncm = e.target.value; setItens(newItens);
                                                }} className="w-full bg-black/40 p-1.5 rounded-lg text-xs font-medium outline-none text-center" placeholder="NCM" />
                                            </div>
                                            <div className="col-span-1">
                                                <input type="number" value={item.quantidade} onChange={e => {
                                                    const qtd = Number(e.target.value);
                                                    const newItens = [...itens];
                                                    newItens[idx].quantidade = qtd;
                                                    newItens[idx].valor_total = qtd * newItens[idx].valor_unitario;
                                                    setItens(newItens);
                                                }} className="w-full bg-black/40 p-1.5 rounded-lg text-xs font-medium outline-none text-center" placeholder="Qtd" />
                                            </div>
                                            <div className="col-span-2">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={item.valor_unitario}
                                                    onChange={e => {
                                                        const val = Number(e.target.value);
                                                        const newItens = [...itens];
                                                        newItens[idx].valor_unitario = val;
                                                        newItens[idx].valor_total = val * newItens[idx].quantidade;
                                                        setItens(newItens);
                                                    }}
                                                    className="w-full bg-black/40 p-1.5 rounded-lg text-xs font-medium outline-none text-right"
                                                    placeholder="Valor Unit."
                                                />
                                            </div>
                                            <div className="col-span-1">
                                                <div className="bg-white/10 p-1.5 rounded-lg text-xs font-bold text-right">R$ {item.valor_total.toFixed(2)}</div>
                                            </div>
                                            <div className="col-span-2 flex justify-end">
                                                <button onClick={() => {
                                                    const newItens = itens.filter((_, i) => i !== idx); setItens(newItens);
                                                }} className="p-1.5 text-slate-500 hover:text-red-500 transition"><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <button onClick={() => setItens([...itens, { codigo: 'NEW', descricao: '', ncm: '', cfop: '5102', unidade: 'UN', quantidade: 1, valor_unitario: 0, valor_total: 0, tipo_origem: 'avulso' }])} className="w-full py-2 border-2 border-dashed border-white/10 rounded-xl text-slate-500 text-xs font-bold hover:bg-white/5 transition flex items-center justify-center gap-1">
                                    <Plus size={14} /> Adicionar Produto
                                </button>
                            </div>
                        </div>

                    </div>

                    {/* RESUMO (DIREITA - 1 coluna) */}
                    <div className="lg:col-span-1">
                        <div className="bg-[#1A1A1A] text-[#FACC15] p-4 rounded-2xl shadow-lg sticky top-4">
                            <h3 className="font-bold text-sm mb-4">Resumo da Emissão</h3>

                            <div className="space-y-2 mb-4 text-xs">
                                <div className="flex justify-between opacity-80">
                                    <span>Produtos</span>
                                    <span>{itens.length}</span>
                                </div>
                                <div className="flex justify-between font-bold text-lg pt-2 border-t border-white/10">
                                    <span>TOTAL</span>
                                    <span>R$ {itens.reduce((acc, i) => acc + i.valor_total, 0).toFixed(2)}</span>
                                </div>
                            </div>

                            <button
                                onClick={handleEmitir}
                                disabled={emitting}
                                className="w-full bg-[#FACC15] text-[#1A1A1A] py-3 rounded-xl font-bold text-sm hover:bg-black/40 transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {emitting ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                                {emitting ? "Emitindo..." : "Emitir NFC-e"}
                            </button>

                            <p className="text-[9px] text-center mt-3 opacity-50">
                                {environment === 'production'
                                    ? "Ambiente de Produção (VALOR FISCAL)"
                                    : "Ambiente de Homologação (Sem valor fiscal)"}
                            </p>
                        </div>
                    </div>

                </div>
            )
            }

        </div >
    );
}

// Componentes Auxiliares de Busca
function ProductSearch({ query, onSelect }: { query: string, onSelect: (prod: any) => void }) {
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!query || query.length < 2) { setResults([]); return; }
            setLoading(true);
            const data = await searchProducts(query);
            setResults(data || []);
            setLoading(false);
        }, 500);
        return () => clearTimeout(timer);
    }, [query]);

    if (!query || query.length < 2) return null;

    return (
        <div className="p-2">
            {loading && <div className="flex items-center gap-2 p-2 text-slate-500 text-xs"><Loader2 size={14} className="animate-spin" /> Buscando...</div>}
            {!loading && (
                <div className="space-y-1">
                    {results.map(prod => (
                        <div
                            key={prod.id}
                            onMouseDown={(e) => { e.preventDefault(); onSelect(prod); }}
                            className="p-2 hover:bg-white/10 rounded-lg cursor-pointer text-xs"
                        >
                            <p className="font-bold text-[#1A1A1A]">{prod.nome}</p>
                            <div className="flex justify-between text-[10px] text-slate-400">
                                <span>R$ {prod.preco_venda?.toFixed(2)}</span>
                            </div>
                        </div>
                    ))}
                    {results.length === 0 && (
                        <p className="text-[10px] text-center text-slate-500 py-2">Nenhum produto encontrado.</p>
                    )}
                </div>
            )}
        </div>
    );
}
