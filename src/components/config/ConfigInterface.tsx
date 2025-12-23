'use client';

import { useState, useEffect, useTransition } from 'react';
import {
    Users, Plus, Save, Power, Loader2, Lock, User,
    ShieldCheck, Briefcase, Wrench, BadgeCheck, Percent, CheckCircle2,
    Store, MapPin, Phone, QrCode
} from 'lucide-react';
import { getEmployees, saveEmployee, toggleEmployeeStatus } from '@/lib/actions/employee.actions';
import { getStoreProfile, updateStoreProfile } from '@/lib/actions/store.actions';
import { Database } from '@/lib/database.types';

type Employee = Database['public']['Tables']['employees']['Row'];

const labelStyle = "block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider";
const inputStyle = "block w-full rounded-md border border-slate-300 bg-white shadow-sm text-slate-900 h-9 text-sm px-3 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 font-bold placeholder:font-normal placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500 transition-all";
const cardStyle = "bg-white p-5 rounded-xl shadow-sm border border-slate-200 mb-4 relative overflow-hidden";

// --- SUB-COMPONENTE: FORMULÁRIO DA LOJA ---
function StoreDataForm({ storeId }: { storeId: number }) {
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [isSaving, startTransition] = useTransition()

    useEffect(() => {
        getStoreProfile(storeId).then(res => {
            setData(res)
            setLoading(false)
        })
    }, [storeId])

    const handleSave = (formData: FormData) => {
        startTransition(async () => {
            const res = await updateStoreProfile(null, formData)
            if (res.success) alert(res.message)
            else alert("Erro: " + res.message)
        })
    }

    if (loading) return <div className="p-10 text-center"><Loader2 className="animate-spin h-8 w-8 text-slate-300 mx-auto" /></div>

    return (
        <form action={handleSave} className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
            <input type="hidden" name="id" value={storeId} />

            <div className={cardStyle}>
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                    <Store className="h-4 w-4 text-blue-500" /> Identidade & Fiscal
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 md:col-span-1">
                        <label className={labelStyle}>Nome Fantasia (Marca)</label>
                        <input name="name" defaultValue={data.name} className={inputStyle} required />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <label className={labelStyle}>Razão Social</label>
                        <input name="razao_social" defaultValue={data.razao_social} className={inputStyle} />
                    </div>
                    <div>
                        <label className={labelStyle}>CNPJ</label>
                        <input name="cnpj" defaultValue={data.cnpj} className={inputStyle} placeholder="00.000.000/0000-00" />
                    </div>
                    <div>
                        <label className={labelStyle}>Inscrição Estadual</label>
                        <input name="inscricao_estadual" defaultValue={data.inscricao_estadual} className={inputStyle} />
                    </div>
                </div>
            </div>

            <div className={cardStyle}>
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                    <Phone className="h-4 w-4 text-green-500" /> Contato
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelStyle}>WhatsApp da Loja (Link Rastreio)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-green-600 font-bold text-xs">WA</span>
                            <input name="whatsapp" defaultValue={data.whatsapp} className={`${inputStyle} pl-10 border-green-200 focus:ring-green-500`} placeholder="(00) 90000-0000" />
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1">Este número será usado no botão "Falar com Atendente" do rastreio.</p>
                    </div>
                    <div>
                        <label className={labelStyle}>Telefone Fixo</label>
                        <input name="phone" defaultValue={data.phone} className={inputStyle} />
                    </div>
                    <div>
                        <label className={labelStyle}>E-mail</label>
                        <input name="email" type="email" defaultValue={data.email} className={inputStyle} />
                    </div>
                    <div>
                        <label className={labelStyle}>Website / Instagram</label>
                        <input name="website" defaultValue={data.website} className={inputStyle} />
                    </div>
                </div>
            </div>

            <div className={cardStyle}>
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                    <MapPin className="h-4 w-4 text-rose-500" /> Endereço
                </h3>
                <div className="grid grid-cols-6 gap-3">
                    <div className="col-span-2">
                        <label className={labelStyle}>CEP</label>
                        <input name="cep" defaultValue={data.cep} className={inputStyle} />
                    </div>
                    <div className="col-span-3">
                        <label className={labelStyle}>Cidade</label>
                        <input name="city" defaultValue={data.city} className={inputStyle} />
                    </div>
                    <div className="col-span-1">
                        <label className={labelStyle}>UF</label>
                        <input name="state" defaultValue={data.state} className={inputStyle} maxLength={2} />
                    </div>
                    <div className="col-span-4">
                        <label className={labelStyle}>Logradouro</label>
                        <input name="street" defaultValue={data.street} className={inputStyle} />
                    </div>
                    <div className="col-span-2">
                        <label className={labelStyle}>Número</label>
                        <input name="number" defaultValue={data.number} className={inputStyle} />
                    </div>
                    <div className="col-span-3">
                        <label className={labelStyle}>Bairro</label>
                        <input name="neighborhood" defaultValue={data.neighborhood} className={inputStyle} />
                    </div>
                </div>
            </div>

            {/* NOVA SEÇÃO: PIX */}
            <div className={cardStyle}>
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                    <QrCode className="h-4 w-4 text-purple-500" /> Configuração Pix
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelStyle}>Chave Pix</label>
                        <input name="pix_key" defaultValue={data.pix_key} className={inputStyle} placeholder="CPF, CNPJ, Email ou Aleatória" />
                        <p className="text-[9px] text-slate-400 mt-1">
                            A chave será usada para gerar o QR Code nos carnês.
                        </p>
                    </div>
                    <div>
                        <label className={labelStyle}>Cidade do Pix</label>
                        <input name="pix_city" defaultValue={data.pix_city} className={inputStyle} placeholder="Ex: Toledo" />
                        <p className="text-[9px] text-slate-400 mt-1">
                            Cidade onde a conta bancária foi aberta (obrigatório pelo Banco Central).
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex justify-end pb-10">
                <button disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2 disabled:opacity-50">
                    {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    SALVAR DADOS DA LOJA
                </button>
            </div>
        </form>
    )
}

// --- SUB-COMPONENTE: EQUIPE (Lógica original preservada) ---
function TeamManagement({ storeId }: { storeId: number }) {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [loadingList, setLoadingList] = useState(true);
    const [isSaving, startTransition] = useTransition();

    // Formulário
    const [formData, setFormData] = useState({
        full_name: '',
        pin: '',
        role: 'vendedor' as 'vendedor' | 'gerente' | 'tecnico',
        comm_rate_guaranteed: 0,
        comm_rate_store_credit: 0,
        comm_rate_store_total: 0,
        comm_rate_received: 0,
        comm_rate_profit: 0
    });

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeId]);

    const loadData = async () => {
        setLoadingList(true);
        const data = await getEmployees(storeId);
        setEmployees(data);
        setLoadingList(false);
    };

    const handleSelect = (emp: Employee) => {
        setSelectedId(emp.id);
        setFormData({
            full_name: emp.full_name || '',
            pin: emp.pin || '',
            role: (emp.role as any) || 'vendedor',
            comm_rate_guaranteed: emp.comm_rate_guaranteed || 0,
            comm_rate_store_credit: emp.comm_rate_store_credit || 0,
            comm_rate_store_total: emp.comm_rate_store_total || 0,
            comm_rate_received: emp.comm_rate_received || 0,
            comm_rate_profit: emp.comm_rate_profit || 0
        });
    };

    const handleNew = () => {
        setSelectedId(null);
        setFormData({
            full_name: '', pin: '', role: 'vendedor',
            comm_rate_guaranteed: 0, comm_rate_store_credit: 0, comm_rate_store_total: 0, comm_rate_received: 0, comm_rate_profit: 0
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = new FormData();
        if (selectedId) payload.append('id', selectedId.toString());
        payload.append('full_name', formData.full_name);
        payload.append('pin', formData.pin);
        payload.append('role', formData.role);

        payload.append('comm_rate_guaranteed', formData.comm_rate_guaranteed.toString());
        payload.append('comm_rate_store_credit', formData.comm_rate_store_credit.toString());
        payload.append('comm_rate_store_total', formData.comm_rate_store_total.toString());
        payload.append('comm_rate_received', formData.comm_rate_received.toString());
        payload.append('comm_rate_profit', formData.comm_rate_profit.toString());

        startTransition(async () => {
            const result = await saveEmployee({ success: false, message: '' }, payload);
            if (result.success) {
                alert(result.message);
                if (!selectedId) handleNew();
                loadData();
            } else {
                alert(`Erro: ${result.message}`);
            }
        });
    };

    const handleToggleStatus = async (emp: Employee) => {
        if (!confirm(`Deseja ${emp.is_active ? 'INATIVAR' : 'ATIVAR'} o acesso de ${emp.full_name}?`)) return;

        startTransition(async () => {
            const result = await toggleEmployeeStatus(emp.id, emp.is_active ?? true, storeId);
            if (result.success) {
                loadData();
                if (selectedId === emp.id) handleNew();
            } else {
                alert(result.message);
            }
        });
    }

    const RoleIcon = ({ role }: { role: string }) => {
        if (role === 'gerente') return <Briefcase className="h-3 w-3" />
        if (role === 'tecnico') return <Wrench className="h-3 w-3" />
        return <BadgeCheck className="h-3 w-3" />
    }

    return (
        <div className="flex h-full gap-4">
            {/* ESQUERDA: LISTA */}
            <div className="w-1/3 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-br from-violet-600 to-purple-700 p-4 flex flex-col gap-3 shadow-md z-20">
                    <div className="flex justify-between items-center text-white">
                        <h2 className="font-bold text-sm flex items-center gap-2 uppercase tracking-wide">
                            <ShieldCheck className="h-5 w-5" /> Equipe
                        </h2>
                        <button onClick={handleNew} className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors">
                            <Plus className="h-3 w-3" /> NOVO
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loadingList ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-violet-500 h-6 w-6" /></div>
                    ) : employees.length === 0 ? (
                        <p className="text-center text-slate-400 text-xs p-6">Nenhum colaborador.</p>
                    ) : (
                        employees.map(emp => (
                            <div
                                key={emp.id}
                                className={`p-4 border-b border-slate-100 cursor-pointer transition-colors flex justify-between items-center group
                                    ${selectedId === emp.id ? 'bg-violet-50 border-l-4 border-l-violet-600' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}
                                `}
                                onClick={() => handleSelect(emp)}
                            >
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className={`font-bold text-sm ${selectedId === emp.id ? 'text-violet-800' : 'text-slate-700'}`}>{emp.full_name}</p>
                                        {!emp.is_active && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 rounded font-bold uppercase">Inativo</span>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 uppercase tracking-wide
                                            ${emp.role === 'gerente' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                                                emp.role === 'tecnico' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                                    'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                                            <RoleIcon role={emp.role || 'vendedor'} />
                                            {emp.role || 'Vendedor'}
                                        </span>
                                    </div>
                                </div>
                                {selectedId === emp.id && <CheckCircle2 className="h-4 w-4 text-violet-500" />}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* DIREITA: FORMULÁRIO */}
            <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 shadow-sm shrink-0">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        {selectedId ? `Editando: ${formData.full_name}` : 'Novo Cadastro'}
                    </h2>
                </div>
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* SEÇÃO 1: ACESSO */}
                        <div className={cardStyle}>
                            <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
                                <Lock className="h-4 w-4" /> Credenciais
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className={labelStyle}>Nome Completo</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                        <input type="text" required value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} className={`${inputStyle} pl-9`} placeholder="Ex: Fábio Silva" disabled={isSaving} />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelStyle}>Cargo / Função</label>
                                    <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value as any })} className={inputStyle} disabled={isSaving}>
                                        <option value="vendedor">Vendedor (Padrão)</option>
                                        <option value="gerente">Gerente (Acesso Total)</option>
                                        <option value="tecnico">Técnico / Estoquista</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelStyle}>PIN (4+ Dígitos)</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                        <input type="text" required value={formData.pin} onChange={e => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })} maxLength={6} className={`${inputStyle} pl-9 tracking-widest`} placeholder="****" disabled={isSaving} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* SEÇÃO 2: COMISSÕES */}
                        <div className={cardStyle}>
                            <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                            <h3 className="text-xs font-bold text-green-700 uppercase mb-4 flex items-center gap-2">
                                <Percent className="h-4 w-4" /> Comissões (%)
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                <div className="col-span-full p-3 bg-green-50/50 rounded-lg border border-green-100">
                                    <p className="text-[10px] font-bold text-green-800 uppercase mb-2">Vendas Próprias</p>
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className={labelStyle}>Garantida</label>
                                            <input type="number" step="0.01" value={formData.comm_rate_guaranteed} onChange={e => setFormData({ ...formData, comm_rate_guaranteed: parseFloat(e.target.value) })} className={`${inputStyle} text-right`} />
                                        </div>
                                        <div className="flex-1">
                                            <label className={labelStyle}>Risco (Carnê)</label>
                                            <input type="number" step="0.01" value={formData.comm_rate_store_credit} onChange={e => setFormData({ ...formData, comm_rate_store_credit: parseFloat(e.target.value) })} className={`${inputStyle} text-right`} />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className={labelStyle}>Sobre Loja</label>
                                    <input type="number" step="0.01" value={formData.comm_rate_store_total} onChange={e => setFormData({ ...formData, comm_rate_store_total: parseFloat(e.target.value) })} className={`${inputStyle} text-right`} />
                                </div>
                                <div>
                                    <label className={labelStyle}>Recebimento</label>
                                    <input type="number" step="0.01" value={formData.comm_rate_received} onChange={e => setFormData({ ...formData, comm_rate_received: parseFloat(e.target.value) })} className={`${inputStyle} text-right`} />
                                </div>
                                <div>
                                    <label className={labelStyle}>Lucro</label>
                                    <input type="number" step="0.01" value={formData.comm_rate_profit} onChange={e => setFormData({ ...formData, comm_rate_profit: parseFloat(e.target.value) })} className={`${inputStyle} text-right`} />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                            {selectedId ? (
                                <button type="button" onClick={() => { const emp = employees.find(e => e.id === selectedId); if (emp) handleToggleStatus(emp); }} disabled={isSaving} className="px-4 py-2 bg-white border border-slate-300 text-slate-600 hover:text-red-600 rounded-lg font-bold text-xs shadow-sm transition-colors flex items-center gap-2">
                                    <Power className="h-4 w-4" /> {employees.find(e => e.id === selectedId)?.is_active ? 'BLOQUEAR' : 'DESBLOQUEAR'}
                                </button>
                            ) : <div></div>}
                            <button type="submit" disabled={isSaving} className="px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-bold text-xs shadow-md transition-transform active:scale-95 flex items-center gap-2 disabled:opacity-50">
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                SALVAR DADOS
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

// --- COMPONENTE PRINCIPAL (COM ABAS) ---
export default function ConfigInterface({ storeId }: { storeId: number }) {
    const [activeTab, setActiveTab] = useState<'loja' | 'equipe'>('loja')

    return (
        <div className="flex flex-col h-full bg-slate-100 overflow-hidden">
            {/* Header de Abas */}
            <div className="bg-white px-6 border-b border-slate-200 flex gap-6 shadow-sm shrink-0">
                <button
                    onClick={() => setActiveTab('loja')}
                    className={`py-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'loja' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Store className="h-4 w-4" /> Dados da Loja
                </button>
                <button
                    onClick={() => setActiveTab('equipe')}
                    className={`py-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'equipe' ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Users className="h-4 w-4" /> Equipe & Acesso
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {activeTab === 'loja' ? (
                    <StoreDataForm storeId={storeId} />
                ) : (
                    <TeamManagement storeId={storeId} />
                )}
            </div>
        </div>
    )
}