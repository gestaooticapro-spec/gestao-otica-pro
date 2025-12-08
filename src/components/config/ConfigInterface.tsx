'use client';

import { useState, useEffect, useTransition } from 'react';
import { 
  Users, Plus, Save, Power, Loader2, Lock, User, 
  ShieldCheck, Briefcase, Wrench, BadgeCheck, Percent, CheckCircle2 
} from 'lucide-react';
import { 
  getEmployees, 
  saveEmployee, 
  toggleEmployeeStatus 
} from '@/lib/actions/employee.actions';
import { Database } from '@/lib/database.types';

type Employee = Database['public']['Tables']['employees']['Row'];

// --- DESIGN SYSTEM (Roxo/Violeta) ---
const labelStyle = "block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider";
const inputStyle = "block w-full rounded-md border border-slate-300 bg-white shadow-sm text-slate-900 h-9 text-sm px-3 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 font-bold placeholder:font-normal placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500 transition-all";
const cardStyle = "bg-white p-5 rounded-xl shadow-sm border border-slate-200 mb-4 relative overflow-hidden";

export default function ConfigInterface({ storeId }: { storeId: number }) {
  // Estados
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

  // Carga Inicial
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

  // Handlers
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
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-100">
      
      {/* --- ESQUERDA: LISTA --- */}
      <div className="w-1/3 flex flex-col border-r border-slate-200 bg-white z-10 shadow-sm">
        
        {/* Header Gradiente Roxo */}
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 p-4 flex flex-col gap-3 shadow-md z-20">
            <div className="flex justify-between items-center text-white">
                <h2 className="font-bold text-sm flex items-center gap-2 uppercase tracking-wide">
                    <ShieldCheck className="h-5 w-5" /> Equipe & Acesso
                </h2>
                <button onClick={handleNew} className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors">
                     <Plus className="h-3 w-3" /> NOVO
                </button>
            </div>
            <div className="text-violet-100 text-xs font-medium">
                Gerencie permissões e comissões.
            </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-0">
            {loadingList ? (
                <div className="flex justify-center p-8"><Loader2 className="animate-spin text-violet-500 h-6 w-6"/></div>
            ) : employees.length === 0 ? (
                <p className="text-center text-slate-400 text-xs p-6">Nenhum colaborador encontrado.</p>
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

      {/* --- DIREITA: FORMULÁRIO --- */}
      <div className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden">
          <form onSubmit={handleSubmit} className="flex flex-col h-full">
             
             {/* Header de Contexto */}
             <div className="bg-white px-6 py-4 border-b border-slate-200 shadow-sm shrink-0">
                 <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    {selectedId ? `Editando: ${formData.full_name}` : 'Novo Cadastro'}
                 </h2>
             </div>

             <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="max-w-3xl mx-auto">
                    
                    {/* SEÇÃO 1: DADOS DE ACESSO */}
                    <div className={cardStyle}>
                        <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
                            <Lock className="h-4 w-4" /> Credenciais de Acesso
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className={labelStyle}>Nome Completo</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                    <input 
                                        type="text" required 
                                        value={formData.full_name}
                                        onChange={e => setFormData({...formData, full_name: e.target.value})}
                                        className={`${inputStyle} pl-9`}
                                        placeholder="Ex: Fábio Silva"
                                        disabled={isSaving}
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label className={labelStyle}>Cargo / Função</label>
                                <select 
                                    value={formData.role}
                                    onChange={e => setFormData({...formData, role: e.target.value as any})}
                                    className={inputStyle}
                                    disabled={isSaving}
                                >
                                    <option value="vendedor">Vendedor (Padrão)</option>
                                    <option value="gerente">Gerente (Acesso Total)</option>
                                    <option value="tecnico">Técnico / Estoquista</option>
                                </select>
                            </div>

                            <div>
                                <label className={labelStyle}>PIN de Acesso (4+ Dígitos)</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                    <input 
                                        type="text" required 
                                        value={formData.pin}
                                        onChange={e => setFormData({...formData, pin: e.target.value.replace(/\D/g, '')})}
                                        maxLength={6}
                                        className={`${inputStyle} pl-9 tracking-widest`}
                                        placeholder="****"
                                        disabled={isSaving}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SEÇÃO 2: COMISSÕES */}
                    <div className={cardStyle}>
                        <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                        <h3 className="text-xs font-bold text-green-700 uppercase mb-4 flex items-center gap-2">
                            <Percent className="h-4 w-4" /> Regras de Comissão (%)
                        </h3>
                        
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                            <div className="col-span-full p-3 bg-green-50/50 rounded-lg border border-green-100">
                                <p className="text-[10px] font-bold text-green-800 uppercase mb-2">Vendas Próprias</p>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className={labelStyle}>Garantida (Pix/Cartão)</label>
                                        <input type="number" step="0.01" value={formData.comm_rate_guaranteed} onChange={e => setFormData({...formData, comm_rate_guaranteed: parseFloat(e.target.value)})} className={`${inputStyle} text-right`} />
                                    </div>
                                    <div className="flex-1">
                                        <label className={labelStyle}>Risco (Carnê)</label>
                                        <input type="number" step="0.01" value={formData.comm_rate_store_credit} onChange={e => setFormData({...formData, comm_rate_store_credit: parseFloat(e.target.value)})} className={`${inputStyle} text-right`} />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className={labelStyle}>Bônus (Sobre Loja)</label>
                                <input type="number" step="0.01" value={formData.comm_rate_store_total} onChange={e => setFormData({...formData, comm_rate_store_total: parseFloat(e.target.value)})} className={`${inputStyle} text-right`} />
                                <p className="text-[9px] text-slate-400 mt-1">Para gerentes.</p>
                            </div>

                            <div>
                                <label className={labelStyle}>Sobre Recebimento</label>
                                <input type="number" step="0.01" value={formData.comm_rate_received} onChange={e => setFormData({...formData, comm_rate_received: parseFloat(e.target.value)})} className={`${inputStyle} text-right`} />
                                <p className="text-[9px] text-slate-400 mt-1">Incentivo cobrança.</p>
                            </div>

                            <div>
                                <label className={labelStyle}>Sobre Lucro Bruto</label>
                                <input type="number" step="0.01" value={formData.comm_rate_profit} onChange={e => setFormData({...formData, comm_rate_profit: parseFloat(e.target.value)})} className={`${inputStyle} text-right`} />
                                <p className="text-[9px] text-slate-400 mt-1">Evita descontos.</p>
                            </div>
                        </div>
                    </div>

                </div>
             </div>

             {/* RODAPÉ FIXO */}
             <div className="bg-white border-t border-slate-200 p-4 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] flex justify-end gap-3 z-20 shrink-0">
                {selectedId && (
                    <button 
                        type="button"
                        onClick={() => { 
                            const emp = employees.find(e => e.id === selectedId);
                            if (emp) handleToggleStatus(emp);
                        }}
                        disabled={isSaving}
                        className="px-4 py-2.5 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-red-600 rounded-lg font-bold text-xs shadow-sm transition-colors flex items-center gap-2"
                    >
                        <Power className="h-4 w-4" />
                        BLOQUEAR / DESBLOQUEAR
                    </button>
                )}
                
                <button 
                    type="submit" 
                    disabled={isSaving}
                    className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-bold text-xs shadow-md transition-transform active:scale-95 flex items-center gap-2 disabled:opacity-50"
                >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    SALVAR DADOS
                </button>
             </div>
          </form>
      </div>

    </div>
  );
}