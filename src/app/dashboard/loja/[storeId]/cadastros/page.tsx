'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Search, Plus, Save, Trash2, Loader2, UploadCloud,
  Glasses, Eye, Sparkles, Stethoscope, ShoppingBag, ScanBarcode,
  ArrowRightLeft, Lock, Truck, ChevronRight, Grid3X3, Sun
} from 'lucide-react';
import {
  fetchCatalogItems,
  saveLente, saveArmacao, saveTratamento, saveOftalmo, saveProdutoGeral, saveSupplier,
  deleteCatalogItem,
  fetchCategoriasProdutos,
  changeProductType, // Added
  type CatalogItemResult,
  type CatalogActionResult
} from '@/lib/actions/catalog.actions';
import LensGridEditor from '@/components/cadastros/LensGridEditor';
import { toast } from 'sonner';

// --- CONFIGURAÇÃO DE ESTILO (DESIGN SYSTEM) ---
// --- DESIGN SYSTEM DOCTAS GLASS (Dark Glassmorphism) ---
const labelStyle = "block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider";
const inputStyle = "block w-full rounded-xl border border-white/10 bg-black/20 shadow-sm text-slate-200 h-9 text-xs px-3 focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 font-bold placeholder:font-normal placeholder:text-slate-600 disabled:opacity-50 transition-all outline-none";
const cardStyle = "bg-white/5 p-5 rounded-2xl shadow-lg border border-white/10 backdrop-blur-md mb-3";

type CategoryType = 'solar' | 'receituario' | 'lentes' | 'tratamentos' | 'oftalmologistas' | 'fornecedores' | 'produtos_gerais';

export default function CatalogPage() {
  const params = useParams();
  const storeId = parseInt(params.storeId as string, 10);

  // --- Estados ---
  const [activeTab, setActiveTab] = useState<CategoryType>('solar'); // Padrão solicitado
  const [items, setItems] = useState<CatalogItemResult[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null); // null = Novo
  const [search, setSearch] = useState('');

  const [loadingList, setLoadingList] = useState(false);
  const [isSaving, startTransition] = useTransition();

  // Dados do Formulário (Genérico)
  const [formData, setFormData] = useState<any>({});

  // Sugestões para Autocomplete (Produtos Gerais)
  const [sugestoesCategorias, setSugestoesCategorias] = useState<string[]>([]);

  // --- NOVO: Estado do Modal de Grade ---
  const [showGridModal, setShowGridModal] = useState(false);

  // --- Carregar Lista ---
  useEffect(() => {
    const loadItems = async () => {
      setLoadingList(true);
      // @ts-ignore - Ignora erro de tipo temporário pois 'fornecedores' ainda não está na assinatura da action original
      const data = await fetchCatalogItems(storeId, activeTab, search);
      setItems(data);
      setLoadingList(false);
    };
    const timer = setTimeout(loadItems, 300);
    return () => clearTimeout(timer);
  }, [storeId, activeTab, search]);

  // --- Carregar Categorias ---
  useEffect(() => {
    if (activeTab === 'produtos_gerais') {
      fetchCategoriasProdutos(storeId).then(cats => setSugestoesCategorias(cats));
    }
  }, [storeId, activeTab]);

  // --- Handlers ---
  const handleTabChange = (tab: CategoryType) => {
    setActiveTab(tab);
    setSearch('');
    handleNew();
  };

  const handleSelect = (item: CatalogItemResult) => {
    setSelectedId(item.id);
    setFormData(item.raw);
  };

  const handleNew = () => {
    setSelectedId(null);
    setFormData({});
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formPayload = new FormData();
    if (selectedId) formPayload.append('id', selectedId.toString());

    Object.keys(formData).forEach(key => {
      if (formData[key] !== null && formData[key] !== undefined) {
        formPayload.append(key, formData[key].toString());
      }
    });

    startTransition(async () => {
      let result: CatalogActionResult;

      switch (activeTab) {
        case 'lentes': result = await saveLente({ success: false, message: '' }, formPayload); break;
        case 'solar':
          formPayload.append('tipo_produto', 'Solar');
          result = await saveArmacao({ success: false, message: '' }, formPayload);
          break;
        case 'receituario':
          formPayload.append('tipo_produto', 'Receituario');
          result = await saveArmacao({ success: false, message: '' }, formPayload);
          break;
        case 'tratamentos': result = await saveTratamento({ success: false, message: '' }, formPayload); break;
        case 'oftalmologistas': result = await saveOftalmo({ success: false, message: '' }, formPayload); break;
        case 'produtos_gerais': result = await saveProdutoGeral({ success: false, message: '' }, formPayload); break;

        // NOVO CASE CONECTADO
        case 'fornecedores': result = await saveSupplier({ success: false, message: '' }, formPayload); break;

        default: result = { success: false, message: 'Erro interno' };
      }

      if (result.success) {
        if (result.generatedCode) {
          alert(`${result.message}\n\nCÓDIGO GERADO: ${result.generatedCode}`);
        } else {
          alert(result.message);
        }

        // @ts-ignore
        const data = await fetchCatalogItems(storeId, activeTab, search);
        setItems(data);
        handleNew();

        if (activeTab === 'produtos_gerais') {
          fetchCategoriasProdutos(storeId).then(setSugestoesCategorias);
        }
      } else {
        if (activeTab !== 'fornecedores') alert(`Erro: ${result.message}`);
      }
    });
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!confirm('Tem certeza que deseja excluir este item?')) return;

    startTransition(async () => {
      // @ts-ignore
      const result = await deleteCatalogItem(selectedId, storeId, activeTab);
      if (result.success) {
        // @ts-ignore
        const data = await fetchCatalogItems(storeId, activeTab, search);
        setItems(data);
        handleNew();
      } else {
        alert(result.message);
      }
    });
  };

  const handleChangeType = async (newType: string) => {
    if (!selectedId || !storeId) return;
    if (!confirm('Deseja realmente mover este produto para outra categoria? Campos específicos podem não ser exibidos na nova categoria.')) return;

    startTransition(async () => {
      const res = await changeProductType(selectedId, storeId, newType as any);

      if (res.success) {
        toast.success(res.message);
        setActiveTab(newType as CategoryType); // Switch to the new tab
        setSearch(prev => prev + " "); // Force list refresh hack or just reload
        // Ideally we should reload list. The search trick usually works if it triggers useEffect
        setTimeout(() => setSearch(search), 100);
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-transparent">

      {/* --- COLUNA ESQUERDA (30%) --- */}
      <div className="w-1/3 flex flex-col border-r border-white/5 bg-slate-900/30 backdrop-blur-md z-10 shadow-sm">

        {/* Header Gradiente */}
        <div className="bg-gradient-to-br from-indigo-600/20 to-blue-700/20 p-4 flex flex-col gap-3 shadow-md z-20 border-b border-white/5">
          <div className="flex justify-between items-center text-white">
            <h2 className="font-black text-sm flex items-center gap-2 uppercase tracking-wide text-indigo-400">
              <ScanBarcode className="h-4 w-4" /> Catálogo
            </h2>
            <div className="flex gap-2">
              {activeTab === 'lentes' && (
                <Link
                  href={`/dashboard/loja/${storeId}/cadastros/importar-lentes`}
                  className="bg-white/10 hover:bg-white/20 text-indigo-300 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-colors border border-white/10"
                  title="Importar Lentes via CSV"
                >
                  <UploadCloud className="h-3 w-3" /> Importar
                </Link>
              )}
              <span className="text-[10px] bg-white/10 text-slate-300 px-2 py-1 rounded-full font-medium border border-white/10">
                {items.length} itens
              </span>
            </div>
          </div>
          <div className="relative">
            <input
              type="text"
              className="w-full h-9 pl-9 pr-3 rounded-xl border border-white/10 bg-black/20 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 font-bold text-xs shadow-inner"
              placeholder="Buscar item..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="flex justify-center p-6"><Loader2 className="animate-spin text-indigo-400 h-6 w-6" /></div>
          ) : items.length === 0 ? (
            <p className="text-center text-slate-500 text-xs p-6">Nenhum item encontrado.</p>
          ) : (
            items.map(item => (
              <div
                key={item.id}
                onClick={() => handleSelect(item)}
                className={`p-3 border-b border-white/5 cursor-pointer transition-colors flex justify-between items-center group
                      ${selectedId === item.id ? 'bg-indigo-500/10 border-l-4 border-l-indigo-500' : 'hover:bg-white/5 border-l-4 border-l-transparent'}
                  `}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between items-start">
                    <span className={`font-bold text-xs truncate pr-2 ${selectedId === item.id ? 'text-indigo-300' : 'text-slate-300'}`}>{item.title}</span>
                    {item.price !== undefined && (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 rounded border border-emerald-500/20 whitespace-nowrap">
                        R$ {item.price?.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-end mt-1">
                    <span className="text-[10px] text-slate-500 truncate max-w-[150px]">{item.subtitle || '-'}</span>
                    {item.stock !== undefined && (
                      <span className={`text-[9px] font-bold px-1.5 rounded ${item.stock > 0 ? 'bg-white/5 text-slate-400 border border-white/5' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                        Est: {item.stock}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className={`h-3 w-3 ml-2 text-slate-600 group-hover:text-indigo-400 ${selectedId === item.id ? 'text-indigo-400' : ''}`} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* --- COLUNA DIREITA (70%) --- */}
      <div className="flex-1 flex flex-col bg-transparent relative overflow-hidden">

        {/* Abas */}
        <div className="bg-slate-900/30 backdrop-blur-md border-b border-white/5 px-4 pt-3 flex gap-4 shadow-sm flex-shrink-0 overflow-x-auto">
          <TabButton
            label="Solar" icon={Sun}
            active={activeTab === 'solar'} onClick={() => handleTabChange('solar')}
          />
          <TabButton
            label="Receituário" icon={Eye}
            active={activeTab === 'receituario'} onClick={() => handleTabChange('receituario')}
          />
          <TabButton
            label="Lentes" icon={Glasses}
            active={activeTab === 'lentes'} onClick={() => handleTabChange('lentes')}
          />
          <TabButton
            label="Tratamentos" icon={Sparkles}
            active={activeTab === 'tratamentos'} onClick={() => handleTabChange('tratamentos')}
          />
          <TabButton
            label="Varejo / Outros" icon={ShoppingBag}
            active={activeTab === 'produtos_gerais'} onClick={() => handleTabChange('produtos_gerais')}
          />
          <TabButton
            label="Fornecedores" icon={Truck}
            active={activeTab === 'fornecedores'} onClick={() => handleTabChange('fornecedores')}
          />
          <TabButton
            label="Oftalmologistas" icon={Stethoscope}
            active={activeTab === 'oftalmologistas'} onClick={() => handleTabChange('oftalmologistas')}
          />
        </div>

        {/* Formulário */}
        <form id="catalog-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="max-w-4xl mx-auto">
            <div className={cardStyle}>
              {activeTab === 'lentes' && (
                <FormLentes
                  data={formData}
                  onChange={handleInputChange}
                  disabled={isSaving}
                  onOpenGrid={() => setShowGridModal(true)} // Passando a prop
                />
              )}
              {(activeTab === 'solar' || activeTab === 'receituario') && (
                <FormArmacoes data={formData} onChange={handleInputChange} disabled={isSaving} storeId={storeId} />
              )}
              {activeTab === 'produtos_gerais' && (
                <FormProdutosGerais
                  data={formData}
                  onChange={handleInputChange}
                  disabled={isSaving}
                  sugestoes={sugestoesCategorias}
                  storeId={storeId}
                />
              )}
              {activeTab === 'tratamentos' && (
                <FormTratamentos data={formData} onChange={handleInputChange} disabled={isSaving} />
              )}
              {activeTab === 'oftalmologistas' && (
                <FormOftalmos data={formData} onChange={handleInputChange} disabled={isSaving} />
              )}
              {activeTab === 'fornecedores' && (
                <FormFornecedores data={formData} onChange={handleInputChange} disabled={isSaving} />
              )}
            </div>
          </div>
        </form>

        {/* Rodapé Fixo */}
        <div className="bg-slate-900/60 backdrop-blur-xl border-t border-white/5 p-3 shadow-[0_-5px_20px_rgba(0,0,0,0.2)] flex justify-end gap-2 z-20 shrink-0">
          <button
            type="button"
            onClick={handleNew}
            className="px-4 py-2 text-xs font-bold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Novo
          </button>

          {/* TIPO DROP: Apenas se não for oftalmo/fornecedor */}
          {selectedId && activeTab !== 'oftalmologistas' && activeTab !== 'fornecedores' && (
            <select
              className="bg-transparent hover:bg-white/5 border border-white/10 text-slate-300 text-[10px] font-bold rounded-lg px-2 py-2 outline-none transition-colors cursor-pointer"
              onChange={(e) => {
                handleChangeType(e.target.value);
                e.target.value = ""; // Reset
              }}
              defaultValue=""
            >
              <option value="" disabled className="bg-slate-900 text-slate-500">Mover para...</option>
              <option value="lentes" className="bg-slate-900 text-slate-200">Lente</option>
              <option value="receituario" className="bg-slate-900 text-slate-200">Armação</option>
              <option value="solar" className="bg-slate-900 text-slate-200">Solar</option>
              <option value="produtos_gerais" className="bg-slate-900 text-slate-200">Varejo / Outros</option>
              <option value="tratamentos" className="bg-slate-900 text-slate-200">Tratamento</option>
            </select>
          )}

          {selectedId && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </button>
          )}

          <button
            type="submit"
            form="catalog-form"
            disabled={isSaving}
            className="px-6 py-2 text-xs font-bold text-emerald-100 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 rounded-lg shadow-md backdrop-blur-md transition-transform active:scale-95 flex items-center gap-2"
          >
            {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />}
            SALVAR
          </button>
        </div>

      </div>

      {/* --- MODAL DE GRADE --- */}
      {selectedId && (
        <LensGridEditor
          isOpen={showGridModal}
          onClose={() => setShowGridModal(false)}
          productId={selectedId}
          storeId={storeId}
          productName={formData.nome_lente || 'Lente'}
        />
      )}
    </div>
  );
}

// --- Componentes Auxiliares ---

function TabButton({ label, icon: Icon, active, onClick }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${active
        ? 'text-indigo-400 border-indigo-400'
        : 'text-slate-500 border-transparent hover:text-slate-300'
        }`}
    >
      <Icon className={`h-4 w-4 ${active ? 'text-indigo-400' : 'text-slate-500'}`} /> {label}
    </button>
  );
}

// --- CAMPO DE ESTOQUE INTELIGENTE (ATUALIZADO PARA REDIRECIONAR) ---
// --- CAMPO DE ESTOQUE INTELIGENTE (ATUALIZADO PARA REDIRECIONAR) ---
function EstoqueInput({ value, onChange, disabled, isEditing, storeId, productId, productName }: any) {
  if (!isEditing) {
    // Modo Criação: Permite digitar
    return (
      <input
        type="number"
        value={value || 0}
        onChange={onChange}
        className={inputStyle}
        disabled={disabled}
      />
    )
  }

  // Modo Edição: Botão de Redirecionamento
  return (
    <div className="relative">
      <input
        type="number"
        value={value || 0}
        readOnly
        className={`${inputStyle} bg-slate-800/50 text-slate-500 cursor-not-allowed border-white/5`}
        disabled={true}
      />

      <div className="absolute top-0 right-0 h-full flex items-center pr-1">
        <Link
          href={`/dashboard/loja/${storeId}/estoque/movimentacoes?productId=${productId}&busca=${encodeURIComponent(productName || '')}`}
          title="Gerenciar Estoque (Entradas/Saídas)"
          className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-3 py-1 rounded-md transition-colors text-[10px] font-bold flex items-center gap-1 shadow-sm border border-amber-500/20"
        >
          <ArrowRightLeft className="h-3 w-3" /> Gerenciar
        </Link>
      </div>
    </div>
  )
}

// --- FORMULÁRIOS ESPECÍFICOS ---

function FormProdutosGerais({ data, onChange, disabled, sugestoes, storeId }: any) {
  const isEditing = !!data.id;
  return (
    <div className="grid grid-cols-12 gap-3 gap-y-4">
      <div className="col-span-6">
        <label className={labelStyle}>Categoria *</label>
        <input type="text" required list="sugestoes-cat" value={data.categoria || ''} onChange={e => onChange('categoria', e.target.value)} className={inputStyle} disabled={disabled} placeholder="Ex: Relógio, Acessório..." />
        <datalist id="sugestoes-cat">{sugestoes?.map((s: string) => <option key={s} value={s} />)}</datalist>
      </div>
      <div className="col-span-6">
        <label className={labelStyle}>Código de Barras</label>
        <input type="text" value={data.codigo_barras || ''} onChange={e => onChange('codigo_barras', e.target.value)} className={`${inputStyle} bg-indigo-500/10 border-indigo-500/20 text-indigo-300`} disabled={disabled} placeholder="Vazio = Automático" />
      </div>
      <div className="col-span-8">
        <label className={labelStyle}>Descrição do Produto *</label>
        <input type="text" required value={data.descricao || ''} onChange={e => onChange('descricao', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div className="col-span-4">
        <label className={labelStyle}>Marca</label>
        <input type="text" value={data.marca || ''} onChange={e => onChange('marca', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>

      <div className="col-span-12 border-t border-slate-100 my-1"></div>

      <div className="col-span-3">
        <label className={labelStyle}>Preço Custo (R$)</label>
        <input type="number" step="0.01" value={data.preco_custo || ''} onChange={e => onChange('preco_custo', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div className="col-span-3">
        <label className={`${labelStyle} text-emerald-400`}>Preço Venda (R$) *</label>
        <input type="number" step="0.01" required value={data.preco_venda || ''} onChange={e => onChange('preco_venda', e.target.value)} className={`${inputStyle} border-emerald-500/30 bg-emerald-900/20 text-emerald-300`} disabled={disabled} />
      </div>
      <div className="col-span-3">
        <label className={labelStyle}>Estoque Atual</label>
        <EstoqueInput
          value={data.estoque_atual}
          onChange={(e: any) => onChange('estoque_atual', e.target.value)}
          disabled={disabled}
          isEditing={isEditing}
          storeId={storeId}
          productId={data.id}
          productName={data.descricao}
        />
      </div>
      <div className="col-span-3">
        <label className={labelStyle}>Estoque Mínimo</label>
        <input type="number" value={data.estoque_minimo || 1} onChange={e => onChange('estoque_minimo', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
    </div>
  );
}

function FormArmacoes({ data, onChange, disabled, storeId }: any) {
  const isEditing = !!data.id;

  return (
    <div className="grid grid-cols-12 gap-3 gap-y-4">
      <div className="col-span-12 bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20 flex items-center gap-4">
        <div className="flex-1">
          <label className={`${labelStyle} text-indigo-300`}>Código de Barras (EAN)</label>
          <div className="flex gap-2 items-center">
            <ScanBarcode className="h-4 w-4 text-indigo-400" />
            <input type="text" value={data.codigo_barras || ''} onChange={e => onChange('codigo_barras', e.target.value)} className={`${inputStyle} border-indigo-500/20 text-indigo-200 bg-indigo-500/5`} disabled={disabled} placeholder="Vazio = Gerar Automático" />
          </div>
        </div>
      </div>
      <div className="col-span-6">
        <label className={labelStyle}>Marca *</label>
        <input type="text" required value={data.marca || ''} onChange={e => onChange('marca', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div className="col-span-6">
        <label className={labelStyle}>Modelo</label>
        <input type="text" value={data.modelo || ''} onChange={e => onChange('modelo', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div className="col-span-4">
        <label className={labelStyle}>Referência</label>
        <input type="text" value={data.referencia || ''} onChange={e => onChange('referencia', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div className="col-span-4">
        <label className={labelStyle}>Cor</label>
        <input type="text" value={data.cor || ''} onChange={e => onChange('cor', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div className="col-span-4">
        <label className={labelStyle}>Estoque Atual</label>
        <EstoqueInput
          value={data.quantidade_estoque}
          onChange={(e: any) => onChange('quantidade_estoque', e.target.value)}
          disabled={disabled}
          isEditing={isEditing}
          storeId={storeId}
          productId={data.id}
          productName={`${data.marca || ''} ${data.modelo || ''}`.trim()}
        />
      </div>

      <div className="col-span-12 border-t border-white/5 my-1 pt-2">
        <p className="text-[9px] font-bold text-slate-500 uppercase mb-2">Medidas Técnicas</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelStyle}>Aro</label>
            <input type="text" value={data.tamanho_aro || ''} onChange={e => onChange('tamanho_aro', e.target.value)} className={inputStyle} disabled={disabled} />
          </div>
          <div>
            <label className={labelStyle}>Ponte</label>
            <input type="text" value={data.tamanho_ponte || ''} onChange={e => onChange('tamanho_ponte', e.target.value)} className={inputStyle} disabled={disabled} />
          </div>
          <div>
            <label className={labelStyle}>Haste</label>
            <input type="text" value={data.tamanho_haste || ''} onChange={e => onChange('tamanho_haste', e.target.value)} className={inputStyle} disabled={disabled} />
          </div>
        </div>
      </div>

      <div className="col-span-12 border-t border-white/5 my-1"></div>
      <div className="col-span-6">
        <label className={labelStyle}>Preço de Custo (R$)</label>
        <input type="number" step="0.01" value={data.preco_custo || ''} onChange={e => onChange('preco_custo', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div className="col-span-6">
        <label className={`${labelStyle} text-emerald-400`}>Preço de Venda (R$) *</label>
        <input type="number" step="0.01" required value={data.preco_venda || ''} onChange={e => onChange('preco_venda', e.target.value)} className={`${inputStyle} border-emerald-500/30 bg-emerald-900/20 text-emerald-300`} disabled={disabled} />
      </div>
    </div>
  );
}

function FormLentes({ data, onChange, disabled, onOpenGrid }: any) {
  const isEditing = !!data.id;

  return (
    <div className="grid grid-cols-2 gap-3 gap-y-4">
      <div className="col-span-2">
        <label className={labelStyle}>Nome da Lente *</label>
        <input type="text" required value={data.nome_lente || ''} onChange={e => onChange('nome_lente', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div>
        <label className={labelStyle}>Marca / Fabricante</label>
        <input type="text" value={data.marca || ''} onChange={e => onChange('marca', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div>
        <label className={labelStyle}>Material</label>
        <input type="text" value={data.material || ''} onChange={e => onChange('material', e.target.value)} className={inputStyle} disabled={disabled} placeholder="Ex: Policarbonato" />
      </div>
      <div>
        <label className={labelStyle}>Tipo / Desenho</label>
        <input type="text" value={data.tipo || ''} onChange={e => onChange('tipo', e.target.value)} className={inputStyle} disabled={disabled} placeholder="Ex: Multifocal" />
      </div>
      <div>
        <label className={labelStyle}>Índice de Refração</label>
        <input type="text" value={data.indice_refracao || ''} onChange={e => onChange('indice_refracao', e.target.value)} className={inputStyle} disabled={disabled} placeholder="Ex: 1.59" />
      </div>

      {/* BOTÃO DE GRADE (SÓ APARECE SE ESTIVER EDITANDO) */}
      {isEditing && (
        <div className="col-span-2 bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20 flex justify-between items-center">
          <div>
            <p className="text-xs font-bold text-indigo-300">Grade de Dioptrias</p>
            <p className="text-[10px] text-indigo-400/70">Gerencie o estoque por grau (Esférico x Cilíndrico)</p>
          </div>
          <button
            type="button"
            onClick={onOpenGrid}
            className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 text-[10px] font-bold rounded-lg shadow-sm flex items-center gap-1 border border-indigo-500/30"
          >
            <Grid3X3 className="h-3 w-3" /> GERENCIAR GRADE
          </button>
        </div>
      )}

      <div className="border-t border-white/5 col-span-2 my-1"></div>
      <div>
        <label className={labelStyle}>Preço de Custo (R$)</label>
        <input type="number" step="0.01" value={data.preco_custo || ''} onChange={e => onChange('preco_custo', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div>
        <label className={`${labelStyle} text-emerald-400`}>Preço de Venda (R$) *</label>
        <input type="number" step="0.01" required value={data.preco_venda || ''} onChange={e => onChange('preco_venda', e.target.value)} className={`${inputStyle} border-emerald-500/30 bg-emerald-900/20 text-emerald-300`} disabled={disabled} />
      </div>
    </div>
  );
}

function FormTratamentos({ data, onChange, disabled }: any) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <div>
        <label className={labelStyle}>Nome do Tratamento *</label>
        <input type="text" required value={data.nome_tratamento || ''} onChange={e => onChange('nome_tratamento', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div>
        <label className={labelStyle}>Descrição / Detalhes</label>
        <textarea rows={3} value={data.descricao || ''} onChange={e => onChange('descricao', e.target.value)} className="block w-full rounded-xl border border-white/10 bg-black/20 shadow-sm text-slate-200 text-xs p-3 resize-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 font-bold outline-none" disabled={disabled} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelStyle}>Custo Adicional (R$)</label>
          <input type="number" step="0.01" value={data.preco_custo_adicional || ''} onChange={e => onChange('preco_custo_adicional', e.target.value)} className={inputStyle} disabled={disabled} />
        </div>
        <div>
          <label className={`${labelStyle} text-emerald-400`}>Venda Adicional (R$) *</label>
          <input type="number" step="0.01" required value={data.preco_venda_adicional || ''} onChange={e => onChange('preco_venda_adicional', e.target.value)} className={`${inputStyle} border-emerald-500/30 bg-emerald-900/20 text-emerald-300`} disabled={disabled} />
        </div>
      </div>
    </div>
  );
}

function FormOftalmos({ data, onChange, disabled }: any) {
  return (
    <div className="grid grid-cols-12 gap-3 gap-y-4">
      <div className="col-span-8">
        <label className={labelStyle}>Nome do Médico *</label>
        <input type="text" required value={data.nome_completo || ''} onChange={e => onChange('nome_completo', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div className="col-span-4">
        <label className={labelStyle}>CRM</label>
        <input type="text" value={data.crm || ''} onChange={e => onChange('crm', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div className="col-span-6">
        <label className={labelStyle}>Telefone</label>
        <input type="text" value={data.telefone || ''} onChange={e => onChange('telefone', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div className="col-span-6">
        <label className={labelStyle}>E-mail</label>
        <input type="email" value={data.email || ''} onChange={e => onChange('email', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div className="col-span-12">
        <label className={labelStyle}>Clínica / Local de Atendimento</label>
        <input type="text" value={data.clinica || ''} onChange={e => onChange('clinica', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
    </div>
  );
}

function FormFornecedores({ data, onChange, disabled }: any) {
  return (
    <div className="grid grid-cols-12 gap-3 gap-y-4">
      <div className="col-span-6">
        <label className={labelStyle}>Nome Fantasia *</label>
        <input type="text" required value={data.nome_fantasia || ''} onChange={e => onChange('nome_fantasia', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div className="col-span-6">
        <label className={labelStyle}>Razão Social</label>
        <input type="text" value={data.razao_social || ''} onChange={e => onChange('razao_social', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>

      {/* LINHA TRIPLA: CNPJ | IE | TELEFONE */}
      <div className="col-span-4">
        <label className={labelStyle}>CNPJ</label>
        <input type="text" value={data.cnpj || ''} onChange={e => onChange('cnpj', e.target.value)} className={inputStyle} disabled={disabled} placeholder="00.000.000/0000-00" />
      </div>
      <div className="col-span-4">
        <label className={labelStyle}>Inscrição Estadual</label>
        <input type="text" value={data.inscricao_estadual || ''} onChange={e => onChange('inscricao_estadual', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div className="col-span-4">
        <label className={labelStyle}>Telefone / Contato</label>
        <input type="text" value={data.telefone || ''} onChange={e => onChange('telefone', e.target.value)} className={inputStyle} disabled={disabled} placeholder="(00) 0000-0000" />
      </div>

      <div className="col-span-8">
        <label className={labelStyle}>Cidade</label>
        <input type="text" value={data.cidade || ''} onChange={e => onChange('cidade', e.target.value)} className={inputStyle} disabled={disabled} />
      </div>
      <div className="col-span-4">
        <label className={labelStyle}>UF</label>
        <input type="text" value={data.uf || ''} onChange={e => onChange('uf', e.target.value)} className={inputStyle} disabled={disabled} maxLength={2} />
      </div>
    </div>
  );
}