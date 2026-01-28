"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";

import { emitirNFCe, emitirNFSe } from "@/src/actions/fiscal_emission";
import {
    ArrowLeft, FileText, Loader2, CheckCircle,
    ShoppingCart, Wrench, User, Trash2, Plus, MapPin, Search, X
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getPendingWorkOrders, searchProducts, searchServices, getProductFiscalData, getServiceFiscalData } from "@/src/actions/fiscal_db";

// Tipos
type PendingOS = {
    id: number;
    client_id: string;
    created_at: string;
    total: number;
    status: string;
    clients: { nome: string; cpf_cnpj?: string } | null;
    vehicles: { placa: string; modelo: string } | null;
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
    tipo_origem: 'peca' | 'servico' | 'avulso';
};

export default function EmitirNotaPage() {
    const { profile } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const environment = (searchParams.get('env') as 'production' | 'homologation') || 'production';

    // Estados
    const [step, setStep] = useState<1 | 2>(1);
    const [loadingOS, setLoadingOS] = useState(true);
    const [pendingOS, setPendingOS] = useState<PendingOS[]>([]);
    const [selectedOS, setSelectedOS] = useState<PendingOS | null>(null);

    // Formulário de Emissão
    const [clienteNome, setClienteNome] = useState("JAIME RODRIGUES JUNIOR");
    const [clienteDoc, setClienteDoc] = useState("58212043134");
    const [clienteEndereco, setClienteEndereco] = useState<any>({
        cep: "85980000",
        logradouro: "AV. MATE LARANJEIRA",
        numero: "424",
        bairro: "CENTRO",
        cidade: "GUAIRA",
        uf: "PR",
        codigo_municipio: "4108809"
    });
    const [itens, setItens] = useState<InvoiceItem[]>([{
        codigo: "TESTE",
        descricao: "Lampada h7",
        ncm: "85392110",
        cfop: "5102",
        unidade: "UN",
        quantidade: 1,
        valor_unitario: 12.00,
        valor_total: 12.00,
        tipo_origem: 'avulso'
    }]);
    const [itensServico, setItensServico] = useState<any[]>([{
        product_id: "SERV_TESTE",
        name: "Serviço",
        quantity: 1,
        unit_price: 80.00,
        total_price: 80.00,
        codigo_servico: "14.01",
        aliquota_iss: 0
    }]);
    const [emitting, setEmitting] = useState(false);
    const [focusedField, setFocusedField] = useState<{ type: 'prod' | 'serv', idx: number } | null>(null);


    // Carga Inicial
    useEffect(() => {
        if (profile?.organization_id) {
            loadPendingOS();
        }
    }, [profile]);

    const loadPendingOS = async () => {
        setLoadingOS(true);
        try {
            if (profile?.organization_id) {
                const data = await getPendingWorkOrders(profile.organization_id);
                setPendingOS(data as unknown as PendingOS[]);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingOS(false);
        }
    };

    const handleSelectOS = async (os: PendingOS) => {
        setSelectedOS(os);
        setClienteNome(os.clients?.nome || "");
        setClienteDoc(os.clients?.cpf_cnpj || "");

        // Buscar endereço completo do cliente
        if (os.client_id) {
            const { createClient } = await import("@/src/lib/supabase");
            const supabase = createClient();
            const { data: clientData } = await supabase
                .from('clients')
                .select('cep, logradouro, numero, bairro, cidade, uf, codigo_municipio')
                .eq('id', os.client_id)
                .single();

            if (clientData) {
                setClienteEndereco({
                    logradouro: clientData.logradouro || "",
                    numero: clientData.numero || "",
                    bairro: clientData.bairro || "",
                    cidade: clientData.cidade || "",
                    uf: clientData.uf || "",
                    codigo_municipio: clientData.codigo_municipio || "",
                    cep: clientData.cep || ""
                });
            }
        }

        // Buscar itens da OS
        const { createClient } = await import("@/src/lib/supabase");
        const supabase = createClient();
        const { data: osItems } = await supabase
            .from('work_order_items')
            .select('*')
            .eq('work_order_id', os.id);

        if (osItems) {
            const pecas: InvoiceItem[] = [];
            const servicos: any[] = [];

            // Processar itens em paralelo para buscar dados fiscais atualizados
            await Promise.all(osItems.map(async (item: any) => {
                if (item.tipo === 'peca') {
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

                    pecas.push({
                        codigo: item.product_id || 'GEN',
                        descricao: item.name,
                        ncm: fiscalData.ncm,
                        cfop: fiscalData.cfop,
                        unidade: fiscalData.unidade,
                        quantidade: item.quantity,
                        valor_unitario: item.unit_price,
                        valor_total: item.total_price,
                        tipo_origem: 'peca'
                    });
                } else {
                    // Para serviços, buscar código e alíquota
                    let fiscalData = { codigo_servico: '14.01', aliquota_iss: 0 };
                    if (item.product_id) { // product_id aqui é o ID do serviço na tabela services
                        const dbData = await getServiceFiscalData(item.product_id);
                        if (dbData) {
                            fiscalData = {
                                codigo_servico: dbData.codigo_servico || '14.01',
                                aliquota_iss: dbData.aliquota_iss || 0
                            };
                        }
                    }

                    servicos.push({
                        ...item,
                        codigo_servico: fiscalData.codigo_servico,
                        aliquota_iss: fiscalData.aliquota_iss
                    });
                }
            }));

            setItens(pecas);
            setItensServico(servicos);
        }

        setStep(2);
    };

    const handleAvulsa = () => {
        setSelectedOS(null);
        // Mantém os dados preenchidos para teste
        setStep(2);
    };

    const handleEmitir = async () => {
        if (!profile?.organization_id) return;
        if (itens.length === 0 && itensServico.length === 0) return alert("Adicione pelo menos um item ou serviço.");

        setEmitting(true);
        try {
            const results = [];

            // 1. Emissão de NFC-e (Produtos)
            if (itens.length > 0) {
                const totalProdutos = itens.reduce((acc, item) => acc + item.valor_total, 0);
                const resNFCe = await emitirNFCe({
                    organization_id: profile.organization_id,
                    work_order_id: selectedOS?.id,
                    cliente: { nome: clienteNome, cpf_cnpj: clienteDoc },
                    itens: itens,
                    valor_total: totalProdutos,
                    meio_pagamento: '01',
                    environment
                });
                results.push({ type: 'NFC-e', ...resNFCe });
            }

            // 2. Emissão de NFS-e (Serviços)
            if (itensServico.length > 0) {
                const totalServicos = itensServico.reduce((acc, item) => acc + item.total_price, 0);
                const servicosPayload = itensServico.map(s => ({
                    codigo: s.product_id || 'SERV',
                    descricao: s.name,
                    ncm: '00000000',
                    cfop: '0000',
                    unidade: 'UN',
                    quantidade: s.quantity,
                    valor_unitario: s.unit_price,
                    valor_total: s.total_price
                }));

                const resNFSe = await emitirNFSe({
                    organization_id: profile.organization_id,
                    work_order_id: selectedOS?.id,
                    cliente: {
                        nome: clienteNome,
                        cpf_cnpj: clienteDoc,
                        endereco: clienteEndereco.logradouro ? clienteEndereco : {
                            logradouro: "RUA TESTE",
                            numero: "123",
                            bairro: "CENTRO",
                            codigo_municipio: "4108809",
                            cep: "85980000"
                        }
                    },
                    itens: servicosPayload,
                    valor_total: totalServicos,
                    meio_pagamento: '01',
                    environment
                });
                results.push({ type: 'NFS-e', ...resNFSe });
            }

            const errors = results.filter(r => !r.success);
            if (errors.length > 0) {
                alert(`Erro na emissão:\n${errors.map(e => `${e.type}: ${e.error}`).join('\n')}`);
            } else {
                alert("Emissão realizada com sucesso!");
                router.push("/fiscal");
            }

        } catch (e: any) {
            alert("Erro: " + e.message);
        } finally {
            setEmitting(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto pb-16">

            {/* HEADER */}
            <div className="flex items-center gap-3 mb-6">
                <Link href="/fiscal">
                    <button className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm hover:bg-stone-50 text-stone-600"><ArrowLeft size={16} /></button>
                </Link>
                <div>
                    <h1 className="text-xl font-bold text-[#1A1A1A]">Nova Emissão Fiscal</h1>
                    <p className="text-stone-400 text-xs">NFC-e (Consumidor) / NFS-e (Serviços)</p>
                </div>
            </div>

            {/* STEP 1: SELEÇÃO */}
            {step === 1 && (
                <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-sm text-[#1A1A1A] flex items-center gap-2"><FileText size={16} /> Importar Ordem de Serviço</h3>
                        <button onClick={handleAvulsa} className="text-xs font-bold text-[#FACC15] bg-[#1A1A1A] px-3 py-1.5 rounded-full hover:scale-105 transition">
                            Criar Nota Avulsa
                        </button>
                    </div>

                    {loadingOS ? (
                        <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-[#FACC15]" size={20} /></div>
                    ) : pendingOS.length === 0 ? (
                        <div className="text-center py-8 text-stone-400 text-sm">
                            <CheckCircle size={28} className="mx-auto mb-2 text-green-200" />
                            <p>Nenhuma OS pendente de nota.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {pendingOS.map(os => (
                                <div key={os.id} className="border border-stone-100 p-3 rounded-xl flex justify-between items-center hover:bg-[#F9F8F4] transition cursor-pointer" onClick={() => handleSelectOS(os)}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center text-stone-500 font-bold text-[10px]">#{os.id}</div>
                                        <div>
                                            <p className="font-bold text-xs text-[#1A1A1A]">{os.vehicles?.modelo} - {os.vehicles?.placa}</p>
                                            <p className="text-[10px] text-stone-500">{os.clients?.nome}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-xs text-[#1A1A1A]">R$ {os.total.toFixed(2)}</p>
                                        <p className="text-[10px] text-stone-400">{new Date(os.created_at).toLocaleDateString()}</p>
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

                        {/* DADOS CLIENTE + ENDEREÇO */}
                        <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm">
                            <h3 className="font-bold text-sm text-[#1A1A1A] mb-3 flex items-center gap-2"><User size={14} /> Destinatário</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-bold text-stone-400 ml-1">NOME</label>
                                    <input value={clienteNome} onChange={e => setClienteNome(e.target.value)} className="w-full bg-[#F8F7F2] p-2 rounded-lg text-sm font-medium outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-stone-400 ml-1">CPF / CNPJ</label>
                                    <input value={clienteDoc} onChange={e => setClienteDoc(e.target.value)} className="w-full bg-[#F8F7F2] p-2 rounded-lg text-sm font-medium outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-stone-400 ml-1">CEP</label>
                                    <input value={clienteEndereco?.cep || ""} onChange={e => setClienteEndereco({ ...clienteEndereco, cep: e.target.value })} className="w-full bg-[#F8F7F2] p-2 rounded-lg text-sm font-medium outline-none" placeholder="00000-000" />
                                </div>
                            </div>

                            {/* Endereço Completo */}
                            <div className="mt-3 pt-3 border-t border-stone-50">
                                <h4 className="text-[10px] font-bold text-stone-400 mb-2 ml-1 flex items-center gap-1"><MapPin size={10} /> ENDEREÇO (Obrigatório para NFS-e)</h4>
                                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                                    <div className="md:col-span-3">
                                        <label className="text-[10px] font-bold text-stone-400 ml-1">LOGRADOURO</label>
                                        <input value={clienteEndereco?.logradouro || ""} onChange={e => setClienteEndereco({ ...clienteEndereco, logradouro: e.target.value })} className="w-full bg-[#F8F7F2] p-2 rounded-lg text-sm font-medium outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-stone-400 ml-1">Nº</label>
                                        <input value={clienteEndereco?.numero || ""} onChange={e => setClienteEndereco({ ...clienteEndereco, numero: e.target.value })} className="w-full bg-[#F8F7F2] p-2 rounded-lg text-sm font-medium outline-none" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-stone-400 ml-1">BAIRRO</label>
                                        <input value={clienteEndereco?.bairro || ""} onChange={e => setClienteEndereco({ ...clienteEndereco, bairro: e.target.value })} className="w-full bg-[#F8F7F2] p-2 rounded-lg text-sm font-medium outline-none" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-stone-400 ml-1">CIDADE</label>
                                        <input value={clienteEndereco?.cidade || ""} onChange={e => setClienteEndereco({ ...clienteEndereco, cidade: e.target.value })} className="w-full bg-[#F8F7F2] p-2 rounded-lg text-sm font-medium outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-stone-400 ml-1">UF</label>
                                        <input value={clienteEndereco?.uf || ""} onChange={e => setClienteEndereco({ ...clienteEndereco, uf: e.target.value })} className="w-full bg-[#F8F7F2] p-2 rounded-lg text-sm font-medium outline-none" maxLength={2} />
                                    </div>
                                    <div className="hidden">
                                        <input value={clienteEndereco?.codigo_municipio || ""} readOnly />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* PRODUTOS (NFC-e) */}
                        <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm">
                            <h3 className="font-bold text-sm text-[#1A1A1A] mb-3 flex items-center gap-2"><ShoppingCart size={14} /> Produtos (NFC-e)</h3>
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

                                                        // Lógica simples de autocomplete (pode ser melhorada com componente dedicado)
                                                        // Aqui apenas permitimos digitar, a busca real seria num dropdown
                                                    }}
                                                    className="w-full bg-white p-1.5 rounded-lg text-xs font-medium outline-none border border-transparent focus:border-[#FACC15]"
                                                    placeholder="Buscar Produto..."
                                                    onFocus={() => setFocusedField({ type: 'prod', idx })}
                                                    onBlur={() => setTimeout(() => setFocusedField(null), 200)}
                                                />
                                                {/* Datalist nativo para simplicidade inicial, ou implementar dropdown customizado */}
                                                <datalist id={`products-list-${idx}`}>
                                                    {/* Opções seriam preenchidas dinamicamente se usássemos estado para busca */}
                                                </datalist>

                                                {/* Botão de Busca Rápida (Simulação de Dropdown Customizado) */}
                                                {focusedField?.type === 'prod' && focusedField?.idx === idx && (
                                                    <div className="absolute top-full left-0 w-full bg-white shadow-xl rounded-lg z-[100] max-h-48 overflow-y-auto border border-stone-100">
                                                        <ProductSearch
                                                            query={item.descricao}
                                                            onSelect={(prod) => {
                                                                const newItens = [...itens];
                                                                newItens[idx].codigo = prod.id;
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
                                                }} className="w-full bg-white p-1.5 rounded-lg text-xs font-medium outline-none text-center" placeholder="NCM" />
                                            </div>
                                            <div className="col-span-1">
                                                <input type="number" value={item.quantidade} onChange={e => {
                                                    const qtd = Number(e.target.value);
                                                    const newItens = [...itens];
                                                    newItens[idx].quantidade = qtd;
                                                    newItens[idx].valor_total = qtd * newItens[idx].valor_unitario;
                                                    setItens(newItens);
                                                }} className="w-full bg-white p-1.5 rounded-lg text-xs font-medium outline-none text-center" placeholder="Qtd" />
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
                                                    className="w-full bg-white p-1.5 rounded-lg text-xs font-medium outline-none text-right"
                                                    placeholder="Valor Unit."
                                                />
                                            </div>
                                            <div className="col-span-1">
                                                <div className="bg-stone-100 p-1.5 rounded-lg text-xs font-bold text-right">R$ {item.valor_total.toFixed(2)}</div>
                                            </div>
                                            <div className="col-span-2 flex justify-end">
                                                <button onClick={() => {
                                                    const newItens = itens.filter((_, i) => i !== idx); setItens(newItens);
                                                }} className="p-1.5 text-stone-400 hover:text-red-500 transition"><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <button onClick={() => setItens([...itens, { codigo: 'NEW', descricao: '', ncm: '', cfop: '5102', unidade: 'UN', quantidade: 1, valor_unitario: 0, valor_total: 0, tipo_origem: 'avulso' }])} className="w-full py-2 border-2 border-dashed border-stone-200 rounded-xl text-stone-400 text-xs font-bold hover:bg-stone-50 transition flex items-center justify-center gap-1">
                                    <Plus size={14} /> Adicionar Produto
                                </button>
                            </div>
                        </div>

                        {/* SERVIÇOS (NFS-e) */}
                        <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-bold text-sm text-blue-700 flex items-center gap-2"><Wrench size={14} /> Serviços (NFS-e)</h3>
                                <span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-2 py-0.5 rounded">AUTOMÁTICO</span>
                            </div>
                            <div className="space-y-2">
                                {itensServico.map((item, idx) => (
                                    <div key={idx} className="bg-white p-2 rounded-xl border border-blue-100">
                                        <div className="grid grid-cols-12 gap-2 items-center">
                                            <div className="col-span-8 relative group">
                                                <input value={item.name} onChange={e => {
                                                    const newItens = [...itensServico]; newItens[idx].name = e.target.value; setItensServico(newItens);
                                                }}
                                                    onFocus={() => setFocusedField({ type: 'serv', idx })}
                                                    onBlur={() => setTimeout(() => setFocusedField(null), 200)}
                                                    className="w-full bg-blue-50 p-1.5 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-blue-200" placeholder="Buscar Serviço..." />

                                                {/* Dropdown de Serviço */}
                                                {focusedField?.type === 'serv' && focusedField?.idx === idx && (
                                                    <div className="absolute top-full left-0 w-full bg-white shadow-xl rounded-lg z-[100] max-h-48 overflow-y-auto border border-blue-100">
                                                        <ServiceSearch
                                                            query={item.name}
                                                            onSelect={(serv) => {
                                                                const newItens = [...itensServico];
                                                                newItens[idx].product_id = serv.id;
                                                                newItens[idx].name = serv.nome;
                                                                newItens[idx].unit_price = serv.price;
                                                                newItens[idx].total_price = serv.price * (newItens[idx].quantity || 1);
                                                                newItens[idx].codigo_servico = serv.codigo_servico || '14.01';
                                                                newItens[idx].aliquota_iss = serv.aliquota_iss || 0;
                                                                setItensServico(newItens);
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="col-span-2">
                                                <input type="number" value={item.total_price} onChange={e => {
                                                    const val = Number(e.target.value);
                                                    const newItens = [...itensServico];
                                                    newItens[idx].total_price = val;
                                                    newItens[idx].unit_price = val;
                                                    setItensServico(newItens);
                                                }} className="w-full bg-blue-50 p-1.5 rounded-lg text-xs font-medium outline-none text-right" />
                                            </div>
                                            <div className="col-span-2 flex justify-end">
                                                <button onClick={() => {
                                                    const newItens = itensServico.filter((_, i) => i !== idx); setItensServico(newItens);
                                                }} className="p-1.5 text-stone-400 hover:text-red-500 transition"><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <button onClick={() => setItensServico([...itensServico, { product_id: 'NEW', name: '', quantity: 1, unit_price: 0, total_price: 0, codigo_servico: '14.01', aliquota_iss: 0 }])} className="w-full py-2 border-2 border-dashed border-blue-200 rounded-xl text-blue-400 text-xs font-bold hover:bg-blue-50 transition flex items-center justify-center gap-1">
                                    <Plus size={14} /> Adicionar Serviço
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
                                <div className="flex justify-between opacity-80">
                                    <span>Serviços</span>
                                    <span>{itensServico.length}</span>
                                </div>
                                <div className="flex justify-between font-bold text-sm pt-2 border-t border-white/10">
                                    <span>NFC-e</span>
                                    <span>R$ {itens.reduce((acc, i) => acc + i.valor_total, 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-sm text-blue-200">
                                    <span>NFS-e</span>
                                    <span>R$ {itensServico.reduce((acc, i) => acc + i.total_price, 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-lg pt-2 border-t border-white/10">
                                    <span>TOTAL</span>
                                    <span>R$ {(itens.reduce((acc, i) => acc + i.valor_total, 0) + itensServico.reduce((acc, i) => acc + i.total_price, 0)).toFixed(2)}</span>
                                </div>
                            </div>

                            <button
                                onClick={handleEmitir}
                                disabled={emitting}
                                className="w-full bg-[#FACC15] text-[#1A1A1A] py-3 rounded-xl font-bold text-sm hover:bg-white transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {emitting ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                                {emitting ? "Emitindo..." : "Emitir Nota"}
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

// Componentes Auxiliares de Busca (Poderiam ser extraídos)
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
            {loading && <div className="flex items-center gap-2 p-2 text-stone-400 text-xs"><Loader2 size={14} className="animate-spin" /> Buscando...</div>}
            {!loading && (
                <div className="space-y-1">
                    {results.map(prod => (
                        <div
                            key={prod.id}
                            onMouseDown={(e) => { e.preventDefault(); onSelect(prod); }}
                            className="p-2 hover:bg-stone-100 rounded-lg cursor-pointer text-xs"
                        >
                            <p className="font-bold text-[#1A1A1A]">{prod.nome}</p>
                            <div className="flex justify-between text-[10px] text-stone-500">
                                <span>{prod.marca}</span>
                                <span>R$ {prod.preco_venda?.toFixed(2)}</span>
                            </div>
                        </div>
                    ))}
                    {results.length === 0 && (
                        <p className="text-[10px] text-center text-stone-400 py-2">Nenhum produto encontrado.</p>
                    )}
                </div>
            )}
        </div>
    );
}

function ServiceSearch({ query, onSelect }: { query: string, onSelect: (serv: any) => void }) {
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!query || query.length < 2) { setResults([]); return; }
            setLoading(true);
            const data = await searchServices(query);
            setResults(data || []);
            setLoading(false);
        }, 500);
        return () => clearTimeout(timer);
    }, [query]);

    if (!query || query.length < 2) return null;

    return (
        <div className="p-2">
            {loading && <div className="flex items-center gap-2 p-2 text-blue-400 text-xs"><Loader2 size={14} className="animate-spin" /> Buscando...</div>}
            {!loading && (
                <div className="space-y-1">
                    {results.map(serv => (
                        <div
                            key={serv.id}
                            onMouseDown={(e) => { e.preventDefault(); onSelect(serv); }}
                            className="p-2 hover:bg-blue-50 rounded-lg cursor-pointer text-xs"
                        >
                            <p className="font-bold text-blue-900">{serv.nome}</p>
                            <div className="flex justify-between text-[10px] text-blue-500">
                                <span>R$ {serv.price?.toFixed(2)}</span>
                            </div>
                        </div>
                    ))}
                    {results.length === 0 && (
                        <p className="text-[10px] text-center text-blue-400 py-2">Nenhum serviço encontrado.</p>
                    )}
                </div>
            )}
        </div>
    );
}
