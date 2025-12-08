// ARQUIVO: src/app/dashboard/loja/[storeId]/clientes/page.tsx
'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { 
  Loader2, Save, Trash2, Search, X,
  ArrowLeftToLine, ArrowRightToLine, ChevronLeft, ChevronRight, 
  User, ClipboardList, ScrollText, Users2, UserPlus, Calendar, Pencil, 
  AlertTriangle, CheckCircle2, Briefcase
} from 'lucide-react';
import { Database } from '@/lib/database.types';
import { saveCustomerDetails, deleteCustomer } from '@/lib/actions/customer.actions';
import { searchCustomersByName, getCustomerById, fetchDefaultCustomers } from '@/lib/actions/vendas.actions';
import { getDependentes, deleteDependente, saveDependente } from '@/lib/actions/dependents.actions';

type Customer = Database['public']['Tables']['customers']['Row'];
type Dependente = Database['public']['Tables']['dependentes']['Row'];
type ActiveTab = 'principal' | 'detalhes' | 'referencias' | 'dependentes'; 

// --- HELPERS ---
const validaCPF = (strCPF: string) => {
    if (!strCPF) return true;
    const cpf = strCPF.replace(/[^\d]+/g, '');
    if (cpf == '') return true;
    if (cpf.length != 11 || /^(\d)\1+$/.test(cpf)) return false;
    let add = 0;
    for (let i = 0; i < 9; i++) add += parseInt(cpf.charAt(i)) * (10 - i);
    let rev = 11 - (add % 11);
    if (rev == 10 || rev == 11) rev = 0;
    if (rev != parseInt(cpf.charAt(9))) return false;
    add = 0;
    for (let i = 0; i < 10; i++) add += parseInt(cpf.charAt(i)) * (11 - i);
    rev = 11 - (add % 11);
    if (rev == 10 || rev == 11) rev = 0;
    if (rev != parseInt(cpf.charAt(10))) return false;
    return true;
};
const formatDate = (dateString: string | null | undefined) => { try { return dateString?.split('T')[0] || ''; } catch (e) { return ''; } };
const formatDateTime = (dateString: string | null | undefined) => { try { return dateString ? new Date(dateString).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR'); } catch (e) { return 'Data inválida'; } };
const maskCPF = (value: string) => value.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').substring(0, 14);
const maskPhone = (value: string) => value.replace(/\D/g, '').replace(/^(\d{2})(\d)/g, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').substring(0, 15);
const formatRenda = (value: string) => { let v = value.replace(/\D/g, ''); if (!v) return '0,00'; let i = v.slice(0, -2); let d = v.slice(-2); if (i.length > 3) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, "."); return `${i || '0'},${d}`; };

// --- DESIGN SYSTEM COMPACTO (ALTO CONTRASTE) ---
// Label mais escuro
const labelStyle = "block text-[9px] font-bold text-slate-700 uppercase mb-0.5 tracking-wider";
// Input branco com borda visível
const inputStyle = "block w-full rounded-md border border-slate-300 bg-white shadow-sm text-slate-900 h-8 text-xs px-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-bold placeholder:font-normal placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500 transition-all";
// Card branco
const cardStyle = "bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-3";

export default function StoreClientPage() {
  const params = useParams();
  const router = useRouter(); 
  const searchParams = useSearchParams(); 
  const urlClientId = searchParams.get('id'); 

  const storeId = parseInt(params.storeId as string, 10);

  const [loading, setLoading] = useState(true);
  const [isSaving, startSaveTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition(); 
  const [customers, setCustomers] = useState<Customer[]>([]); 
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('principal');

  const [dependentesList, setDependentesList] = useState<Dependente[]>([]);

  // Busca integrada na lista lateral
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, startSearchTransition] = useTransition();

  // Formulário Principal
  const [fullName, setFullName] = useState('');
  const [rg, setRg] = useState('');
  const [cpf, setCpf] = useState('');
  const [isCpfValid, setIsCpfValid] = useState(true);
  const [birthDate, setBirthDate] = useState('');
  const [naturalidade, setNaturalidade] = useState('');
  const [estadoCivil, setEstadoCivil] = useState('');
  const [pai, setPai] = useState('');
  const [mae, setMae] = useState('');
  const [conjugeNome, setConjugeNome] = useState('');
  const [conjugeNascimento, setConjugeNascimento] = useState('');
  const [conjugeNaturalidade, setConjugeNaturalidade] = useState('');
  const [conjugeTrabalho, setConjugeTrabalho] = useState('');
  const [conjugeFone, setConjugeFone] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [complemento, setComplemento] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [cep, setCep] = useState('');
  const [phone, setPhone] = useState('');
  const [foneMovel, setFoneMovel] = useState(''); 
  const [email, setEmail] = useState('');
  const [comercialTrabalho, setComercialTrabalho] = useState('');
  const [comercialCargo, setComercialCargo] = useState('');
  const [comercialEndereco, setComercialEndereco] = useState('');
  const [comercialFone, setComercialFone] = useState(''); 
  const [comercialRenda, setComercialRenda] = useState('');
  const [obsComercial, setObsComercial] = useState('');
  const [refComercio1, setRefComercio1] = useState('');
  const [refComercio2, setRefComercio2] = useState('');
  const [refPessoal1, setRefPessoal1] = useState('');
  const [refPessoal2, setRefPessoal2] = useState('');
  const [obsGeral, setObsGeral] = useState(''); 
  const [faixaEtaria, setFaixaEtaria] = useState('');
  const [createdAt, setCreatedAt] = useState(new Date().toLocaleDateString('pt-BR'));

  const currentCustomer = (currentIndex >= 0 && currentIndex < customers.length) ? customers[currentIndex] : undefined;
  const isDepTab = activeTab === 'dependentes'; 

  // --- CARGA INICIAL ---
  const reloadDefaultList = async () => {
      if (isNaN(storeId)) return;
      setLoading(true);
      try {
          if (urlClientId) {
              const result = await getCustomerById(parseInt(urlClientId));
              if (result.success && result.data) {
                  setCustomers([result.data]); 
                  setCurrentIndex(0); 
              } else {
                  const listResult = await fetchDefaultCustomers(storeId);
                  if (listResult.success && listResult.data) {
                      setCustomers(listResult.data as Customer[]);
                      setCurrentIndex(listResult.data.length > 0 ? 0 : -1);
                  }
              }
          } else {
              const result = await fetchDefaultCustomers(storeId);
              if (result.success && result.data) {
                  const lista = result.data as Customer[];
                  setCustomers(lista);
                  if (!currentCustomer && lista.length > 0) setCurrentIndex(0); 
                  else if (lista.length === 0) setCurrentIndex(-1);
              }
          }
      } catch (error) { console.error("Erro crítico:", error); } 
      finally { setLoading(false); }
  };

  useEffect(() => { reloadDefaultList(); }, [storeId]);

  // --- BUSCA LATERAL (FILTRO) ---
  useEffect(() => {
      if (searchQuery.length < 2) {
          if (searchQuery.length === 0 && customers.length < 20) reloadDefaultList(); 
          return;
      }
      
      const timer = setTimeout(() => {
          startSearchTransition(async () => {
              const res = await searchCustomersByName(searchQuery, storeId);
              if (res.success && res.data) {
                  const fullCustomers = res.data.map(c => ({ ...c } as any));
                  setCustomers(fullCustomers);
              }
          });
      }, 500);
      return () => clearTimeout(timer);
  }, [searchQuery]);

  // --- POPULA FORMULÁRIO ---
  useEffect(() => {
    if (!currentCustomer) { setDependentesList([]); }
    setCreatedAt(formatDateTime(currentCustomer?.created_at));
    setErrorMessage(null);
    
    if (currentCustomer?.id) { getDependentes(currentCustomer.id).then(data => setDependentesList(data)); } 
    else { setDependentesList([]); }

    setFullName(currentCustomer?.full_name ?? '');
    setRg(currentCustomer?.rg ?? '');
    const dbCpf = maskCPF(currentCustomer?.cpf ?? '');
    setCpf(dbCpf);
    setIsCpfValid(validaCPF(dbCpf));
    setBirthDate(formatDate(currentCustomer?.birth_date));
    setNaturalidade(currentCustomer?.naturalidade ?? '');
    setEstadoCivil(currentCustomer?.estado_civil ?? '');
    setPai(currentCustomer?.pai ?? '');
    setMae(currentCustomer?.mae ?? '');
    setConjugeNome(currentCustomer?.conjuge_nome ?? '');
    setConjugeNascimento(formatDate(currentCustomer?.conjuge_nascimento));
    setConjugeNaturalidade(currentCustomer?.conjuge_naturalidade ?? '');
    setConjugeTrabalho(currentCustomer?.conjuge_trabalho ?? '');
    setConjugeFone(maskPhone(currentCustomer?.conjuge_fone ?? ''));
    setRua(currentCustomer?.rua ?? '');
    setNumero(currentCustomer?.numero ?? '');
    setBairro(currentCustomer?.bairro ?? '');
    setComplemento(currentCustomer?.complemento ?? '');
    setCidade(currentCustomer?.cidade ?? '');
    setUf(currentCustomer?.uf ?? '');
    setCep(currentCustomer?.cep ?? '');
    setPhone(maskPhone(currentCustomer?.phone ?? '')); 
    setFoneMovel(maskPhone(currentCustomer?.fone_movel ?? ''));
    setEmail(currentCustomer?.email ?? '');
    setComercialTrabalho(currentCustomer?.comercial_trabalho ?? '');
    setComercialCargo(currentCustomer?.comercial_cargo ?? '');
    setComercialEndereco(currentCustomer?.comercial_endereco ?? '');
    setComercialFone(maskPhone(currentCustomer?.comercial_fone ?? ''));
    setComercialRenda(formatRenda(currentCustomer?.comercial_renda?.toString() ?? ''));
    setObsComercial(currentCustomer?.obs_comercial ?? '');
    setRefComercio1(currentCustomer?.ref_comercio_1 ?? '');
    setRefComercio2(currentCustomer?.ref_comercio_2 ?? '');
    setRefPessoal1(currentCustomer?.ref_pessoal_1 ?? '');
    setRefPessoal2(currentCustomer?.ref_pessoal_2 ?? '');
    setFaixaEtaria(currentCustomer?.faixa_etaria ?? '');
    // AQUI: setObsGeral recebe notes ou obs_debito
    setObsGeral(currentCustomer?.notes ?? currentCustomer?.obs_debito ?? '');
  }, [currentCustomer, currentIndex]); 

  // --- HANDLERS ---
  const handleCpfChange = (val: string) => {
      const masked = maskCPF(val);
      setCpf(masked);
      const numbersOnly = masked.replace(/\D/g, '');
      if (numbersOnly.length === 0) setIsCpfValid(true);
      else if (numbersOnly.length === 11) setIsCpfValid(validaCPF(masked));
      else setIsCpfValid(false);
  };

  const handleSaveSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set('notes', obsGeral);
    formData.set('obs_debito', obsGeral); 
    formData.set('cpf', cpf.replace(/\D/g, ''));
    formData.set('phone', phone.replace(/\D/g, ''));
    formData.set('fone_movel', foneMovel.replace(/\D/g, ''));
    formData.set('conjuge_fone', conjugeFone.replace(/\D/g, ''));
    formData.set('comercial_fone', comercialFone.replace(/\D/g, ''));
    formData.set('comercial_renda', comercialRenda.replace(/\./g, '').replace(',', '.'));

    if (birthDate) formData.set('birth_date', birthDate); 
    if (conjugeNascimento) formData.set('conjuge_nascimento', conjugeNascimento);

    startSaveTransition(async () => {
      const result = await saveCustomerDetails({ success: false, message: '' }, formData);
      if (result.success && result.data) {
         alert(result.message);
         if (currentIndex === -1) reloadDefaultList(); 
         else {
             const updatedList = [...customers];
             updatedList[currentIndex] = result.data;
             setCustomers(updatedList);
         }
      } else {
         if (result.errors?.full_name || result.errors?.email) setActiveTab('principal');
         else if (result.errors?.ref_pessoal_1) setActiveTab('referencias');
         setErrorMessage(result.message || "Erro desconhecido.");
      }
    });
  };

  const handleDelete = async () => {
    if (!currentCustomer) return;
    if (confirm(`Deseja deletar ${currentCustomer.full_name}?`)) {
        startDeleteTransition(async () => {
            const result = await deleteCustomer(currentCustomer.id, storeId);
            if (result.success) {
                alert('Cliente deletado.');
                reloadDefaultList();
            } else { alert(result.message); }
        });
    }
  };

  const handleNavigate = (direction: 'first' | 'prev' | 'next' | 'last' | 'new') => {
      if (direction === 'new') { 
          handleNew(); // Chama a função dedicada
          return; 
      }
      if (customers.length === 0) return;
      
      const lastIndex = customers.length - 1;
      let newIndex = currentIndex;

      if (currentIndex === -1) {
          if (direction === 'prev' || direction === 'last') newIndex = 0; 
          else newIndex = lastIndex;
      } else {
          if (direction === 'first') newIndex = 0;
          else if (direction === 'last') newIndex = lastIndex;
          else if (direction === 'prev') newIndex = (currentIndex <= 0) ? lastIndex : currentIndex - 1;
          else if (direction === 'next') newIndex = (currentIndex >= lastIndex) ? 0 : currentIndex + 1;
      }
      setCurrentIndex(newIndex);
  };

  // --- CORREÇÃO: Função handleNew declarada aqui ---
  const handleNew = () => {
      setCurrentIndex(-1);
      setActiveTab('principal');
      // O useEffect detecta currentIndex === -1 e limpa o form
  };

  const handleSelectCustomer = async (cust: Customer, index: number) => {
      if (!cust.rua && !cust.email && cust.id) {
          setLoading(true);
          const fullRes = await getCustomerById(cust.id);
          setLoading(false);
          if (fullRes.success && fullRes.data) {
              const newList = [...customers];
              newList[index] = fullRes.data;
              setCustomers(newList);
          }
      }
      setCurrentIndex(index);
  };

  const baseButtonStyle = "px-3 py-1.5 text-xs font-bold rounded-lg shadow-sm disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-1";

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-100">
        
        {/* --- COLUNA ESQUERDA (30%) --- */}
        <div className="w-1/3 flex flex-col border-r border-slate-200 bg-white z-10 shadow-sm">
            
            {/* Header de Busca (Gradiente) */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-4 flex flex-col gap-3 shadow-md z-20">
                <div className="flex justify-between items-center text-white">
                    <h2 className="font-bold text-sm flex items-center gap-2">
                        <Users2 className="h-4 w-4" /> LISTA DE CLIENTES
                    </h2>
                    <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-medium">
                        {customers.length}
                    </span>
                </div>
                <div className="relative">
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar por nome, CPF..." 
                        className="w-full h-9 pl-9 pr-3 rounded-lg border-0 bg-white shadow-lg text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-300 font-bold text-xs"
                    />
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    {isSearching && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-blue-500" />}
                </div>
            </div>

            {/* Lista Rolável */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-blue-500"/></div>
                ) : customers.length === 0 ? (
                    <div className="text-center p-10 text-slate-400">
                        <User className="h-10 w-10 mx-auto mb-2 opacity-20"/>
                        <p className="text-xs">Nenhum cliente encontrado.</p>
                    </div>
                ) : (
                    customers.map((c, idx) => (
                        <div 
                            key={c.id || idx}
                            onClick={() => handleSelectCustomer(c, idx)}
                            className={`p-3 border-b border-slate-100 cursor-pointer transition-colors flex justify-between items-center group
                                ${currentIndex === idx ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}
                            `}
                        >
                            <div className="min-w-0">
                                <p className={`font-bold text-xs truncate ${currentIndex === idx ? 'text-blue-700' : 'text-slate-700'}`}>
                                    {c.full_name}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                                    {c.cpf ? `CPF: ${c.cpf}` : 'Sem CPF'} 
                                    {c.obs_debito && <AlertTriangle className="h-3 w-3 text-red-500 ml-1" />}
                                </p>
                            </div>
                            <ChevronRight className={`h-3 w-3 text-slate-300 group-hover:text-blue-400 ${currentIndex === idx ? 'text-blue-500' : ''}`} />
                        </div>
                    ))
                )}
            </div>
        </div>

        {/* --- COLUNA DIREITA (70%) --- */}
        <div className="flex-1 flex flex-col bg-slate-50/50 relative overflow-hidden">
            <form onSubmit={handleSaveSubmit} className="flex flex-col h-full">
                <input type="hidden" name="store_id" value={storeId} />
                {currentCustomer?.id && <input type="hidden" name="id" value={currentCustomer.id} />}

                {/* Header das Abas */}
                <div className="bg-white border-b border-slate-200 px-4 pt-3 flex gap-4 shadow-sm flex-shrink-0">
                    <TabButton label="Dados Pessoais" icon={User} isActive={activeTab === 'principal'} onClick={() => setActiveTab('principal')} />
                    <TabButton label="Detalhes" icon={ClipboardList} isActive={activeTab === 'detalhes'} onClick={() => setActiveTab('detalhes')} />
                    <TabButton label="Ref. / Obs" icon={ScrollText} isActive={activeTab === 'referencias'} onClick={() => setActiveTab('referencias')} />
                    {currentCustomer?.id && (
                        <TabButton label={`Dependentes (${dependentesList.length})`} icon={Users2} isActive={activeTab === 'dependentes'} onClick={() => setActiveTab('dependentes')} />
                    )}
                </div>

                {/* Conteúdo com Scroll */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="max-w-5xl mx-auto">
                        {errorMessage && (
                            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-2 mb-3 rounded-r text-xs flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" /> <strong>Erro:</strong> {errorMessage}
                            </div>
                        )}

                        {activeTab === 'principal' && (
                           <div className={cardStyle}>
                               <AbaPrincipal 
                                 state={{ fullName, cpf, rg, birthDate, faixaEtaria, estadoCivil, rua, numero, bairro, complemento, cidade, uf, cep, phone, foneMovel, email, isCpfValid, obsGeral }}
                                 handlers={{ setFullName, handleCpfChange, setRg, setBirthDate, setFaixaEtaria, setEstadoCivil, setRua, setNumero, setBairro, setComplemento, setCidade, setUf, setCep, setPhone, setFoneMovel, setEmail, setObsGeral }}
                                 isSaving={isSaving} inputStyle={inputStyle}
                               />
                           </div>
                        )}
                        {activeTab === 'detalhes' && (
                           <div className={cardStyle}>
                               <AbaDetalhes 
                                 state={{ pai, mae, conjugeNome, conjugeNascimento, conjugeFone, conjugeNaturalidade, conjugeTrabalho, comercialTrabalho, comercialCargo, comercialRenda, comercialFone, comercialEndereco, obsComercial }}
                                 handlers={{ setPai, setMae, setConjugeNome, setConjugeNascimento, setConjugeFone, setConjugeNaturalidade, setConjugeTrabalho, setComercialTrabalho, setComercialCargo, setComercialRenda, setComercialFone, setComercialEndereco, setObsComercial }}
                                 isSaving={isSaving} inputStyle={inputStyle}
                              />
                           </div>
                        )}
                        {activeTab === 'referencias' && (
                           <div className={cardStyle}>
                               <AbaReferencias 
                                 state={{ refPessoal1, refPessoal2, refComercio1, refComercio2 }}
                                 handlers={{ setRefPessoal1, setRefPessoal2, setRefComercio1, setRefComercio2 }}
                                 isSaving={isSaving} inputStyle={inputStyle}
                               />
                           </div>
                        )}
                        {activeTab === 'dependentes' && (
                           <AbaDependentes 
                                customerId={currentCustomer?.id}
                                storeId={storeId}
                                dependentes={dependentesList}
                                onUpdate={() => { if(currentCustomer?.id) getDependentes(currentCustomer.id).then(setDependentesList); }}
                                inputStyle={inputStyle}
                           />
                        )}
                    </div>
                </div>

                {/* RODAPÉ FIXO (Some na aba Dependentes) */}
                {!isDepTab && (
                    <div className="bg-white border-t border-slate-200 p-3 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] flex justify-between items-center z-20 shrink-0">
                        <div className="flex gap-1">
                            <button type="button" onClick={() => handleNavigate('first')} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500"><ArrowLeftToLine className="h-4 w-4"/></button>
                            <button type="button" onClick={() => handleNavigate('prev')} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500"><ChevronLeft className="h-4 w-4"/></button>
                            <span className="bg-slate-800 text-white text-xs px-3 py-2 rounded-lg font-mono font-bold min-w-[70px] text-center">
                                 {currentIndex === -1 ? 'NOVO' : `${currentIndex + 1} / ${customers.length}`}
                            </span>
                            <button type="button" onClick={() => handleNavigate('next')} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500"><ChevronRight className="h-4 w-4"/></button>
                            <button type="button" onClick={() => handleNavigate('last')} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500"><ArrowRightToLine className="h-4 w-4"/></button>
                        </div>

                        <div className="flex gap-2">
                            <button type="button" onClick={handleNew} disabled={isSaving} className={`${baseButtonStyle} bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200`}>
                                <UserPlus className="h-4 w-4" /> Novo
                            </button>
                            {currentIndex !== -1 && (
                                <button type="button" onClick={handleDelete} disabled={isDeleting} className={`${baseButtonStyle} bg-red-50 text-red-700 hover:bg-red-100 border border-red-200`}>
                                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4"/>} Excluir
                                </button>
                            )}
                            <button type="submit" disabled={isSaving} className={`${baseButtonStyle} bg-green-600 text-white hover:bg-green-700 shadow-md px-6`}>
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Save className="h-4 w-4 mr-1"/> SALVAR</>}
                            </button>
                        </div>
                    </div>
                )}
            </form>
        </div>
    </div>
  );
}

function TabButton({ label, icon: Icon, isActive, onClick }: { label: string, icon: React.ElementType, isActive: boolean, onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className={`flex items-center gap-2 pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${isActive ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>
             <Icon className={`h-4 w-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} /> {label}
        </button>
    );
}

function AbaPrincipal({ state, handlers, isSaving, inputStyle }: any) {
    const lbl = labelStyle; 
    const cpfStyle = state.isCpfValid ? inputStyle : "block w-full rounded-md border-red-300 shadow-sm text-red-900 h-8 text-xs bg-red-50 px-2 focus:ring-red-500 focus:border-red-500 font-bold";
    
    return (
       <div className="grid grid-cols-12 gap-3 gap-y-2">
             <h3 className="col-span-full font-bold text-xs text-blue-700 border-b border-slate-100 pb-1 mb-1 uppercase">Identificação</h3>
             <div className="col-span-8">
                 <label className={lbl}>Nome Completo *</label>
                 <input name="full_name" type="text" required value={state.fullName} onChange={e => handlers.setFullName(e.target.value)} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-4">
                 <label className={lbl}>Data Nasc.</label>
                 <input name="birth_date" type="date" value={state.birthDate} onChange={e => handlers.setBirthDate(e.target.value)} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-3 relative">
                  <label className={lbl}>CPF</label>
                  <input name="cpf" type="text" value={state.cpf} onChange={(e) => handlers.handleCpfChange(e.target.value)} className={cpfStyle} disabled={isSaving} />
                 {!state.isCpfValid && <span className="text-[9px] text-red-600 font-bold absolute -bottom-3 right-0">Inválido</span>}
             </div>
             <div className="col-span-3">
                 <label className={lbl}>RG</label>
                 <input name="rg" type="text" value={state.rg} onChange={e => handlers.setRg(e.target.value)} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-3">
                  <label className={lbl}>Celular</label>
                 <input name="fone_movel" type="text" value={state.foneMovel} onChange={(e) => handlers.setFoneMovel(maskPhone(e.target.value))} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-3">
               <label className={lbl}>Fixo</label>
                 <input name="phone" type="text" value={state.phone} onChange={(e) => handlers.setPhone(maskPhone(e.target.value))} className={inputStyle} disabled={isSaving} />
             </div>
             
             <h3 className="col-span-full font-bold text-xs text-blue-700 border-b border-slate-100 pb-1 mb-1 mt-2 uppercase">Endereço</h3>
             <div className="col-span-2">
                 <label className={lbl}>CEP</label>
                 <input name="cep" type="text" value={state.cep} onChange={(e) => handlers.setCep(e.target.value)} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-8">
                 <label className={lbl}>Logradouro</label>
                  <input name="rua" type="text" value={state.rua} onChange={e => handlers.setRua(e.target.value)} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-2">
                 <label className={lbl}>Nº</label>
                 <input name="numero" type="text" value={state.numero} onChange={e => handlers.setNumero(e.target.value)} className={inputStyle} disabled={isSaving} />
             </div>
            <div className="col-span-4">
                 <label className={lbl}>Bairro</label>
                 <input name="bairro" type="text" value={state.bairro} onChange={e => handlers.setBairro(e.target.value)} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-4">
                 <label className={lbl}>Complemento</label>
                  <input name="complemento" type="text" value={state.complemento} onChange={handlers.setComplemento} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-3">
                  <label className={lbl}>Cidade</label>
                 <input name="cidade" type="text" value={state.cidade} onChange={e => handlers.setCidade(e.target.value)} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-1">
                 <label className={lbl}>UF</label>
                 <input name="uf" type="text" value={state.uf} onChange={e => handlers.setUf(e.target.value)} maxLength={2} className={inputStyle} disabled={isSaving} />
             </div>
            <div className="col-span-12">
                 <label className={lbl}>E-mail</label>
                 <input name="email" type="email" value={state.email} onChange={e => handlers.setEmail(e.target.value)} className={inputStyle} disabled={isSaving} />
             </div>

             {/* --- NOVO LOCAL DA OBSERVAÇÃO --- */}
             <div className="col-span-12 mt-2 pt-2 border-t border-slate-100">
                <label className={`${lbl} text-red-600`}>Observações Gerais / Restrições</label>
                <textarea 
                    name="notes" 
                    rows={3} 
                    value={state.obsGeral} 
                    onChange={e => handlers.setObsGeral(e.target.value)} 
                    className="block w-full rounded-md border border-slate-300 shadow-sm text-xs p-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none placeholder:text-slate-400 font-bold text-slate-700" 
                    disabled={isSaving} 
                    placeholder="Digite aqui restrições de crédito ou notas importantes..." 
                />
             </div>
        </div>
   );
}

function AbaDetalhes({ state, handlers, isSaving, inputStyle }: any) {
    const lbl = labelStyle;
    return (
        <div className="grid grid-cols-12 gap-3 gap-y-2">
             <h3 className="col-span-full font-bold text-xs text-blue-700 border-b border-slate-100 pb-1 mb-1 uppercase">Filiação e Situação</h3>
             <div className="col-span-6">
                 <label className={lbl}>Pai</label>
                 <input name="pai" type="text" value={state.pai} onChange={e => handlers.setPai(e.target.value)} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-6">
                 <label className={lbl}>Mãe</label>
                 <input name="mae" type="text" value={state.mae} onChange={e => handlers.setMae(e.target.value)} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-6">
                 <label className={lbl}>Naturalidade</label>
                 <input name="naturalidade" type="text" value={state.naturalidade} onChange={handlers.setNaturalidade} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-6">
                <label className={lbl}>Estado Civil</label>
                <input name="estado_civil" type="text" value={state.estadoCivil} onChange={handlers.setEstadoCivil} className={inputStyle} disabled={isSaving} />
             </div>
             
             <h3 className="col-span-full font-bold text-xs text-blue-700 border-b border-slate-100 pb-1 mb-1 mt-2 uppercase">Cônjuge</h3>
             <div className="col-span-4">
                 <label className={lbl}>Nome</label>
                 <input name="conjuge_nome" type="text" value={state.conjugeNome} onChange={handlers.setConjugeNome} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-2">
                <label className={lbl}>Nasc.</label>
                  <input name="conjuge_nascimento" type="date" value={state.conjugeNascimento} onChange={handlers.setConjugeNascimento} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-2">
                  <label className={lbl}>Fone</label>
                  <input name="conjuge_fone" type="text" value={state.conjugeFone} onChange={(e) => handlers.setConjugeFone(maskPhone(e.target.value))} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-4">
                 <label className={lbl}>Trab. Cônjuge</label>
                 <input name="conjuge_trabalho" type="text" value={state.conjugeTrabalho} onChange={handlers.setConjugeTrabalho} className={inputStyle} disabled={isSaving} />
            </div>
             
             <h3 className="col-span-full font-bold text-xs text-blue-700 border-b border-slate-100 pb-1 mb-1 mt-2 uppercase">Dados Comerciais</h3>
             <div className="col-span-4">
                 <label className={lbl}>Empresa</label>
                 <input name="comercial_trabalho" type="text" value={state.comercialTrabalho} onChange={handlers.setComercialTrabalho} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-3">
                  <label className={lbl}>Cargo</label>
                 <input name="comercial_cargo" type="text" value={state.comercialCargo} onChange={handlers.setComercialCargo} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-2">
                 <label className={lbl}>Renda</label>
                 <input name="comercial_renda" type="text" value={state.comercialRenda} onChange={(e) => handlers.setComercialRenda(formatRenda(e.target.value))} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-3">
                 <label className={lbl}>Fone Coml.</label>
                 <input name="comercial_fone" type="text" value={state.comercialFone} onChange={(e) => handlers.setComercialFone(maskPhone(e.target.value))} className={inputStyle} disabled={isSaving} />
             </div>
             <div className="col-span-12">
                 <label className={lbl}>Endereço Coml.</label>
                 <input name="comercial_endereco" type="text" value={state.comercialEndereco} onChange={handlers.setComercialEndereco} className={inputStyle} disabled={isSaving} />
             </div>
        </div>
   );
}

function AbaReferencias({ state, handlers, isSaving, inputStyle }: any) {
    const lbl = labelStyle;
    return (
       <div className="grid grid-cols-12 gap-3 gap-y-2">
            <h3 className="col-span-full font-bold text-xs text-blue-700 border-b border-slate-100 pb-1 mb-1 uppercase">Referências Pessoais</h3>
             <div className="col-span-6">
                 <label className={lbl}>Ref. Pessoal 1</label>
                 <input name="ref_pessoal_1" type="text" value={state.refPessoal1} onChange={handlers.setRefPessoal1} className={inputStyle} disabled={isSaving} placeholder="Nome e Telefone" />
             </div>
            <div className="col-span-6">
                 <label className={lbl}>Ref. Pessoal 2</label>
                  <input name="ref_pessoal_2" type="text" value={state.refPessoal2} onChange={handlers.setRefPessoal2} className={inputStyle} disabled={isSaving} placeholder="Nome e Telefone" />
            </div>
            
            <h3 className="col-span-full font-bold text-xs text-blue-700 border-b border-slate-100 pb-1 mb-1 mt-2 uppercase">Referências Comerciais</h3>
            <div className="col-span-6">
                <label className={lbl}>Ref. Comercial 1</label>
                <input name="ref_comercio_1" type="text" value={state.refComercio1} onChange={handlers.setRefComercio1} className={inputStyle} disabled={isSaving} placeholder="Empresa e Telefone" />
            </div>
            <div className="col-span-6">
                <label className={lbl}>Ref. Comercial 2</label>
                <input name="ref_comercio_2" type="text" value={state.refComercio2} onChange={handlers.setRefComercio2} className={inputStyle} disabled={isSaving} placeholder="Empresa e Telefone" />
            </div>
       </div>
    );
}

function AbaDependentes({ customerId, storeId, dependentes, onUpdate, inputStyle }: { customerId?: number, storeId: number, dependentes: Dependente[], onUpdate: () => void, inputStyle: string }) {
  const [isSaving, startTransition] = useTransition();
  const [depNome, setDepNome] = useState('');
  const [depParentesco, setDepParentesco] = useState('Filho(a)');
  const [depNasc, setDepNasc] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleSave = async () => {
    if (!customerId) return;
    if (!depNome.trim()) { alert("Nome é obrigatório"); return; }

    const formData = new FormData();
    if (editingId) formData.set('id', editingId.toString());
    
    formData.set('store_id', storeId.toString());
    formData.set('customer_id', customerId.toString());
    formData.set('nome_completo', depNome);
    formData.set('parentesco', depParentesco);
    if (depNasc) formData.set('data_nascimento', depNasc);

    startTransition(async () => {
      const result = await saveDependente({ success: false, message: '' }, formData);
      if (result.success) {
        setDepNome('');
        setDepParentesco('Filho(a)');
        setDepNasc('');
        setEditingId(null); 
        onUpdate();
      } else {
        alert(result.message);
      }
    });
  };

  const handleEditClick = (dep: Dependente) => {
      setDepNome(dep.full_name);
      setDepParentesco(dep.parentesco || 'Filho(a)');
      setDepNasc(formatDate(dep.birth_date));
      setEditingId(dep.id);
  };
  
  const handleCancelEdit = () => {
      setDepNome('');
      setDepParentesco('Filho(a)');
      setDepNasc('');
      setEditingId(null);
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Remover este dependente?")) return;
    const res = await deleteDependente(id);
    if (res.success) onUpdate(); else alert(res.message);
  };

  if (!customerId) {
    return <div className="flex h-full items-center justify-center text-slate-400 text-sm italic p-10">Salve o cliente titular primeiro para adicionar dependentes.</div>;
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className={`p-4 rounded-xl border shadow-sm transition-colors ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
        <h4 className={`text-xs font-bold uppercase mb-3 flex items-center gap-2 ${editingId ? 'text-amber-700' : 'text-blue-700'}`}>
            {editingId ? <><Pencil className="h-4 w-4"/> Editando Dependente</> : <><UserPlus className="h-4 w-4"/> Adicionar Dependente</>}
        </h4>
        
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className={labelStyle}>Nome Completo</label>
            <input value={depNome} onChange={e => setDepNome(e.target.value)} className={inputStyle} placeholder="Nome do paciente" />
          </div>
          <div className="w-1/4">
             <label className={labelStyle}>Parentesco</label>
             <select value={depParentesco} onChange={e => setDepParentesco(e.target.value)} className={inputStyle}>
                <option value="Filho(a)">Filho(a)</option>
                <option value="Cônjuge">Cônjuge</option>
                <option value="Pai/Mãe">Pai/Mãe</option>
                <option value="Outro">Outro</option>
             </select>
          </div>
          <div className="w-1/4">
             <label className={labelStyle}>Nascimento</label>
             <input type="date" value={depNasc} onChange={e => setDepNasc(e.target.value)} className={inputStyle} />
          </div>
          <button type="button" onClick={handleSave} disabled={isSaving} className={`h-8 px-4 rounded-lg text-xs font-bold text-white flex items-center gap-1 shadow-sm transition-transform active:scale-95 ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}>
             {isSaving ? <Loader2 className="h-3 w-3 animate-spin"/> : <Save className="h-3 w-3"/>} {editingId ? 'Atualizar' : 'Adicionar'}
          </button>
          {editingId && (
              <button type="button" onClick={handleCancelEdit} className="h-8 px-2 rounded-lg text-slate-500 hover:bg-slate-100 border border-slate-200" title="Cancelar"><X className="h-4 w-4"/></button>
          )}
        </div>
      </div>

      <div className="space-y-2">
           {dependentes.length === 0 ? (
             <p className="text-center text-slate-400 text-xs py-4">Nenhum dependente cadastrado.</p>
           ) : (
             dependentes.map(dep => (
               <div key={dep.id} className={`flex justify-between items-center p-3 border rounded-xl bg-white shadow-sm transition-colors ${editingId === dep.id ? 'border-amber-400 ring-1 ring-amber-400' : 'border-slate-100 hover:border-blue-200'}`}>
                  <div className="flex-1">
                    <p className="font-bold text-slate-700 text-sm">{dep.full_name}</p>
                    <div className="flex gap-3 mt-1">
                       <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold uppercase">{dep.parentesco || 'Outro'}</span>
                       {dep.birth_date && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Calendar className="h-3 w-3"/> {formatDate(dep.birth_date)}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                       <button type="button" onClick={() => handleEditClick(dep)} className="text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-colors" title="Editar"><Pencil className="h-4 w-4"/></button>
                       <button type="button" onClick={() => handleDelete(dep.id)} className="text-slate-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors" title="Remover"><Trash2 className="h-4 w-4"/></button>
                  </div>
               </div>
             ))
           )}
      </div>
    </div>
  );
}