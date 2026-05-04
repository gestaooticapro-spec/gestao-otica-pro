'use client';

import { useState, useEffect, useTransition } from 'react';
import {
    Users, Plus, Save, Power, Loader2, Lock, User,
    ShieldCheck, Briefcase, Wrench, BadgeCheck, Percent, CheckCircle2,
    Store, MapPin, Phone, QrCode, ArrowLeft, AlertCircle, Sparkles
} from 'lucide-react';
import { getEmployees, saveEmployee, toggleEmployeeStatus } from '@/lib/actions/employee.actions';
import { getStoreProfile, updateStoreProfile, updateStoreSettings } from '@/lib/actions/store.actions';
import { Database } from '@/lib/database.types';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import dynamic from 'next/dynamic';

const AiSuggestionConfigPanel = dynamic(() => import('@/components/config/AiSuggestionConfigPanel'), {
    loading: () => <div className="p-6 text-center"><Loader2 className="animate-spin h-6 w-6 text-cyan-400 mx-auto" /></div>,
    ssr: false,
});

type Employee = Database['public']['Tables']['employees']['Row'];
type EmployeeRole = NonNullable<Employee['role']>;
type StoreFeatureSettings = {
    logo?: string;
    pre_sale_analysis_enabled?: boolean;
    receipt_type?: 'pre_printed' | 'half_a4';
};
type StoreData = {
    id: number;
    name: string;
    razao_social: string | null;
    cnpj: string | null;
    inscricao_estadual: string | null;
    whatsapp: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    cep: string | null;
    street: string | null;
    number: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    pix_key?: string | null;
    pix_city?: string | null;
    csc_homologacao?: string | null;
    csc_id_homologacao?: string | null;
    csc_producao?: string | null;
    csc_id_producao?: string | null;
    nfce_serie?: number | null;
    codigo_municipio_ibge?: string | null;
    regime_tributario?: string | null;
    certificate_thumbprint?: string | null;
    certificate_valid_until?: string | null;
    settings: StoreFeatureSettings | null;
};

// ═══════════════════════════════════════════════
// 🎨 DESIGN SYSTEM: Dark Glassmorphism + Indigo
// ═══════════════════════════════════════════════
const labelStyle = "block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-[0.2em]";
const inputStyle = "block w-full rounded-lg border border-white/10 bg-black/20 shadow-inner text-slate-200 h-9 text-sm px-3 focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 font-bold placeholder:font-normal placeholder:text-slate-500 disabled:bg-black/10 disabled:text-slate-500 transition-all outline-none backdrop-blur-sm";
const cardStyle = "bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-xl shadow-xl mb-4 relative overflow-hidden";

// --- SUB-COMPONENTE: FORMULÁRIO DA LOJA ---
function StoreDataForm({ storeId }: { storeId: number }) {
    const [data, setData] = useState<StoreData | null>(null)
    const [loading, setLoading] = useState(true)
    const [isSaving, startTransition] = useTransition()

    useEffect(() => {
        getStoreProfile(storeId).then(res => {
            setData(res as StoreData | null)
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

    if (loading) return <div className="p-10 text-center"><Loader2 className="animate-spin h-8 w-8 text-indigo-400 mx-auto" /></div>
    if (!data) return <div className="p-10 text-center text-sm font-bold text-red-300">Não foi possível carregar os dados da loja.</div>

    return (
        <form action={handleSave} className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
            <input type="hidden" name="id" value={storeId} />

            {/* IDENTIDADE & FISCAL */}
            <div className={cardStyle}>
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                <h3 className="text-sm font-bold text-indigo-300 mb-4 flex items-center gap-2 border-b border-white/10 pb-2">
                    <Store className="h-4 w-4 text-indigo-400" /> Identidade & Fiscal
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 md:col-span-1">
                        <label className={labelStyle}>Nome Fantasia (Marca)</label>
                        <input name="name" defaultValue={data.name ?? ''} className={inputStyle} required />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <label className={labelStyle}>Razão Social</label>
                        <input name="razao_social" defaultValue={data.razao_social ?? ''} className={inputStyle} />
                    </div>
                    <div>
                        <label className={labelStyle}>CNPJ</label>
                        <input name="cnpj" defaultValue={data.cnpj ?? ''} className={inputStyle} placeholder="00.000.000/0000-00" />
                    </div>
                    <div>
                        <label className={labelStyle}>Inscrição Estadual</label>
                        <input name="inscricao_estadual" defaultValue={data.inscricao_estadual ?? ''} className={inputStyle} />
                    </div>
                </div>
            </div>

            {/* CONTATO */}
            <div className={cardStyle}>
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                <h3 className="text-sm font-bold text-emerald-300 mb-4 flex items-center gap-2 border-b border-white/10 pb-2">
                    <Phone className="h-4 w-4 text-emerald-400" /> Contato
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelStyle}>WhatsApp da Loja (Link Rastreio)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-emerald-400 font-bold text-xs">WA</span>
                            <input name="whatsapp" defaultValue={data.whatsapp ?? ''} className={`${inputStyle} pl-10 border-emerald-500/20 focus:ring-emerald-500/50`} placeholder="(00) 90000-0000" />
                        </div>
                        <p className="text-[9px] text-slate-500 mt-1">Este número será usado no botão &quot;Falar com Atendente&quot; do rastreio.</p>
                    </div>
                    <div>
                        <label className={labelStyle}>Telefone Fixo</label>
                        <input name="phone" defaultValue={data.phone ?? ''} className={inputStyle} />
                    </div>
                    <div>
                        <label className={labelStyle}>E-mail</label>
                        <input name="email" type="email" defaultValue={data.email ?? ''} className={inputStyle} />
                    </div>
                    <div>
                        <label className={labelStyle}>Website / Instagram</label>
                        <input name="website" defaultValue={data.website ?? ''} className={inputStyle} />
                    </div>
                </div>
            </div>

            {/* ENDEREÇO */}
            <div className={cardStyle}>
                <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
                <h3 className="text-sm font-bold text-rose-300 mb-4 flex items-center gap-2 border-b border-white/10 pb-2">
                    <MapPin className="h-4 w-4 text-rose-400" /> Endereço
                </h3>
                <div className="grid grid-cols-6 gap-3">
                    <div className="col-span-2">
                        <label className={labelStyle}>CEP</label>
                        <input name="cep" defaultValue={data.cep ?? ''} className={inputStyle} />
                    </div>
                    <div className="col-span-2">
                        <label className={labelStyle}>Cidade</label>
                        <input name="city" defaultValue={data.city ?? ''} className={inputStyle} />
                    </div>
                    <div className="col-span-1">
                        <label className={labelStyle}>UF</label>
                        <input name="state" defaultValue={data.state ?? ''} className={inputStyle} maxLength={2} />
                    </div>
                    <div className="col-span-1">
                        <label className={labelStyle}>Cód. IBGE</label>
                        <input name="codigo_municipio_ibge" defaultValue={data.codigo_municipio_ibge ?? ''} className={inputStyle} placeholder="Ex: 4108809" title="Código IBGE do município (obrigatório para NFCe)" />
                    </div>
                    <div className="col-span-4">
                        <label className={labelStyle}>Logradouro</label>
                        <input name="street" defaultValue={data.street ?? ''} className={inputStyle} />
                    </div>
                    <div className="col-span-2">
                        <label className={labelStyle}>Número</label>
                        <input name="number" defaultValue={data.number ?? ''} className={inputStyle} />
                    </div>
                    <div className="col-span-3">
                        <label className={labelStyle}>Bairro</label>
                        <input name="neighborhood" defaultValue={data.neighborhood ?? ''} className={inputStyle} />
                    </div>
                </div>
            </div>


            {/* CONFIGURAÇÃO FISCAL (NFC-e) */}
            <div className={cardStyle}>
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                <h3 className="text-sm font-bold text-amber-300 mb-4 flex items-center gap-2 border-b border-white/10 pb-2">
                    <ShieldCheck className="h-4 w-4 text-amber-400" /> Configuração Fiscal (NFC-e)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* CSC - Código de Segurança do Contribuinte */}
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase border-b border-white/10 pb-1">CSC (Token)</h4>

                        <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 space-y-3">
                            <p className="text-[10px] font-bold text-amber-300 uppercase mb-1">Homologação (Testes)</p>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-1">
                                    <label className={labelStyle}>ID Token</label>
                                    <input name="csc_id_homologacao" defaultValue={data.csc_id_homologacao ?? ''} className={inputStyle} placeholder="Ex: 000001" />
                                </div>
                                <div className="col-span-2">
                                    <label className={labelStyle}>CSC (Código)</label>
                                    <input name="csc_homologacao" defaultValue={data.csc_homologacao ?? ''} className={inputStyle} placeholder="Ex: ABC123..." />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/5 p-3 rounded-lg border border-white/10 space-y-3">
                            <p className="text-[10px] font-bold text-slate-300 uppercase mb-1">Produção (Valendo)</p>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-1">
                                    <label className={labelStyle}>ID Token</label>
                                    <input name="csc_id_producao" defaultValue={data.csc_id_producao ?? ''} className={inputStyle} placeholder="Ex: 000001" />
                                </div>
                                <div className="col-span-2">
                                    <label className={labelStyle}>CSC (Código)</label>
                                    <input name="csc_producao" defaultValue={data.csc_producao ?? ''} className={inputStyle} placeholder="Ex: XYZ789..." />
                                </div>
                            </div>
                        </div>

                        <div className="bg-indigo-500/10 p-3 rounded-lg border border-indigo-500/20">
                            <p className="text-[10px] font-bold text-indigo-300 uppercase mb-2">Numeração & Regime</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelStyle}>Série NFCe</label>
                                    <input
                                        name="nfce_serie"
                                        type="number"
                                        min="1"
                                        max="999"
                                        defaultValue={data.nfce_serie ?? 1}
                                        className={inputStyle}
                                        placeholder="Ex: 1"
                                    />
                                    <p className="text-[9px] text-indigo-400/60 mt-1 leading-tight">
                                        Use séries diferentes para lojas do mesmo CNPJ.
                                    </p>
                                </div>
                                <div>
                                    <label className={labelStyle}>Regime Tributário</label>
                                    <select
                                        name="regime_tributario"
                                        defaultValue={data.regime_tributario ?? '1'}
                                        className={inputStyle}
                                    >
                                        <option value="1">1 – Simples Nacional</option>
                                        <option value="2">2 – Lucro Presumido</option>
                                        <option value="3">3 – Lucro Real</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Certificado Digital */}
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase border-b border-white/10 pb-1">Certificado Digital A1</h4>

                        <div className="bg-sky-500/10 p-4 rounded-lg border border-sky-500/20">
                            <div className="flex items-start gap-3 mb-4">
                                <div className="bg-sky-500/20 p-2 rounded-full shadow-sm border border-sky-500/30">
                                    <ShieldCheck className="h-6 w-6 text-sky-400" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-sky-300">Certificado Atual</p>
                                    {data.certificate_thumbprint ? (
                                        <div className="mt-1">
                                            <p className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                                <CheckCircle2 className="h-3 w-3" /> Configurado
                                            </p>
                                            <p className="text-[10px] text-slate-500">
                                                Válido até: {data.certificate_valid_until ? new Date(data.certificate_valid_until).toLocaleDateString() : 'N/A'}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-[10px] text-red-400 font-bold mt-1">Não configurado</p>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-3 pt-3 border-t border-sky-500/20">
                                <div>
                                    <label className={labelStyle}>Arquivo .PFX ou .P12</label>
                                    <input type="file" name="certificate_file" accept=".pfx,.p12" className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-sky-500/20 file:text-sky-300 hover:file:bg-sky-500/30 transition-all cursor-pointer" />
                                </div>
                                <div>
                                    <label className={labelStyle}>Senha do Certificado</label>
                                    <input name="certificate_password" type="password" className={inputStyle} placeholder="Senha do arquivo" />
                                </div>
                                <p className="text-[9px] text-sky-400/60 leading-tight">
                                    O certificado será enviado diretamente para a Nuvem Fiscal e não será salvo em nosso banco de dados por segurança.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* PIX */}
            <div className={cardStyle}>
                <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500"></div>
                <h3 className="text-sm font-bold text-cyan-300 mb-4 flex items-center gap-2 border-b border-white/10 pb-2">
                    <QrCode className="h-4 w-4 text-cyan-400" /> Configuração Pix
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelStyle}>Chave Pix</label>
                        <input name="pix_key" defaultValue={data.pix_key ?? ''} className={inputStyle} placeholder="CPF, CNPJ, Email ou Aleatória" />
                        <p className="text-[9px] text-slate-500 mt-1">
                            A chave será usada para gerar o QR Code nos carnês.
                        </p>
                    </div>
                    <div>
                        <label className={labelStyle}>Cidade do Pix</label>
                        <input name="pix_city" defaultValue={data.pix_city ?? ''} className={inputStyle} placeholder="Ex: Toledo" />
                        <p className="text-[9px] text-slate-500 mt-1">
                            Cidade onde a conta bancária foi aberta (obrigatório pelo Banco Central).
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex justify-end pb-10">
                <button disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/20 flex items-center gap-2 disabled:opacity-50 border border-white/10 transition-colors">
                    {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    SALVAR DADOS DA LOJA
                </button>
            </div>
        </form>
    )
}

// --- SUB-COMPONENTE: RECURSOS ---
function ResourcesForm({ storeId }: { storeId: number }) {
    const [data, setData] = useState<StoreData | null>(null)
    const [loading, setLoading] = useState(true)
    const [isSaving, startTransition] = useTransition()

    useEffect(() => {
        getStoreProfile(storeId).then(res => {
            setData(res as StoreData | null)
            setLoading(false)
        })
    }, [storeId])

    const handleSettingChange = (settingName: string, value: any) => {
        startTransition(async () => {
            const res = await updateStoreSettings(storeId, { [settingName]: value })
            if (res.success) {
                // Atualiza o estado local para refletir a mudança
                setData(prev => prev ? {
                    ...prev,
                    settings: {
                        ...(prev.settings as any),
                        [settingName]: value
                    }
                } : null)
            } else {
                alert("Erro: " + res.message)
            }
        })
    }

    if (loading) return <div className="p-10 text-center"><Loader2 className="animate-spin h-8 w-8 text-indigo-400 mx-auto" /></div>
    if (!data) return <div className="p-10 text-center text-sm font-bold text-red-300">Não foi possível carregar os dados da loja.</div>

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
            <div className={cardStyle}>
                <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500"></div>
                <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-4">
                    <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-cyan-400" /> Operação & Recursos
                    </h3>
                    {isSaving && <div className="flex items-center gap-2 text-[10px] text-cyan-400 animate-pulse font-bold tracking-widest uppercase">
                        <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                    </div>}
                </div>

                <label className="flex items-start gap-4 rounded-xl border border-white/10 bg-black/20 p-4 cursor-pointer hover:bg-white/5 transition-colors group">
                    <input
                        type="checkbox"
                        checked={Boolean(data?.settings?.pre_sale_analysis_enabled)}
                        onChange={(e) => handleSettingChange('pre_sale_analysis_enabled', e.target.checked)}
                        disabled={isSaving}
                        className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-cyan-500 disabled:opacity-50"
                    />
                    <div>
                        <p className="text-sm font-black text-white uppercase tracking-[0.15em] group-hover:text-cyan-300 transition-colors">
                            Análise Pré-Venda
                        </p>
                        <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                            Quando habilitado, a loja passa a ver a nova tela de Avaliação no menu de Atendimento
                            e pode registrar análises antes da venda, com histórico individual por titular ou dependente.
                        </p>
                    </div>
                </label>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4 transition-colors">
                    <div>
                        <p className="text-sm font-black text-white uppercase tracking-[0.15em] mb-2">
                            Formato de Impressão do Recibo
                        </p>
                        <p className="text-xs text-slate-400 leading-relaxed mb-4">
                            Escolha como o recibo financeiro será impresso na impressora padrão (A4).
                        </p>
                        <div className="flex flex-col gap-3">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="radio"
                                    name="receipt_type"
                                    value="pre_printed"
                                    checked={data?.settings?.receipt_type === 'pre_printed' || !data?.settings?.receipt_type}
                                    onChange={() => handleSettingChange('receipt_type', 'pre_printed')}
                                    disabled={isSaving}
                                    className="h-4 w-4 border-white/20 bg-slate-900 text-cyan-500 focus:ring-cyan-500 disabled:opacity-50"
                                />
                                <span className="text-sm text-slate-300 group-hover:text-white font-medium">Formulário Pré-Impresso (Gráfica)</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="radio"
                                    name="receipt_type"
                                    value="half_a4"
                                    checked={data?.settings?.receipt_type === 'half_a4'}
                                    onChange={() => handleSettingChange('receipt_type', 'half_a4')}
                                    disabled={isSaving}
                                    className="h-4 w-4 border-white/20 bg-slate-900 text-cyan-500 focus:ring-cyan-500 disabled:opacity-50"
                                />
                                <span className="text-sm text-slate-300 group-hover:text-white font-medium">Folha Branca (1/2 A4 com dados da loja)</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* CONFIGURAÇÃO DO MOTOR DE IA */}
            <AiSuggestionConfigPanel storeId={storeId} />
        </div>
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
                role: (emp.role || 'vendedor') as EmployeeRole,
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
            <div className="w-1/3 flex flex-col bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl shadow-xl overflow-hidden">
                <div className="bg-gradient-to-br from-indigo-900/60 to-slate-900/60 p-4 flex flex-col gap-3 shadow-md z-20 border-b border-indigo-500/20 backdrop-blur-md">
                    <div className="flex justify-between items-center text-indigo-200">
                        <h2 className="font-bold text-sm flex items-center gap-2 uppercase tracking-wide">
                            <ShieldCheck className="h-5 w-5" /> Equipe
                        </h2>
                        <button onClick={handleNew} className="bg-white/10 hover:bg-white/20 text-indigo-200 px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors border border-white/10">
                            <Plus className="h-3 w-3" /> NOVO
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {loadingList ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-indigo-400 h-6 w-6" /></div>
                    ) : employees.length === 0 ? (
                        <p className="text-center text-slate-500 text-xs p-6">Nenhum colaborador.</p>
                    ) : (
                        employees.map(emp => (
                            <div
                                key={emp.id}
                                className={`p-3 rounded-xl cursor-pointer transition-all flex justify-between items-center group relative overflow-hidden backdrop-blur-sm
                                    ${selectedId === emp.id
                                        ? 'bg-indigo-500/30 border border-indigo-500/40 shadow-lg shadow-indigo-500/10'
                                        : 'bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/10'}
                                `}
                                onClick={() => handleSelect(emp)}
                            >
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className={`font-bold text-xs ${selectedId === emp.id ? 'text-indigo-200' : 'text-slate-300 group-hover:text-white'}`}>{emp.full_name}</p>
                                        {!emp.is_active && <span className="text-[9px] bg-red-500/20 text-red-300 px-1.5 rounded font-bold uppercase border border-red-500/30">Inativo</span>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 uppercase tracking-wide
                                            ${emp.role === 'gerente' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
                                                emp.role === 'tecnico' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                                                    'bg-white/10 text-slate-400 border border-white/10'}`}>
                                            <RoleIcon role={emp.role || 'vendedor'} />
                                            {emp.role || 'Vendedor'}
                                        </span>
                                    </div>
                                </div>
                                {selectedId === emp.id && <CheckCircle2 className="h-4 w-4 text-indigo-400" />}

                                {selectedId === emp.id && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-transparent pointer-events-none" />
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* DIREITA: FORMULÁRIO */}
            <div className="flex-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl shadow-xl flex flex-col overflow-hidden">
                <div className="bg-slate-900/60 px-6 py-4 border-b border-white/10 shadow-sm shrink-0 backdrop-blur-md">
                    <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                        {selectedId ? `Editando: ${formData.full_name}` : 'Novo Cadastro'}
                    </h2>
                </div>
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* SEÇÃO 1: ACESSO */}
                        <div className={cardStyle}>
                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                            <h3 className="text-xs font-bold text-indigo-300 uppercase mb-4 flex items-center gap-2">
                                <Lock className="h-4 w-4" /> Credenciais
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className={labelStyle}>Nome Completo</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                                        <input type="text" required value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} className={`${inputStyle} pl-9`} placeholder="Ex: Fábio Silva" disabled={isSaving} />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelStyle}>Cargo / Função</label>
                                    <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value as EmployeeRole })} className={inputStyle} disabled={isSaving}>
                                        <option value="vendedor">Vendedor (Padrão)</option>
                                        <option value="gerente">Gerente (Acesso Total)</option>
                                        <option value="tecnico">Técnico / Estoquista</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelStyle}>PIN (4+ Dígitos)</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                                        <input type="text" required value={formData.pin} onChange={e => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })} maxLength={6} className={`${inputStyle} pl-9 tracking-widest`} placeholder="****" disabled={isSaving} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* SEÇÃO 2: COMISSÕES */}
                        <div className={cardStyle}>
                            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                            <h3 className="text-xs font-bold text-emerald-300 uppercase mb-4 flex items-center gap-2">
                                <Percent className="h-4 w-4" /> Comissões (%)
                            </h3>
                            
                            {/* ALERTA DE EXCLUSIVIDADE */}
                            {((formData.comm_rate_guaranteed || 0) > 0 || (formData.comm_rate_store_credit || 0) > 0) && ((formData.comm_rate_store_total || 0) > 0 || (formData.comm_rate_received || 0) > 0 || (formData.comm_rate_profit || 0) > 0) && (
                                <div className="col-span-full mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 font-bold flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4" />
                                    Erro: Um colaborador não pode ter taxa Individual e Global ativas ao mesmo tempo. Zere uma das categorias.
                                </div>
                            )}

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                <div className="col-span-full p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20 shadow-inner">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-xs font-black text-emerald-300 uppercase tracking-widest">🚀 Vendas Próprias (Individual)</p>
                                        <span className="text-[9px] text-emerald-400/70 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase font-bold tracking-widest">Pagas por Venda</span>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className={labelStyle}>Garantida <span className="text-[8px] font-normal normal-case text-emerald-300/60 ml-1">(PIX, Dinheiro, Cartão)</span></label>
                                            <input type="number" step="0.01" disabled={isSaving || ((formData.comm_rate_store_total || 0) > 0 || (formData.comm_rate_received || 0) > 0 || (formData.comm_rate_profit || 0) > 0)} value={formData.comm_rate_guaranteed} onChange={e => setFormData({ ...formData, comm_rate_guaranteed: parseFloat(e.target.value) || 0 })} className={`${inputStyle} text-right disabled:opacity-50`} />
                                        </div>
                                        <div className="flex-1">
                                            <label className={labelStyle}>Risco <span className="text-[8px] font-normal normal-case text-emerald-300/60 ml-1">(Carnê Local, Crédito)</span></label>
                                            <input type="number" step="0.01" disabled={isSaving || ((formData.comm_rate_store_total || 0) > 0 || (formData.comm_rate_received || 0) > 0 || (formData.comm_rate_profit || 0) > 0)} value={formData.comm_rate_store_credit} onChange={e => setFormData({ ...formData, comm_rate_store_credit: parseFloat(e.target.value) || 0 })} className={`${inputStyle} text-right disabled:opacity-50`} />
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="col-span-full mt-2">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-xs font-black text-indigo-300 uppercase tracking-widest">🌍 Faturamento Global (Loja Inteira)</p>
                                        <span className="text-[9px] text-indigo-400/70 border border-indigo-500/20 px-2 py-0.5 rounded-full uppercase font-bold tracking-widest">Pagas no Mês</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-lg shadow-inner">
                                        <div>
                                            <label className={labelStyle}>Total Vendido (Bruto)</label>
                                            <input type="number" step="0.01" disabled={isSaving || ((formData.comm_rate_guaranteed || 0) > 0 || (formData.comm_rate_store_credit || 0) > 0)} value={formData.comm_rate_store_total} onChange={e => setFormData({ ...formData, comm_rate_store_total: parseFloat(e.target.value) || 0 })} className={`${inputStyle} text-right border-indigo-500/30 focus:ring-indigo-500 disabled:opacity-50`} />
                                        </div>
                                        <div>
                                            <label className={labelStyle}>Valores Recebidos (Caixa)</label>
                                            <input type="number" step="0.01" disabled={isSaving || ((formData.comm_rate_guaranteed || 0) > 0 || (formData.comm_rate_store_credit || 0) > 0)} value={formData.comm_rate_received} onChange={e => setFormData({ ...formData, comm_rate_received: parseFloat(e.target.value) || 0 })} className={`${inputStyle} text-right border-indigo-500/30 focus:ring-indigo-500 disabled:opacity-50`} />
                                        </div>
                                        <div>
                                            <label className={labelStyle}>Lucro Bruto <span className="text-[8px] font-normal normal-case text-indigo-300/60 ml-1">(Venda - Custo)</span></label>
                                            <input type="number" step="0.01" disabled={isSaving || ((formData.comm_rate_guaranteed || 0) > 0 || (formData.comm_rate_store_credit || 0) > 0)} value={formData.comm_rate_profit} onChange={e => setFormData({ ...formData, comm_rate_profit: parseFloat(e.target.value) || 0 })} className={`${inputStyle} text-right border-indigo-500/30 focus:ring-indigo-500 disabled:opacity-50`} />
                                        </div>
                                        <p className="col-span-full text-[10px] text-indigo-200/50 mt-1 italic">
                                            ⚠️ Importante: Atribuir uma taxa global anula as comissões por venda individual (e vice-versa).
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-white/10">
                            {selectedId ? (
                                <button type="button" onClick={() => { const emp = employees.find(e => e.id === selectedId); if (emp) handleToggleStatus(emp); }} disabled={isSaving} className="px-4 py-2 bg-white/5 border border-white/10 text-slate-400 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/30 rounded-lg font-bold text-xs shadow-sm transition-colors flex items-center gap-2">
                                    <Power className="h-4 w-4" /> {employees.find(e => e.id === selectedId)?.is_active ? 'BLOQUEAR' : 'DESBLOQUEAR'}
                                </button>
                            ) : <div></div>}
                            <button type="submit" disabled={isSaving} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs shadow-lg shadow-indigo-500/20 transition-transform active:scale-95 flex items-center gap-2 disabled:opacity-50 border border-white/10">
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
    const [activeTab, setActiveTab] = useState<'loja' | 'recursos' | 'equipe'>('loja')
    const router = useRouter()
    const { preference } = useBackgroundPreference()

    return (
        <div className="relative flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden font-sans">

            {/* BACKGROUND PREMIUM */}
            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 pointer-events-none ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <img src="/dashboard.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-40 blur-[2px]" />
                <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-950/50 via-slate-950/70 to-slate-950/95" />
            </div>

            {/* Header de Abas */}
            <div className="relative z-20 bg-slate-900/60 backdrop-blur-xl border-b border-white/10 px-6 flex items-center gap-6 shadow-lg shrink-0">
                <button
                    onClick={() => router.back()}
                    className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
                    title="Voltar"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>

                <div className="w-px h-8 bg-white/10"></div>

                <button
                    onClick={() => setActiveTab('loja')}
                    className={`py-4 text-[10px] font-black border-b-2 transition-colors flex items-center gap-2 uppercase tracking-[0.2em] ${activeTab === 'loja' ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                    <Store className="h-4 w-4" /> Dados da Loja
                </button>
                <button
                    onClick={() => setActiveTab('recursos')}
                    className={`py-4 text-[10px] font-black border-b-2 transition-colors flex items-center gap-2 uppercase tracking-[0.2em] ${activeTab === 'recursos' ? 'border-cyan-500 text-cyan-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                    <Sparkles className="h-4 w-4" /> Recursos
                </button>
                <button
                    onClick={() => setActiveTab('equipe')}
                    className={`py-4 text-[10px] font-black border-b-2 transition-colors flex items-center gap-2 uppercase tracking-[0.2em] ${activeTab === 'equipe' ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                    <Users className="h-4 w-4" /> Equipe & Acesso
                </button>

                <div className="flex-1" />
                <BackgroundToggle />
            </div>

            <div className="relative z-10 flex-1 overflow-y-auto p-6 custom-scrollbar">
                {activeTab === 'loja' && <StoreDataForm storeId={storeId} />}
                {activeTab === 'recursos' && <ResourcesForm storeId={storeId} />}
                {activeTab === 'equipe' && <TeamManagement storeId={storeId} />}
            </div>
        </div>
    )
}
