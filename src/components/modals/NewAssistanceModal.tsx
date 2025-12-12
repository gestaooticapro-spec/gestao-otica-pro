'use client'

import { useState, useTransition } from 'react'
import { createAssistanceTicket } from '@/lib/actions/assistance.actions'
import { searchCustomersByName, getItensCompradosPorCliente, type CustomerSearchResult, type ItemComprado } from '@/lib/actions/vendas.actions'
import { Search, ArrowRight, Phone, Package, AlertTriangle, CheckCircle2, Loader2, X, ShoppingBag, PlusCircle, History } from 'lucide-react'

// Helper de Moeda
const currency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (d: string) => new Date(d).toLocaleDateString('pt-BR')

export default function NewAssistanceModal({ 
    isOpen, 
    onClose, 
    storeId, 
    onSuccess // Novo Prop para atualizar o Kanban sem F5
}: { 
    isOpen: boolean, 
    onClose: () => void, 
    storeId: number, 
    onSuccess: (ticket: any) => void 
}) {
  const [step, setStep] = useState(1)
  
  // Passo 1: Busca
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<CustomerSearchResult[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null)
  
  // Passo 2: Telefone
  const [confirmedPhone, setConfirmedPhone] = useState('')
  
  // Passo 3: Produto (Lista de Compras)
  const [purchasedItems, setPurchasedItems] = useState<ItemComprado[]>([])
  const [selectedProduct, setSelectedProduct] = useState<ItemComprado | null>(null)
  const [isManualProduct, setIsManualProduct] = useState(false)
  const [productDesc, setProductDesc] = useState('')
  
  // Passo 4: Detalhes
  const [defeito, setDefeito] = useState('')
  const [modalidade, setModalidade] = useState<'Padrao' | 'TrocaGarantida' | 'TrocaImediata'>('Padrao')
  
  const [isPending, startTransition] = useTransition()
  const [loadingItems, setLoadingItems] = useState(false)

  if (!isOpen) return null

  // 1. Busca Cliente
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (query.length < 3) return
    const res = await searchCustomersByName(query, storeId)
    if (res.success && res.data) setCustomers(res.data)
  }

  // 2. Seleciona Cliente e Busca Compras
  const handleSelectCustomer = async (c: CustomerSearchResult) => {
      setSelectedCustomer(c)
      setConfirmedPhone(c.fone_movel || '')
      setStep(2)
      
      // Já dispara a busca dos itens em background
      setLoadingItems(true)
      const itens = await getItensCompradosPorCliente(storeId, c.id)
      setPurchasedItems(itens)
      setLoadingItems(false)
  }

  const handlePhoneConfirm = () => {
      if (confirmedPhone.length < 10) return alert("Telefone inválido.")
      setStep(3) 
  }

  const handleSelectPurchasedItem = (item: ItemComprado) => {
      setSelectedProduct(item)
      setProductDesc(item.descricao) // Preenche auto
      setIsManualProduct(false)
      setStep(4)
  }

  const handleManualProduct = () => {
      setSelectedProduct(null)
      setProductDesc('')
      setIsManualProduct(true)
      // Não avança direto, deixa o usuário digitar no mesmo passo ou num sub-passo. 
      // Para simplificar, vou manter no passo 3 um campo que aparece se for manual.
  }

  const handleManualContinue = () => {
      if (!productDesc.trim()) return alert("Digite o nome do produto.")
      setStep(4)
  }

  const handleSubmit = () => {
      if (!selectedCustomer) return
      if (!defeito) return alert("Descreva o defeito.")

      const formData = new FormData()
      formData.append('store_id', storeId.toString())
      formData.append('customer_id', selectedCustomer.id.toString())
      formData.append('updated_phone', confirmedPhone)
      formData.append('product_descricao', productDesc)
      formData.append('descricao_defeito', defeito)
      formData.append('modalidade', modalidade)
      
      // Vínculos
      if (selectedProduct) {
          formData.append('product_id', selectedProduct.product_id ? selectedProduct.product_id.toString() : '')
          formData.append('venda_original_id', selectedProduct.venda_id.toString())
      }
      
      startTransition(async () => {
          const res = await createAssistanceTicket(formData)
          if (res.success && res.ticket) {
              onSuccess(res.ticket) // Atualiza Kanban
              onClose()
              // Reset Full
              setStep(1); setQuery(''); setCustomers([]); setSelectedCustomer(null); setPurchasedItems([]); setSelectedProduct(null);
          } else {
              alert(res.message)
          }
      })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
       <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
             <h3 className="font-bold text-slate-800">Nova Assistência (Passo {step}/4)</h3>
             <button onClick={onClose}><X className="h-5 w-5 text-slate-400"/></button>
          </div>

          <div className="p-6 overflow-y-auto">
             
             {/* PASSO 1: BUSCA CLIENTE */}
             {step === 1 && (
                <div className="space-y-4">
                    <form onSubmit={handleSearch} className="relative">
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome ou CPF..." className="w-full h-12 pl-10 rounded-xl border border-slate-300 font-bold" autoFocus />
                        <Search className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                    </form>
                    <div className="space-y-2">
                        {customers.map(c => (
                            <button key={c.id} onClick={() => handleSelectCustomer(c)} className="w-full text-left p-3 rounded-lg hover:bg-blue-50 border border-slate-100 flex justify-between items-center group">
                                <span className="font-bold text-slate-700">{c.full_name}</span>
                                <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500" />
                            </button>
                        ))}
                    </div>
                </div>
             )}

             {/* PASSO 2: TELEFONE */}
             {step === 2 && selectedCustomer && (
                 <div className="text-center space-y-6 animate-in slide-in-from-right-4">
                     <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-blue-600">
                         <Phone className="h-8 w-8" />
                     </div>
                     <div>
                         <h3 className="text-xl font-bold text-slate-800">Confirmação de Contato</h3>
                         <p className="text-sm text-slate-500 mt-1">Para envio do link de rastreio.</p>
                     </div>
                     <input 
                        value={confirmedPhone} 
                        onChange={e => setConfirmedPhone(e.target.value)} 
                        className="w-full text-center text-2xl font-black tracking-widest h-14 rounded-xl border-2 border-blue-200 focus:border-blue-500 text-slate-800"
                     />
                     <button onClick={handlePhoneConfirm} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg">
                         Confirmar
                     </button>
                 </div>
             )}

             {/* PASSO 3: SELEÇÃO DE PRODUTO */}
             {step === 3 && (
                 <div className="space-y-4 animate-in slide-in-from-right-4">
                     <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Qual o produto?</h3>
                     
                     {/* Opção Manual */}
                     {isManualProduct ? (
                         <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                             <label className="text-xs font-bold text-slate-500 uppercase">Descrição do Item</label>
                             <input value={productDesc} onChange={e => setProductDesc(e.target.value)} className="w-full h-10 rounded-lg border-slate-300 font-bold" placeholder="Ex: Rayban antigo do cliente" autoFocus />
                             <div className="flex gap-2">
                                <button onClick={() => setIsManualProduct(false)} className="flex-1 py-2 text-slate-500 font-bold text-xs hover:bg-slate-200 rounded-lg">Cancelar</button>
                                <button onClick={handleManualContinue} className="flex-1 py-2 bg-slate-800 text-white font-bold text-xs rounded-lg hover:bg-slate-900">Continuar</button>
                             </div>
                         </div>
                     ) : (
                         <>
                            <button onClick={handleManualProduct} className="w-full p-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-slate-400 hover:bg-slate-50 font-bold text-sm flex items-center justify-center gap-2">
                                <PlusCircle className="h-5 w-5" /> Produto Não Cadastrado / Externo
                            </button>

                            <div className="border-t border-slate-100 my-2"></div>
                            
                            <p className="text-xs font-bold text-slate-400 uppercase">Histórico de Compras</p>
                            
                            {loadingItems ? <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-500"/></div> : 
                             purchasedItems.length === 0 ? <p className="text-center text-sm text-slate-400 py-4">Nenhuma compra recente encontrada.</p> :
                             <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                                {purchasedItems.map(item => (
                                    <button key={item.venda_item_id} onClick={() => handleSelectPurchasedItem(item)} className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all group">
                                        <div className="flex justify-between items-start">
                                            <span className="font-bold text-slate-700 text-sm group-hover:text-blue-700 line-clamp-1">{item.descricao}</span>
                                            <span className="text-xs font-mono text-slate-400">{date(item.data_venda)}</span>
                                        </div>
                                        <div className="flex justify-between items-center mt-1">
                                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">Venda #{item.venda_id}</span>
                                            <span className="text-xs font-bold text-green-600">{currency(item.valor)}</span>
                                        </div>
                                    </button>
                                ))}
                             </div>
                            }
                         </>
                     )}
                 </div>
             )}

             {/* PASSO 4: DEFEITO E MODALIDADE */}
             {step === 4 && (
                 <div className="space-y-5 animate-in slide-in-from-right-4">
                     
                     <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                        <p className="text-xs font-bold text-blue-800 uppercase mb-1">Produto Selecionado</p>
                        <p className="text-sm font-bold text-blue-900">{productDesc}</p>
                     </div>

                     <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Defeito Relatado</label>
                         <textarea value={defeito} onChange={e => setDefeito(e.target.value)} placeholder="Descreva o problema..." className="w-full h-20 rounded-lg border border-slate-300 p-3 text-sm resize-none focus:ring-2 focus:ring-blue-500" autoFocus />
                     </div>

                     <div className="grid grid-cols-3 gap-2">
                         <button onClick={() => setModalidade('Padrao')} className={`p-3 rounded-xl border-2 text-center transition-all ${modalidade === 'Padrao' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-blue-200'}`}>
                             <Package className="h-6 w-6 mx-auto mb-1"/>
                             <span className="block text-[10px] font-bold uppercase">Padrão</span>
                         </button>
                         <button onClick={() => setModalidade('TrocaGarantida')} className={`p-3 rounded-xl border-2 text-center transition-all ${modalidade === 'TrocaGarantida' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 hover:border-purple-200'}`}>
                             <History className="h-6 w-6 mx-auto mb-1"/>
                             <span className="block text-[10px] font-bold uppercase">Garantida</span>
                         </button>
                         <button onClick={() => setModalidade('TrocaImediata')} className={`p-3 rounded-xl border-2 text-center transition-all ${modalidade === 'TrocaImediata' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 hover:border-orange-200'}`}>
                             <AlertTriangle className="h-6 w-6 mx-auto mb-1"/>
                             <span className="block text-[10px] font-bold uppercase">Imediata</span>
                         </button>
                     </div>
                     
                     <p className="text-center text-xs text-slate-400">
                        {modalidade === 'Padrao' && 'Cliente deixa o produto para análise.'}
                        {modalidade === 'TrocaGarantida' && 'Cliente leva produto. Pedimos novo ao fornecedor.'}
                        {modalidade === 'TrocaImediata' && 'Baixa estoque da loja agora. Risco nosso.'}
                     </p>

                     <button onClick={handleSubmit} disabled={isPending} className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg flex justify-center items-center gap-2">
                         {isPending ? <Loader2 className="h-5 w-5 animate-spin"/> : 'ABRIR TICKET'}
                     </button>
                 </div>
             )}

          </div>
       </div>
    </div>
  )
}