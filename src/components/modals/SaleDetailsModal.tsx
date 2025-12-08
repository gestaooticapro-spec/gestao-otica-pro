'use client'

import { X, Eye, ShoppingBag, Calendar, DollarSign, User } from 'lucide-react'

// Tipagem simplificada baseada no retorno da Action
interface SaleDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  data: any // O dado vem do join complexo da action getPostSaleDetails
}

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR')

export default function SaleDetailsModal({ isOpen, onClose, data }: SaleDetailsModalProps) {
  if (!isOpen || !data) return null

  // Identifica quem é o paciente (Dependente ou Titular)
  const pacienteNome = data.dependentes?.full_name || data.customers?.full_name || 'Consumidor'
  const venda = data.vendas

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        
        {/* 1. CABEÇALHO (O PACIENTE) */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <User className="h-6 w-6 text-blue-600" />
              {pacienteNome}
            </h2>
            <div className="flex gap-4 mt-1 text-xs font-bold text-slate-500 uppercase tracking-wide">
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3"/> Entrega: {data.dt_entregue_em ? formatDate(data.dt_entregue_em) : 'Pendente'}</span>
                <span className="flex items-center gap-1">OS #{data.id}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* 2. O CORAÇÃO (A RECEITA) */}
            <div className="bg-blue-50/50 rounded-xl border border-blue-100 p-4">
                <h3 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                    <Eye className="h-4 w-4" /> Dados da Receita (Em uso)
                </h3>
                
                {/* Grid de Receita */}
                <div className="grid grid-cols-7 gap-2 text-center text-xs">
                    <div className="col-span-1 font-bold text-slate-400 self-center text-[10px]">OLHO</div>
                    <div className="col-span-2 font-bold text-slate-500 bg-white/50 py-1 rounded">ESF.</div>
                    <div className="col-span-2 font-bold text-slate-500 bg-white/50 py-1 rounded">CIL.</div>
                    <div className="col-span-2 font-bold text-slate-500 bg-white/50 py-1 rounded">EIXO</div>

                    {/* OD */}
                    <div className="col-span-1 font-black text-blue-600 self-center text-sm">OD</div>
                    <div className="col-span-2 bg-white border border-blue-100 py-2 rounded font-bold text-slate-700 text-sm">
                        {data.receita_longe_od_esferico || '-'}
                    </div>
                    <div className="col-span-2 bg-white border border-blue-100 py-2 rounded font-bold text-slate-700 text-sm">
                        {data.receita_longe_od_cilindrico || '-'}
                    </div>
                    <div className="col-span-2 bg-white border border-blue-100 py-2 rounded font-bold text-slate-700 text-sm">
                        {data.receita_longe_od_eixo || '-'}
                    </div>

                    {/* OE */}
                    <div className="col-span-1 font-black text-blue-600 self-center text-sm">OE</div>
                    <div className="col-span-2 bg-white border border-blue-100 py-2 rounded font-bold text-slate-700 text-sm">
                        {data.receita_longe_oe_esferico || '-'}
                    </div>
                    <div className="col-span-2 bg-white border border-blue-100 py-2 rounded font-bold text-slate-700 text-sm">
                        {data.receita_longe_oe_cilindrico || '-'}
                    </div>
                    <div className="col-span-2 bg-white border border-blue-100 py-2 rounded font-bold text-slate-700 text-sm">
                        {data.receita_longe_oe_eixo || '-'}
                    </div>
                </div>

                <div className="flex justify-center gap-4 mt-3 pt-3 border-t border-blue-100 text-xs font-bold text-slate-600">
                    {data.receita_adicao && <span>Adição: <span className="text-blue-700">{data.receita_adicao}</span></span>}
                    {data.medida_dnp_od && <span>DNP OD: <span className="text-blue-700">{data.medida_dnp_od}</span></span>}
                    {data.medida_dnp_oe && <span>DNP OE: <span className="text-blue-700">{data.medida_dnp_oe}</span></span>}
                </div>
            </div>

            {/* 3. O PRODUTO (ITENS DA VENDA) */}
            <div>
                <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-slate-400" /> Produtos Adquiridos
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase">
                            <tr>
                                <th className="px-4 py-2">Item</th>
                                <th className="px-4 py-2 text-right">Valor</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {venda?.venda_itens?.map((item: any, idx: number) => (
                                <tr key={idx} className="bg-white">
                                    <td className="px-4 py-2">
                                        <p className="font-bold text-slate-700">{item.descricao}</p>
                                        <p className="text-[10px] text-slate-400 uppercase">{item.item_tipo}</p>
                                    </td>
                                    <td className="px-4 py-2 text-right text-slate-600">
                                        {formatCurrency(item.valor_unitario)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 4. RODAPÉ (FINANCEIRO) */}
            <div className="bg-slate-100 rounded-xl p-4 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-full ${venda?.valor_restante > 0.01 ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                        <DollarSign className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase">Situação Financeira</p>
                        <p className={`font-bold text-sm ${venda?.valor_restante > 0.01 ? 'text-amber-600' : 'text-green-600'}`}>
                            {venda?.valor_restante > 0.01 ? 'Pagamento Pendente' : 'Totalmente Quitado'}
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-xs text-slate-400 uppercase font-bold">Total da Compra</p>
                    <p className="text-xl font-black text-slate-800">{formatCurrency(venda?.valor_final || 0)}</p>
                </div>
            </div>

        </div>
        
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 text-right">
            <button onClick={onClose} className="px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg transition-colors text-sm">
                Fechar Visualização
            </button>
        </div>
      </div>
    </div>
  )
}