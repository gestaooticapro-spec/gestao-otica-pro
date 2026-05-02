'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, UserMinus, MessageCircle, Loader2, Search, Phone } from 'lucide-react';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import { openWhatsApp } from '@/lib/utils/whatsapp';
import { formatCurrency } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClienteInativo {
    nome: string;
    telefone: string;
    totalGasto: number;
    ultimaVenda: string;
}

export default function ClientesInativosPage() {
    const router = useRouter();
    const params = useParams();
    const storeId = Number(params.storeId);
    const { preference } = useBackgroundPreference();

    const [clientes, setClientes] = useState<ClienteInativo[]>([]);
    const [loading, setLoading] = useState(true);
    const [busca, setBusca] = useState('');
    const storeName = 'Ótica';

    useEffect(() => {
        if (!storeId) return;
        async function fetchData() {
            try {
                const response = await fetch(`/api/alertas-operacionais?storeId=${storeId}`);
                if (response.ok) {
                    const data = await response.json();
                    setClientes(data.clientesInativos || []);
                }
            } catch (error) {
                console.error('Erro ao buscar clientes inativos:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [storeId]);

    const clientesFiltrados = useMemo(() => {
        if (!busca.trim()) return clientes;
        const termo = busca.toLowerCase();
        return clientes.filter(c => c.nome.toLowerCase().includes(termo));
    }, [clientes, busca]);

    const formatPhone = (phone: string | null) => {
        if (!phone) return '';
        const cl = phone.replace(/\D/g, '');
        if (cl.length === 11) return `(${cl.substring(0, 2)}) ${cl.substring(2, 7)}-${cl.substring(7, 11)}`;
        if (cl.length === 10) return `(${cl.substring(0, 2)}) ${cl.substring(2, 6)}-${cl.substring(6, 10)}`;
        return phone;
    };

    const handleWhatsApp = (cliente: ClienteInativo) => {
        if (!cliente.telefone) return alert(`${cliente.nome.split(' ')[0]} não tem celular cadastrado.`);
        const primeiroNome = cliente.nome.split(' ')[0];
        const msg = `Olá ${primeiroNome}, tudo bem? Aqui é da ${storeName}! Faz um tempinho que não te vemos por aqui. Que tal dar uma passadinha na loja? Temos novidades esperando por você! 😊`;
        openWhatsApp(cliente.telefone, msg);
    };

    return (
        <div className="min-h-full relative flex flex-col p-6 lg:p-10 z-0">
            {/* Background */}
            <div className={`fixed inset-0 z-[-1] transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 bg-[url('/tela1.jpg')] bg-cover bg-center" />
                <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />
            </div>

            <div className="absolute top-6 right-6 z-50">
                <BackgroundToggle />
            </div>

            {/* Cabeçalho */}
            <div className="mb-8 max-w-5xl mx-auto w-full animate-in slide-in-from-top-5 duration-700">
                <Link
                    href={`/dashboard/loja/${storeId}?menu=loja-vazia`}
                    className="p-2 mb-6 inline-flex bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
                    title="Voltar para o Painel"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Link>

                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-rose-500/20 rounded-xl ring-1 ring-rose-500/30 backdrop-blur-md">
                            <UserMinus className="w-8 h-8 text-rose-400" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-md">Clientes Sumidos</h1>
                            <p className="text-slate-400 text-sm font-medium mt-1">Clientes que não compram há mais de 1 ano</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-3xl font-black text-rose-400">{clientes.length}</span>
                        <p className="text-slate-500 text-xs font-bold uppercase">Total</p>
                    </div>
                </div>

                {/* Busca */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar cliente por nome..."
                        className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/30 text-sm font-medium backdrop-blur-md transition-all"
                    />
                </div>
            </div>

            {/* Lista */}
            <div className="max-w-5xl mx-auto w-full">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-20 bg-black/20 rounded-3xl border border-white/5 backdrop-blur-sm">
                        <Loader2 className="w-10 h-10 animate-spin text-rose-500 mb-4" />
                        <p className="text-slate-400 font-medium">Buscando clientes inativos...</p>
                    </div>
                ) : clientesFiltrados.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 bg-black/20 rounded-3xl border border-white/5 backdrop-blur-sm">
                        <UserMinus className="w-12 h-12 text-rose-400 mb-4 opacity-50" />
                        <p className="text-slate-400 font-medium">
                            {busca ? 'Nenhum cliente encontrado com esse nome.' : 'Todos os clientes compraram recentemente! 🎉'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3 animate-in fade-in duration-700">
                        {clientesFiltrados.map((cliente, i) => (
                            <div
                                key={i}
                                className="flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all border border-white/5 hover:border-white/15 backdrop-blur-md gap-4"
                            >
                                <div className="flex-1">
                                    <p className="text-white font-bold text-lg">{cliente.nome}</p>
                                    <div className="flex items-center gap-4 mt-1.5">
                                        <p className="text-sm text-slate-400 flex items-center gap-1.5">
                                            <Phone className="w-3.5 h-3.5" />
                                            {formatPhone(cliente.telefone) || 'Sem telefone'}
                                        </p>
                                        <span className="text-slate-600">•</span>
                                        <p className="text-sm text-rose-400 font-medium">
                                            {formatDistanceToNow(new Date(cliente.ultimaVenda), { locale: ptBR, addSuffix: true })}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 sm:flex-row-reverse">
                                    <button
                                        onClick={() => handleWhatsApp(cliente)}
                                        disabled={!cliente.telefone}
                                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white transition-all text-xs font-bold uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                        Avisar
                                    </button>
                                    <div className="text-right">
                                        <p className="text-slate-500 text-[10px] uppercase font-bold">Já gastou</p>
                                        <p className="text-slate-200 font-bold">{formatCurrency(cliente.totalGasto)}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
