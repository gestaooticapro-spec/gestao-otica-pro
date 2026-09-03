'use client';

import { useState, useEffect, useTransition } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    Loader2, Save, Trash2, Search, X,
    ArrowLeftToLine, ArrowRightToLine, ChevronLeft, ChevronRight,
    User, ClipboardList, ScrollText, Users2, UserPlus, Calendar, Pencil,
    AlertTriangle, Gem, Trophy, Medal, ArrowLeft
} from 'lucide-react';
import { Database } from '@/lib/database.types';
import { CustomerWhatsAppMessagePreferences, getCustomerWhatsAppMessagePreferences, saveCustomerDetails, deleteCustomer } from '@/lib/actions/customer.actions';
import { searchCustomersByName, getCustomerById, fetchDefaultCustomers } from '@/lib/actions/vendas.actions';
import { getDependentes, deleteDependente, saveDependente } from '@/lib/actions/dependents.actions';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import CustomerPrescriptionHistoryModal from '@/components/modals/CustomerPrescriptionHistoryModal';
import { maskCpfCnpj } from '@/lib/customer-document';

type Customer = Database['public']['Tables']['customers']['Row'];
type Dependente = Database['public']['Tables']['dependentes']['Row'];
type ActiveTab = 'principal' | 'detalhes' | 'referencias' | 'mensagens' | 'dependentes';
type EditorMode = 'empty' | 'create' | 'edit';

// --- HELPERS ---
const safeStr = (v: any): string => { if (v == null) return ''; if (typeof v === 'object') return JSON.stringify(v) !== '{}' ? Object.values(v).filter(Boolean).join(' ') : ''; return String(v); };
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
const maskCep = (value: string) => value.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').substring(0, 9);
const detectPhoneCountry = (digits: string): 'PY' | 'BR' => {
    if (digits.startsWith('595')) return 'PY';
    if (digits.startsWith('09') && digits.length <= 10) return 'PY';
    return 'BR';
};
const maskPhone = (value: string, normalize = false) => {
    const hasPlus = value.trimStart().startsWith('+');
    let digits = value.replace(/\D/g, '');
    if (!digits) return '';

    const country = hasPlus ? (digits.startsWith('595') ? 'PY' : 'BR') : detectPhoneCountry(digits);

    if (country === 'PY') {
        if (digits.startsWith('0')) digits = '595' + digits.substring(1);
        if (!digits.startsWith('595')) digits = '595' + digits;
        return ('+' + digits
            .replace(/^(595)(\d)/, '$1 $2')
            .replace(/^(595 \d{3})(\d)/, '$1 $2')
            .replace(/^(595 \d{3} \d{3})(\d)/, '$1 $2')
        ).substring(0, 16);
    }

    // Normalize legacy numbers only on blur (when normalize=true), not during typing
    if (normalize) {
        if (digits.length === 8) digits = '449' + digits;
        else if (digits.length === 10) digits = digits.slice(0, 2) + '9' + digits.slice(2);
    }

    return digits
        .replace(/^(\d{2})(\d)/g, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .substring(0, 15);
};
const formatRenda = (value: string) => { let v = value.replace(/\D/g, ''); if (!v) return '0,00'; let i = v.slice(0, -2); let d = v.slice(-2); if (i.length > 3) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, "."); return `${i || '0'},${d}`; };

type ViaCepResponse = {
    erro?: boolean;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
    complemento?: string;
    ibge?: string;
};

// --- DESIGN SYSTEM DOCTAS GLASS ---
const labelStyle = "block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider";
const inputStyle = "block w-full rounded-xl border border-white/10 bg-black/20 shadow-sm text-slate-200 h-9 text-xs px-3 focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 font-bold placeholder:font-normal placeholder:text-slate-600 disabled:opacity-50 transition-all outline-none";
const cardStyle = "bg-white/5 p-4 rounded-xl shadow-sm border border-white/10 backdrop-blur-md mb-3";

// Função auxiliar para desenhar o selo
const getRankingBadge = (ranking: string | null) => {
    if (!ranking) return null;
    const r = ranking.toLowerCase();

    if (r === 'diamante') return (
        <span className="inline-flex items-center gap-1 text-[9px] bg-cyan-500/10 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold ml-2 shadow-[0_0_10px_rgba(34,211,238,0.1)]">
            <Gem className="h-3 w-3" /> Diamante
        </span>
    );
    if (r === 'ouro') return (
        <span className="inline-flex items-center gap-1 text-[9px] bg-yellow-500/10 text-yellow-300 px-1.5 py-0.5 rounded border border-yellow-500/20 font-bold ml-2 shadow-[0_0_10px_rgba(250,204,21,0.1)]">
            <Trophy className="h-3 w-3" /> Ouro
        </span>
    );
    if (r === 'prata') return (
        <span className="inline-flex items-center gap-1 text-[9px] bg-slate-500/10 text-slate-300 px-1.5 py-0.5 rounded border border-slate-500/20 font-bold ml-2">
            <Medal className="h-3 w-3" /> Prata
        </span>
    );
    return null;
};

export default function StoreClientPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlClientId = searchParams.get('id');
    const { preference } = useBackgroundPreference();

    const storeId = parseInt(params.storeId as string, 10);

    const [loading, setLoading] = useState(true);
    const [isSaving, startSaveTransition] = useTransition();
    const [isDeleting, startDeleteTransition] = useTransition();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [editorMode, setEditorMode] = useState<EditorMode>('empty');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ActiveTab>('principal');
    const [isPrescriptionHistoryOpen, setIsPrescriptionHistoryOpen] = useState(false);

    const [dependentesList, setDependentesList] = useState<Dependente[]>([]);

    // Busca integrada na lista lateral
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, startSearchTransition] = useTransition();

    // Formulário Principal
    const [fullName, setFullName] = useState('');
    const [rg, setRg] = useState('');
    const [cpf, setCpf] = useState('');
    const [isCpfValid, setIsCpfValid] = useState(true);
    const [personType, setPersonType] = useState<'PF' | 'PJ'>('PF');
    const [razaoSocial, setRazaoSocial] = useState('');
    const [nomeFantasia, setNomeFantasia] = useState('');
    const [cnpj, setCnpj] = useState('');
    const [inscricaoEstadual, setInscricaoEstadual] = useState('');
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
    const [codigoMunicipioIbge, setCodigoMunicipioIbge] = useState('');
    const [isCepLoading, setIsCepLoading] = useState(false);
    const [cepMessage, setCepMessage] = useState<string | null>(null);
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
    const [whatsAppPreferences, setWhatsAppPreferences] = useState<CustomerWhatsAppMessagePreferences | null>(null);
    const [installmentRemindersEnabled, setInstallmentRemindersEnabled] = useState(true);
    const [postSaleFollowupsEnabled, setPostSaleFollowupsEnabled] = useState(true);

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
                    setEditorMode('edit');
                } else {
                    const listResult = await fetchDefaultCustomers(storeId);
                    if (listResult.success && listResult.data) {
                        setCustomers(listResult.data as Customer[]);
                        setCurrentIndex(-1); // NOVO: Abre com formulário vazio
                    }
                }
            } else {
                const result = await fetchDefaultCustomers(storeId);
                if (result.success && result.data) {
                    const lista = result.data as Customer[];
                    setCustomers(lista);
                    setCurrentIndex(-1); // NOVO: Abre com formulário vazio
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
        setPersonType(currentCustomer?.person_type === 'PJ' ? 'PJ' : 'PF');
        setRazaoSocial(currentCustomer?.razao_social ?? (currentCustomer?.person_type === 'PJ' ? currentCustomer?.full_name ?? '' : ''));
        setNomeFantasia(currentCustomer?.nome_fantasia ?? '');
        setCnpj(maskCpfCnpj(currentCustomer?.cnpj ?? ''));
        setInscricaoEstadual(currentCustomer?.inscricao_estadual ?? '');
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
        setCep(maskCep(currentCustomer?.cep ?? ''));
        setCodigoMunicipioIbge(currentCustomer?.codigo_municipio_ibge ?? '');
        setCepMessage(null);
        setPhone(maskPhone(currentCustomer?.phone ?? ''));
        setFoneMovel(maskPhone(currentCustomer?.fone_movel ?? ''));
        setEmail(currentCustomer?.email ?? '');
        setComercialTrabalho(safeStr(currentCustomer?.comercial_trabalho));
        setComercialCargo(currentCustomer?.comercial_cargo ?? '');
        setComercialEndereco(currentCustomer?.comercial_endereco ?? '');
        setComercialFone(maskPhone(currentCustomer?.comercial_fone ?? ''));
        setComercialRenda(formatRenda(currentCustomer?.comercial_renda?.toString() ?? ''));
        setObsComercial(currentCustomer?.obs_comercial ?? '');
        setRefComercio1(safeStr(currentCustomer?.ref_comercio_1));
        setRefComercio2(safeStr(currentCustomer?.ref_comercio_2));
        setRefPessoal1(safeStr(currentCustomer?.ref_pessoal_1));
        setRefPessoal2(safeStr(currentCustomer?.ref_pessoal_2));
        setFaixaEtaria(currentCustomer?.faixa_etaria ?? '');
        setObsGeral(currentCustomer?.notes ?? currentCustomer?.obs_debito ?? '');
    }, [currentCustomer, currentIndex]);

    useEffect(() => {
        let active = true;
        getCustomerWhatsAppMessagePreferences(storeId, currentCustomer?.id ?? null, currentCustomer?.fone_movel || currentCustomer?.phone || null)
            .then((preferences) => {
                if (!active) return;
                setWhatsAppPreferences(preferences);
                setInstallmentRemindersEnabled(preferences.installmentRemindersEnabled);
                setPostSaleFollowupsEnabled(preferences.postSaleFollowupsEnabled);
            })
            .catch((error) => {
                console.error('Não foi possível carregar as preferências de WhatsApp:', error);
                if (active) setWhatsAppPreferences(null);
            });
        return () => { active = false; };
    }, [storeId, currentCustomer?.id]);

    useEffect(() => {
        if (!loading && currentIndex === -1 && !currentCustomer && editorMode !== 'create') {
            setEditorMode('empty');
        }
    }, [loading, currentIndex, currentCustomer, editorMode]);

    // --- HANDLERS ---
    const handleCpfChange = (val: string) => {
        const masked = maskCPF(val);
        setCpf(masked);
        const numbersOnly = masked.replace(/\D/g, '');
        if (numbersOnly.length === 0) setIsCpfValid(true);
        else if (numbersOnly.length === 11) setIsCpfValid(validaCPF(masked));
        else setIsCpfValid(false);
    };
    const handleCnpjChange = (val: string) => setCnpj(maskCpfCnpj(val));

    const handleCepChange = (val: string) => {
        setCep(maskCep(val));
        setCepMessage(null);
    };

    const handleCepLookup = async () => {
        const cleanCep = cep.replace(/\D/g, '');
        if (cleanCep.length !== 8) {
            setCepMessage('Informe um CEP com 8 digitos.');
            return;
        }

        setIsCepLoading(true);
        setCepMessage(null);

        try {
            const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            if (!response.ok) throw new Error('Falha ao consultar CEP.');

            const data = await response.json() as ViaCepResponse;
            if (data.erro) {
                setCepMessage('CEP nao encontrado.');
                return;
            }

            setRua(data.logradouro ?? '');
            setBairro(data.bairro ?? '');
            setCidade(data.localidade ?? '');
            setUf((data.uf ?? '').toUpperCase());
            setCodigoMunicipioIbge((data.ibge ?? '').replace(/\D/g, ''));
            if (data.complemento) setComplemento(data.complemento);
            setCepMessage('Endereco encontrado.');
        } catch (error) {
            console.error('Erro ao consultar CEP:', error);
            setCepMessage('Nao foi possivel consultar o CEP.');
        } finally {
            setIsCepLoading(false);
        }
    };

    const handleCloseEditor = () => {
        setCurrentIndex(-1);
        setEditorMode('empty');
        setActiveTab('principal');
    };

    const handleSaveSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (editorMode === 'empty') return;
        const formData = new FormData(e.currentTarget);

        // Garantir que TODOS os campos do state sejam enviados,
        // independente de qual aba está ativa (renderização condicional)
        formData.set('full_name', personType === 'PJ' ? razaoSocial : fullName);
        formData.set('person_type', personType);
        formData.set('razao_social', personType === 'PJ' ? razaoSocial : '');
        formData.set('nome_fantasia', personType === 'PJ' ? nomeFantasia : '');
        formData.set('rg', rg);
        formData.set('cpf', cpf.replace(/\D/g, ''));
        formData.set('cnpj', cnpj.replace(/\D/g, ''));
        formData.set('inscricao_estadual', inscricaoEstadual.replace(/\D/g, ''));
        formData.set('phone', phone.replace(/\D/g, ''));
        formData.set('fone_movel', foneMovel.replace(/\D/g, ''));
        formData.set('email', email);
        formData.set('naturalidade', naturalidade);
        formData.set('estado_civil', estadoCivil);
        formData.set('rua', rua);
        formData.set('numero', numero);
        formData.set('bairro', bairro);
        formData.set('complemento', complemento);
        formData.set('cidade', cidade);
        formData.set('uf', uf);
        formData.set('cep', cep.replace(/\D/g, ''));
        formData.set('codigo_municipio_ibge', codigoMunicipioIbge.replace(/\D/g, ''));
        formData.set('faixa_etaria', faixaEtaria);
        formData.set('notes', obsGeral);
        formData.set('obs_debito', obsGeral);
        formData.set('whatsapp_preferences_enabled', String(Boolean(whatsAppPreferences?.available)));
        formData.set('installment_reminders_available', String(Boolean(whatsAppPreferences?.installmentRemindersAvailable)));
        formData.set('post_sale_followups_available', String(Boolean(whatsAppPreferences?.postSaleFollowupsAvailable)));
        formData.set('installment_reminders_enabled', String(installmentRemindersEnabled));
        formData.set('post_sale_followups_enabled', String(postSaleFollowupsEnabled));

        // Aba Detalhes
        formData.set('pai', pai);
        formData.set('mae', mae);
        formData.set('conjuge_nome', conjugeNome);
        formData.set('conjuge_fone', conjugeFone.replace(/\D/g, ''));
        formData.set('conjuge_naturalidade', conjugeNaturalidade);
        formData.set('conjuge_trabalho', conjugeTrabalho);
        formData.set('comercial_trabalho', comercialTrabalho);
        formData.set('comercial_cargo', comercialCargo);
        formData.set('comercial_endereco', comercialEndereco);
        formData.set('comercial_fone', comercialFone.replace(/\D/g, ''));
        formData.set('comercial_renda', comercialRenda.replace(/\./g, '').replace(',', '.'));
        formData.set('obs_comercial', obsComercial);

        // Aba Referências
        formData.set('ref_pessoal_1', refPessoal1);
        formData.set('ref_pessoal_2', refPessoal2);
        formData.set('ref_comercio_1', refComercio1);
        formData.set('ref_comercio_2', refComercio2);

        if (birthDate) formData.set('birth_date', birthDate);
        if (conjugeNascimento) formData.set('conjuge_nascimento', conjugeNascimento);

        startSaveTransition(async () => {
            const result = await saveCustomerDetails({ success: false, message: '' }, formData);
            if (result.success && result.data) {
                alert(result.message);
                if (currentIndex === -1) {
                    handleCloseEditor();
                    reloadDefaultList();
                }
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
                const result = await deleteCustomer(currentCustomer.id, storeId, `/dashboard/loja/${storeId}/clientes`);
                if (result.success) {
                    alert('Cliente deletado.');
                    handleCloseEditor();
                    reloadDefaultList();
                } else { alert(result.message); }
            });
        }
    };

    const handleNavigate = (direction: 'first' | 'prev' | 'next' | 'last' | 'new') => {
        if (direction === 'new') {
            handleNew();
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
        setEditorMode('edit');
    };

    const handleNew = () => {
        setCurrentIndex(-1);
        setEditorMode('create');
        setActiveTab('principal');
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
        setEditorMode('edit');
    };

    const baseButtonStyle = "px-3 py-1.5 text-xs font-bold rounded-lg shadow-sm disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-1 border border-white/5";

    return (
        <div className="relative flex h-[calc(100vh-64px)] overflow-hidden bg-slate-950 font-sans">

            {/* BACKGROUND PREMIUM (Controlado pelo preference) */}
            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 pointer-events-none ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <img src="/cliente.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-50 blur-[2px]" />
                <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-950/40 via-slate-950/60 to-slate-950/90" />
            </div>

            {/* --- COLUNA ESQUERDA (30%) --- */}
            <div className="w-1/3 flex flex-col border-r border-white/10 bg-slate-900/40 backdrop-blur-md z-10 shadow-xl">

                {/* Header de Busca (Gradiente) */}
                <div className="bg-gradient-to-br from-indigo-900/60 to-slate-900/60 p-4 flex flex-col gap-3 shadow-md z-20 border-b border-indigo-500/20 backdrop-blur-md">
                    <div className="flex justify-between items-center text-indigo-300">
                        <h2 className="font-bold text-xs flex items-center gap-2 tracking-wider">
                            <button onClick={() => router.back()} className="p-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-md text-indigo-300 hover:text-indigo-200 transition-all active:scale-95" title="Voltar"><ArrowLeft className="h-4 w-4" /></button>
                            <Users2 className="h-4 w-4" /> LISTA DE CLIENTES
                        </h2>
                        <span className="text-[10px] bg-indigo-500/20 px-2 py-0.5 rounded-full font-bold border border-indigo-500/30 text-indigo-200 shadow-sm">
                            {customers.length}
                        </span>
                    </div>
                    <div className="relative group">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Buscar por nome, fantasia, CPF ou CNPJ..."
                            className="w-full h-10 pl-10 pr-3 rounded-xl border border-white/10 bg-black/40 shadow-inner text-slate-200 placeholder:text-slate-500 focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 font-bold text-xs transition-all outline-none group-hover:border-white/20 backdrop-blur-sm"
                        />
                        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                        {isSearching && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-indigo-500" />}
                    </div>
                </div>

                {/* Lista Rolável */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-transparent p-2 space-y-1">
                    {loading ? (
                        <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
                    ) : customers.length === 0 ? (
                        <div className="text-center p-10 text-slate-600">
                            <User className="h-10 w-10 mx-auto mb-2 opacity-20" />
                            <p className="text-xs">Nenhum cliente encontrado.</p>
                        </div>
                    ) : (
                        customers.map((c, idx) => (
                            <div
                                key={c.id || idx}
                                onClick={() => handleSelectCustomer(c, idx)}
                                className={`p-3 rounded-xl cursor-pointer transition-all flex justify-between items-center group relative overflow-hidden backdrop-blur-sm
                                ${currentIndex === idx
                                        ? 'bg-indigo-500/30 border border-indigo-500/40 shadow-lg shadow-indigo-500/10'
                                        : 'bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/10'}
                            `}
                            >
                                <div className="min-w-0 relative z-10">
                                    <p className={`font-bold text-xs truncate ${currentIndex === idx ? 'text-indigo-200' : 'text-slate-300 group-hover:text-white'}`}>
                                        {c.person_type === 'PJ' ? (c.razao_social || c.full_name) : c.full_name}
                                    </p>
                                    <div className="flex items-center mt-1">
                                        {getRankingBadge(c.ranking)}
                                        <p className="text-[10px] text-slate-500 ml-2 flex items-center gap-1 group-hover:text-slate-400">
                                            {c.person_type === 'PJ' ? (c.cnpj ? `CNPJ: ${maskCpfCnpj(c.cnpj)}` : 'Sem CNPJ') : (c.cpf ? `CPF: ${maskCpfCnpj(c.cpf)}` : 'Sem CPF')}
                                            {c.obs_debito && <AlertTriangle className="h-3 w-3 text-red-400 ml-1 dropshadow-sm" />}
                                        </p>
                                    </div>
                                </div>
                                <ChevronRight className={`h-3 w-3 text-slate-600 group-hover:text-indigo-400 transition-transform group-hover:translate-x-1 ${currentIndex === idx ? 'text-indigo-400' : ''}`} />

                                {currentIndex === idx && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-transparent pointer-events-none" />
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* --- COLUNA DIREITA (70%) --- */}
            <div className="flex-1 flex flex-col bg-slate-900/40 relative overflow-hidden z-10 backdrop-blur-sm">

                {/* Header Actions & Toggle */}
                <div className="absolute top-4 right-4 z-50">
                    <BackgroundToggle />
                </div>

                <form onSubmit={handleSaveSubmit} className="flex flex-col h-full bg-transparent">
                    <input type="hidden" name="store_id" value={storeId} />
                    {currentCustomer?.id && <input type="hidden" name="id" value={currentCustomer.id} />}

                    {/* Header das Abas */}
                    <div className="bg-slate-900/60 border-b border-white/10 px-4 pt-3 shadow-xl shadow-black/20 flex-shrink-0 z-20 backdrop-blur-md">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap gap-4">
                                <TabButton label="Dados Pessoais" icon={User} isActive={activeTab === 'principal'} onClick={() => setActiveTab('principal')} />
                                <TabButton label="Detalhes" icon={ClipboardList} isActive={activeTab === 'detalhes'} onClick={() => setActiveTab('detalhes')} />
                                <TabButton label="Ref. / Obs" icon={ScrollText} isActive={activeTab === 'referencias'} onClick={() => setActiveTab('referencias')} />
                                {whatsAppPreferences?.available && (
                                    <TabButton label="Mensagens" icon={ScrollText} isActive={activeTab === 'mensagens'} onClick={() => setActiveTab('mensagens')} />
                                )}
                                {currentCustomer?.id && (
                                    <TabButton label={`Dependentes (${dependentesList.length})`} icon={Users2} isActive={activeTab === 'dependentes'} onClick={() => setActiveTab('dependentes')} />
                                )}
                            </div>

                            {currentCustomer?.id && (
                                <button
                                    type="button"
                                    onClick={() => setIsPrescriptionHistoryOpen(true)}
                                    className="mb-3 inline-flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-sky-200 transition-colors hover:bg-sky-500/20 hover:text-white"
                                >
                                    <ScrollText className="h-4 w-4" />
                                    Historico de Graus
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Conteúdo com Scroll */}
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        <div className="max-w-4xl mx-auto">
                            {errorMessage && (
                                <div className="bg-red-500/10 border-l-4 border-red-500 text-red-400 p-3 mb-4 rounded-r-lg text-xs flex items-center gap-2 shadow-lg backdrop-blur-sm">
                                    <AlertTriangle className="h-4 w-4" /> <strong>Erro:</strong> {errorMessage}
                                </div>
                            )}

                            {editorMode === 'empty' ? (
                                <div className={`${cardStyle} min-h-[320px] flex items-center justify-center`}>
                                    <div className="max-w-md text-center">
                                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10">
                                            <Users2 className="h-6 w-6 text-indigo-300" />
                                        </div>
                                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-200">
                                            Nenhum cliente aberto
                                        </h3>
                                        <p className="mt-3 text-sm leading-6 text-slate-400">
                                            Selecione um cliente da lista para editar ou clique em <span className="font-bold text-slate-200">Novo</span> para iniciar um cadastro vazio.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {activeTab === 'principal' && (
                                        <div className={cardStyle}>
                                            <AbaPrincipal
                                                state={{ fullName, personType, razaoSocial, nomeFantasia, cpf, cnpj, inscricaoEstadual, rg, birthDate, faixaEtaria, estadoCivil, rua, numero, bairro, complemento, cidade, uf, cep, phone, foneMovel, email, isCpfValid, obsGeral, isCepLoading, cepMessage }}
                                                handlers={{ setFullName, setPersonType, setRazaoSocial, setNomeFantasia, handleCpfChange, handleCnpjChange, setInscricaoEstadual, setRg, setBirthDate, setFaixaEtaria, setEstadoCivil, setRua, setNumero, setBairro, setComplemento, setCidade, setUf, handleCepChange, handleCepLookup, setPhone, setFoneMovel, setEmail, setObsGeral }}
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
                                    {activeTab === 'mensagens' && whatsAppPreferences?.available && (
                                        <div className={cardStyle}>
                                            <AbaMensagens
                                                preferences={whatsAppPreferences}
                                                installmentRemindersEnabled={installmentRemindersEnabled}
                                                postSaleFollowupsEnabled={postSaleFollowupsEnabled}
                                                onInstallmentRemindersChange={setInstallmentRemindersEnabled}
                                                onPostSaleFollowupsChange={setPostSaleFollowupsEnabled}
                                                isSaving={isSaving}
                                            />
                                        </div>
                                    )}
                                    {activeTab === 'dependentes' && (
                                        <AbaDependentes
                                            customerId={currentCustomer?.id}
                                            storeId={storeId}
                                            dependentes={dependentesList}
                                            onUpdate={() => { if (currentCustomer?.id) getDependentes(currentCustomer.id).then(setDependentesList); }}
                                            inputStyle={inputStyle}
                                        />
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* RODAPÉ FIXO (Some na aba Dependentes) */}
                    {!isDepTab && (
                        <div className="bg-slate-900/80 border-t border-white/10 p-3 shadow-[0_-5px_20px_rgba(0,0,0,0.2)] flex justify-between items-center z-30 shrink-0 backdrop-blur-xl">
                            <div className="flex gap-1">
                                <button type="button" onClick={() => handleNavigate('first')} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors border border-white/5"><ArrowLeftToLine className="h-4 w-4" /></button>
                                <button type="button" onClick={() => handleNavigate('prev')} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors border border-white/5"><ChevronLeft className="h-4 w-4" /></button>
                                <span className="bg-black/40 text-slate-200 text-xs px-3 py-2 rounded-lg font-mono font-bold min-w-[70px] text-center border border-white/10 shadow-inner">
                                    {currentIndex === -1 ? (editorMode === 'create' ? 'NOVO' : '--') : `${currentIndex + 1} / ${customers.length}`}
                                </span>
                                <button type="button" onClick={() => handleNavigate('next')} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors border border-white/5"><ChevronRight className="h-4 w-4" /></button>
                                <button type="button" onClick={() => handleNavigate('last')} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors border border-white/5"><ArrowRightToLine className="h-4 w-4" /></button>
                            </div>

                            <div className="flex gap-2">
                                <button type="button" onClick={handleNew} disabled={isSaving} className={`${baseButtonStyle} bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 border-blue-500/30`}>
                                    <UserPlus className="h-4 w-4" /> Novo
                                </button>
                                {currentIndex !== -1 && (
                                    <button type="button" onClick={handleDelete} disabled={isDeleting} className={`${baseButtonStyle} bg-red-500/10 text-red-300 hover:bg-red-500/20 border-red-500/30`}>
                                        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Excluir
                                    </button>
                                )}
                                {editorMode !== 'empty' && (
                                    <button type="submit" disabled={isSaving} className={`${baseButtonStyle} bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 border-transparent px-6 border border-white/10`}>
                                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> SALVAR</>}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </form>
            </div>

            <CustomerPrescriptionHistoryModal
                isOpen={isPrescriptionHistoryOpen}
                onClose={() => setIsPrescriptionHistoryOpen(false)}
                customerId={currentCustomer?.id ?? null}
                customerName={currentCustomer?.full_name ?? ''}
                storeId={storeId}
            />
        </div>
    );
}

function TabButton({ label, icon: Icon, isActive, onClick }: { label: string, icon: React.ElementType, isActive: boolean, onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className={`flex items-center gap-2 pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${isActive ? 'text-indigo-300 border-indigo-400 scale-105' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
            <Icon className={`h-4 w-4 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} /> {label}
        </button>
    );
}

function AbaPrincipal({ state, handlers, isSaving, inputStyle }: any) {
    const lbl = labelStyle;
    const cpfStyle = state.isCpfValid ? inputStyle : "block w-full rounded-xl border-2 border-red-500/50 shadow-sm text-red-400 h-9 text-xs bg-red-500/10 px-3 focus:ring-red-500 focus:border-red-500 font-bold outline-none";

    return (
        <div className="grid grid-cols-12 gap-3 gap-y-3">
            <h3 className="col-span-full font-bold text-[10px] text-indigo-400 border-b border-white/5 pb-1 mb-1 uppercase tracking-widest flex items-center gap-2 opacity-80">
                <div className="h-1 w-1 bg-indigo-500 rounded-full" /> Identificação
            </h3>
            <div className="col-span-12 flex gap-3 text-xs font-bold text-slate-300">
                <label><input type="radio" checked={state.personType === 'PF'} onChange={() => handlers.setPersonType('PF')} disabled={isSaving} /> Pessoa física</label>
                <label><input type="radio" checked={state.personType === 'PJ'} onChange={() => handlers.setPersonType('PJ')} disabled={isSaving} /> Pessoa jurídica</label>
            </div>
            <div className="col-span-8">
                <label className={lbl}>{state.personType === 'PJ' ? 'Razao social *' : 'Nome Completo *'}</label>
                <input name="full_name" type="text" required value={state.personType === 'PJ' ? state.razaoSocial : state.fullName} onChange={e => state.personType === 'PJ' ? handlers.setRazaoSocial(e.target.value) : handlers.setFullName(e.target.value)} className={inputStyle} disabled={isSaving} />
            </div>
            {state.personType === 'PJ' && <div className="col-span-8"><label className={lbl}>Nome fantasia</label><input name="nome_fantasia" type="text" value={state.nomeFantasia} onChange={e => handlers.setNomeFantasia(e.target.value)} className={inputStyle} disabled={isSaving} /></div>}
            <div className="col-span-4">
                <label className={lbl}>Data Nasc.</label>
                <input name="birth_date" type="date" value={state.birthDate} onChange={e => handlers.setBirthDate(e.target.value)} className={inputStyle} disabled={isSaving} />
            </div>
            <div className="col-span-3 relative">
                <label className={lbl}>{state.personType === 'PJ' ? 'CNPJ *' : 'CPF'}</label>
                <input name={state.personType === 'PJ' ? 'cnpj' : 'cpf'} type="text" value={state.personType === 'PJ' ? state.cnpj : state.cpf} onChange={(e) => state.personType === 'PJ' ? handlers.handleCnpjChange(e.target.value) : handlers.handleCpfChange(e.target.value)} className={cpfStyle} disabled={isSaving} />
                {!state.isCpfValid && <span className="text-[9px] text-red-400 font-bold absolute -bottom-3 right-0 drop-shadow-md">Inválido</span>}
            </div>
            {state.personType === 'PJ' && <div className="col-span-3"><label className={lbl}>Inscrição estadual</label><input name="inscricao_estadual" type="text" value={state.inscricaoEstadual} onChange={e => handlers.setInscricaoEstadual(e.target.value)} className={inputStyle} disabled={isSaving} /></div>}
            <div className="col-span-3">
                <label className={lbl}>RG</label>
                <input name="rg" type="text" value={state.rg} onChange={e => handlers.setRg(e.target.value)} className={inputStyle} disabled={isSaving} />
            </div>
            <div className="col-span-3">
                <label className={lbl}>Celular</label>
                <input name="fone_movel" type="text" value={state.foneMovel} onChange={(e) => handlers.setFoneMovel(maskPhone(e.target.value))} onBlur={(e) => handlers.setFoneMovel(maskPhone(e.target.value, true))} className={inputStyle} disabled={isSaving} />
            </div>
            <div className="col-span-3">
                <label className={lbl}>Fixo</label>
                <input name="phone" type="text" value={state.phone} onChange={(e) => handlers.setPhone(maskPhone(e.target.value))} onBlur={(e) => handlers.setPhone(maskPhone(e.target.value, true))} className={inputStyle} disabled={isSaving} />
            </div>

            <h3 className="col-span-full font-bold text-[10px] text-indigo-400 border-b border-white/5 pb-1 mb-1 mt-3 uppercase tracking-widest flex items-center gap-2 opacity-80">
                <div className="h-1 w-1 bg-indigo-500 rounded-full" /> Endereço
            </h3>
            <div className="col-span-2">
                <label className={lbl}>CEP</label>
                <div className="flex gap-1">
                    <input
                        name="cep"
                        type="text"
                        value={state.cep}
                        onChange={(e) => handlers.handleCepChange(e.target.value)}
                        onBlur={() => {
                            if (state.cep.replace(/\D/g, '').length === 8) handlers.handleCepLookup();
                        }}
                        className={inputStyle}
                        disabled={isSaving || state.isCepLoading}
                    />
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handlers.handleCepLookup}
                        disabled={isSaving || state.isCepLoading}
                        className="h-9 w-9 shrink-0 rounded-xl border border-white/10 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50 transition-all flex items-center justify-center"
                        title="Buscar endereco pelo CEP"
                    >
                        {state.isCepLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    </button>
                </div>
                {state.cepMessage && (
                    <span className={`text-[9px] font-bold mt-1 block ${state.cepMessage === 'Endereco encontrado.' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {state.cepMessage}
                    </span>
                )}
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
                <input name="complemento" type="text" value={state.complemento} onChange={e => handlers.setComplemento(e.target.value)} className={inputStyle} disabled={isSaving} />
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

            <div className="col-span-12 mt-2 pt-2 border-t border-white/5">
                <label className={`${lbl} text-red-400`}>Observações Gerais / Restrições</label>
                <textarea
                    name="notes"
                    rows={3}
                    value={state.obsGeral}
                    onChange={e => handlers.setObsGeral(e.target.value)}
                    className="block w-full rounded-xl border border-white/10 shadow-sm text-xs p-3 bg-white/5 focus:ring-1 focus:ring-red-500/50 focus:border-red-500/50 resize-none placeholder:text-slate-600 font-bold text-slate-300 outline-none"
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
        <div className="grid grid-cols-12 gap-3 gap-y-3">
            <h3 className="col-span-full font-bold text-[10px] text-indigo-400 border-b border-white/5 pb-1 mb-1 uppercase tracking-widest flex items-center gap-2 opacity-80">
                <div className="h-1 w-1 bg-indigo-500 rounded-full" /> Filiação e Situação
            </h3>
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
                <input name="naturalidade" type="text" value={state.naturalidade} onChange={e => handlers.setNaturalidade(e.target.value)} className={inputStyle} disabled={isSaving} />
            </div>
            <div className="col-span-6">
                <label className={lbl}>Estado Civil</label>
                <input name="estado_civil" type="text" value={state.estadoCivil} onChange={e => handlers.setEstadoCivil(e.target.value)} className={inputStyle} disabled={isSaving} />
            </div>

            <h3 className="col-span-full font-bold text-[10px] text-indigo-400 border-b border-white/5 pb-1 mb-1 mt-3 uppercase tracking-widest flex items-center gap-2 opacity-80">
                <div className="h-1 w-1 bg-indigo-500 rounded-full" /> Cônjuge
            </h3>
            <div className="col-span-4">
                <label className={lbl}>Nome</label>
                <input name="conjuge_nome" type="text" value={state.conjugeNome} onChange={e => handlers.setConjugeNome(e.target.value)} className={inputStyle} disabled={isSaving} />
            </div>
            <div className="col-span-2">
                <label className={lbl}>Nasc.</label>
                <input name="conjuge_nascimento" type="date" value={state.conjugeNascimento} onChange={e => handlers.setConjugeNascimento(e.target.value)} className={inputStyle} disabled={isSaving} />
            </div>
            <div className="col-span-2">
                <label className={lbl}>Fone</label>
                <input name="conjuge_fone" type="text" value={state.conjugeFone} onChange={(e) => handlers.setConjugeFone(maskPhone(e.target.value))} onBlur={(e) => handlers.setConjugeFone(maskPhone(e.target.value, true))} className={inputStyle} disabled={isSaving} />
            </div>
            <div className="col-span-4">
                <label className={lbl}>Trab. Cônjuge</label>
                <input name="conjuge_trabalho" type="text" value={state.conjugeTrabalho} onChange={e => handlers.setConjugeTrabalho(e.target.value)} className={inputStyle} disabled={isSaving} />
            </div>

            <h3 className="col-span-full font-bold text-[10px] text-indigo-400 border-b border-white/5 pb-1 mb-1 mt-3 uppercase tracking-widest flex items-center gap-2 opacity-80">
                <div className="h-1 w-1 bg-indigo-500 rounded-full" /> Dados Comerciais
            </h3>
            <div className="col-span-4">
                <label className={lbl}>Empresa</label>
                <input name="comercial_trabalho" type="text" value={state.comercialTrabalho} onChange={e => handlers.setComercialTrabalho(e.target.value)} className={inputStyle} disabled={isSaving} />
            </div>
            <div className="col-span-3">
                <label className={lbl}>Cargo</label>
                <input name="comercial_cargo" type="text" value={state.comercialCargo} onChange={e => handlers.setComercialCargo(e.target.value)} className={inputStyle} disabled={isSaving} />
            </div>
            <div className="col-span-2">
                <label className={lbl}>Renda</label>
                <input name="comercial_renda" type="text" value={state.comercialRenda} onChange={(e) => handlers.setComercialRenda(formatRenda(e.target.value))} className={inputStyle} disabled={isSaving} />
            </div>
            <div className="col-span-3">
                <label className={lbl}>Fone Coml.</label>
                <input name="comercial_fone" type="text" value={state.comercialFone} onChange={(e) => handlers.setComercialFone(maskPhone(e.target.value))} onBlur={(e) => handlers.setComercialFone(maskPhone(e.target.value, true))} className={inputStyle} disabled={isSaving} />
            </div>
            <div className="col-span-12">
                <label className={lbl}>Endereço Coml.</label>
                <input name="comercial_endereco" type="text" value={state.comercialEndereco} onChange={e => handlers.setComercialEndereco(e.target.value)} className={inputStyle} disabled={isSaving} />
            </div>
        </div>
    );
}

function AbaReferencias({ state, handlers, isSaving, inputStyle }: any) {
    const lbl = labelStyle;
    return (
        <div className="grid grid-cols-12 gap-3 gap-y-3">
            <h3 className="col-span-full font-bold text-[10px] text-indigo-400 border-b border-white/5 pb-1 mb-1 uppercase tracking-widest flex items-center gap-2 opacity-80">
                <div className="h-1 w-1 bg-indigo-500 rounded-full" /> Referências Pessoais
            </h3>
            <div className="col-span-6">
                <label className={lbl}>Ref. Pessoal 1</label>
                <input name="ref_pessoal_1" type="text" value={state.refPessoal1} onChange={e => handlers.setRefPessoal1(e.target.value)} className={inputStyle} disabled={isSaving} placeholder="Nome e Telefone" />
            </div>
            <div className="col-span-6">
                <label className={lbl}>Ref. Pessoal 2</label>
                <input name="ref_pessoal_2" type="text" value={state.refPessoal2} onChange={e => handlers.setRefPessoal2(e.target.value)} className={inputStyle} disabled={isSaving} placeholder="Nome e Telefone" />
            </div>

            <h3 className="col-span-full font-bold text-[10px] text-indigo-400 border-b border-white/5 pb-1 mb-1 mt-3 uppercase tracking-widest flex items-center gap-2 opacity-80">
                <div className="h-1 w-1 bg-indigo-500 rounded-full" /> Referências Comerciais
            </h3>
            <div className="col-span-6">
                <label className={lbl}>Ref. Comercial 1</label>
                <input name="ref_comercio_1" type="text" value={state.refComercio1} onChange={e => handlers.setRefComercio1(e.target.value)} className={inputStyle} disabled={isSaving} placeholder="Empresa e Telefone" />
            </div>
            <div className="col-span-6">
                <label className={lbl}>Ref. Comercial 2</label>
                <input name="ref_comercio_2" type="text" value={state.refComercio2} onChange={e => handlers.setRefComercio2(e.target.value)} className={inputStyle} disabled={isSaving} placeholder="Empresa e Telefone" />
            </div>
        </div>
    );
}

function AbaMensagens({
    preferences,
    installmentRemindersEnabled,
    postSaleFollowupsEnabled,
    onInstallmentRemindersChange,
    onPostSaleFollowupsChange,
    isSaving,
}: {
    preferences: CustomerWhatsAppMessagePreferences;
    installmentRemindersEnabled: boolean;
    postSaleFollowupsEnabled: boolean;
    onInstallmentRemindersChange: (enabled: boolean) => void;
    onPostSaleFollowupsChange: (enabled: boolean) => void;
    isSaving: boolean;
}) {
    const lastChanged = preferences.updatedAt
        ? new Date(preferences.updatedAt).toLocaleString('pt-BR')
        : 'Padrão da loja';

    return (
        <section className="space-y-4">
            <div>
                <h3 className="text-sm font-black text-slate-100">Mensagens automáticas de WhatsApp</h3>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                    Escolha somente os contatos automáticos permitidos para este cliente. Mensagens enviadas manualmente pela equipe não são bloqueadas.
                </p>
                {preferences.remotePhone ? (
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-indigo-300">Número aplicado: {preferences.remotePhone}</p>
                ) : (
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-amber-300">Informe o celular e salve o cadastro para aplicar estas preferências.</p>
                )}
            </div>

            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${preferences.installmentRemindersAvailable ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'cursor-not-allowed border-white/5 bg-black/10 opacity-50'}`}>
                <input type="checkbox" checked={installmentRemindersEnabled} onChange={(event) => onInstallmentRemindersChange(event.target.checked)} disabled={isSaving || !preferences.installmentRemindersAvailable} className="mt-0.5 h-4 w-4 rounded border-white/30 bg-slate-950 text-indigo-500" />
                <span><span className="block text-xs font-bold text-slate-200">Lembretes de parcelas e vencimentos</span><span className="mt-1 block text-[11px] leading-4 text-slate-400">Avisos automáticos de parcelas a vencer. Desmarque quando o cliente solicitar não receber cobranças pelo WhatsApp.</span></span>
            </label>

            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${preferences.postSaleFollowupsAvailable ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'cursor-not-allowed border-white/5 bg-black/10 opacity-50'}`}>
                <input type="checkbox" checked={postSaleFollowupsEnabled} onChange={(event) => onPostSaleFollowupsChange(event.target.checked)} disabled={isSaving || !preferences.postSaleFollowupsAvailable} className="mt-0.5 h-4 w-4 rounded border-white/30 bg-slate-950 text-indigo-500" />
                <span><span className="block text-xs font-bold text-slate-200">Acompanhamento pós-venda</span><span className="mt-1 block text-[11px] leading-4 text-slate-400">Mensagens automáticas para saber como está a adaptação após a retirada dos óculos.</span></span>
            </label>

            <p className="text-[10px] text-slate-500">Última preferência registrada: {lastChanged}.</p>
        </section>
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
        return <div className="flex h-full items-center justify-center text-slate-500 text-sm italic p-10 font-bold opacity-50">Salve o cliente titular primeiro para adicionar dependentes.</div>;
    }

    return (
        <div className="flex flex-col h-full gap-4">
            <div className={`p-4 rounded-xl border-white/5 shadow-sm transition-colors border backdrop-blur-md ${editingId ? 'bg-amber-500/10 border-amber-500/20' : 'bg-white/5'}`}>
                <h4 className={`text-xs font-bold uppercase mb-3 flex items-center gap-2 ${editingId ? 'text-amber-400' : 'text-indigo-400'}`}>
                    {editingId ? <><Pencil className="h-4 w-4" /> Editando Dependente</> : <><UserPlus className="h-4 w-4" /> Adicionar Dependente</>}
                </h4>

                <div className="flex gap-2 items-end">
                    <div className="flex-1">
                        <label className={labelStyle}>Nome Completo</label>
                        <input value={depNome} onChange={e => setDepNome(e.target.value)} className={inputStyle} placeholder="Nome do paciente" />
                    </div>
                    <div className="w-1/4">
                        <label className={labelStyle}>Parentesco</label>
                        <select value={depParentesco} onChange={e => setDepParentesco(e.target.value)} className={`${inputStyle} appearance-none`}>
                            <option value="Filho(a)" className="text-black">Filho(a)</option>
                            <option value="Cônjuge" className="text-black">Cônjuge</option>
                            <option value="Pai/Mãe" className="text-black">Pai/Mãe</option>
                            <option value="Outro" className="text-black">Outro</option>
                        </select>
                    </div>
                    <div className="w-1/4">
                        <label className={labelStyle}>Nascimento</label>
                        <input type="date" value={depNasc} onChange={e => setDepNasc(e.target.value)} className={inputStyle} />
                    </div>
                    <button type="button" onClick={handleSave} disabled={isSaving} className={`h-9 px-4 rounded-xl text-xs font-bold text-white flex items-center gap-1 shadow-md transition-transform active:scale-95 ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}>
                        {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} {editingId ? 'Atualizar' : 'Adicionar'}
                    </button>
                    {editingId && (
                        <button type="button" onClick={handleCancelEdit} className="h-9 px-2 rounded-xl text-slate-400 hover:bg-white/10 border border-white/10" title="Cancelar"><X className="h-4 w-4" /></button>
                    )}
                </div>
            </div>

            <div className="space-y-2">
                {dependentes.length === 0 ? (
                    <p className="text-center text-slate-500 text-xs py-4">Nenhum dependente cadastrado.</p>
                ) : (
                    dependentes.map(dep => (
                        <div key={dep.id} className={`flex justify-between items-center p-3 border rounded-xl shadow-sm transition-colors backdrop-blur-md ${editingId === dep.id ? 'bg-amber-500/10 border-amber-500/50' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'}`}>
                            <div className="flex-1">
                                <p className="font-bold text-slate-200 text-sm">{dep.full_name}</p>
                                <div className="flex gap-3 mt-1">
                                    <span className="text-[10px] bg-white/10 text-slate-400 px-2 py-0.5 rounded font-bold uppercase border border-white/5">{dep.parentesco || 'Outro'}</span>
                                    {dep.birth_date && <span className="text-[10px] text-slate-500 flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(dep.birth_date)}</span>}
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <button type="button" onClick={() => handleEditClick(dep)} className="text-slate-500 hover:text-indigo-400 p-2 hover:bg-indigo-500/10 rounded-lg transition-colors" title="Editar"><Pencil className="h-4 w-4" /></button>
                                <button type="button" onClick={() => handleDelete(dep.id)} className="text-slate-500 hover:text-red-400 p-2 hover:bg-red-500/10 rounded-lg transition-colors" title="Remover"><Trash2 className="h-4 w-4" /></button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
