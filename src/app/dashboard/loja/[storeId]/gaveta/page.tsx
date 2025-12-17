import { getGavetaItems } from '@/lib/actions/gaveta.actions'
import Link from 'next/link'
import { Archive, User, DollarSign, MessageCircle, Clock, AlertTriangle } from 'lucide-react'

// Força a página a ser dinâmica para sempre buscar dados frescos do banco
export const dynamic = 'force-dynamic'

export default async function GavetaPage({
  params
}: {
  params: { storeId: string }
}) {
  const storeId = parseInt(params.storeId)
  const { data: itens, success } = await getGavetaItems(storeId)

  // Função auxiliar para limpar telefone
  const formatPhoneForWhatsapp = (phone: string) => {
    return phone.replace(/\D/g, '')
  }

  // Calcula dias na gaveta
  const getDaysWaiting = (dateString: string) => {
    const readyDate = new Date(dateString)
    const today = new Date()
    const diffTime = Math.abs(today.getTime() - readyDate.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) 
  }

  return (
    <div className="p-6 max-w-7xl mx-auto min-h-[calc(100vh-64px)] flex flex-col">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-800 flex items-center gap-3 tracking-tight">
            <Archive className="h-8 w-8 text-amber-600" />
            Gaveta de Prontos
          </h1>
          <p className="text-gray-500 font-medium mt-1">
            Óculos prontos aguardando retirada pelo cliente.
          </p>
        </div>
        <div className="bg-amber-100 text-amber-800 px-4 py-2 rounded-xl font-bold flex items-center gap-2">
            <span className="text-2xl">{itens?.length || 0}</span>
            <span className="text-xs uppercase opacity-70">Aguardando</span>
        </div>
      </div>

      {!success || !itens || itens.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-3xl m-4">
          <Archive className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg font-bold">A gaveta está vazia!</p>
          <p className="text-sm">Todos os óculos prontos já foram entregues.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {itens.map((item: any) => {
            const diasEspera = getDaysWaiting(item.dt_montado_em)
            const isAtrasado = diasEspera > 7 // Mais de uma semana esperando
            
            // LÓGICA DE IDENTIFICAÇÃO (CRUCIAL):
            // Prioriza o nome do Dependente (quem usa o óculos). Se não houver, usa o Cliente.
            const nomePaciente = item.dependente?.nome_completo || item.customers?.full_name || 'Consumidor';
            const nomeCliente = item.customers?.full_name || 'Cliente'; // Para o WhatsApp
            
            // CORREÇÃO DO BUG DO TELEFONE:
            // Tenta 'fone_movel' primeiro, depois 'mobile_phone' (fallback)
            const telefoneRaw = item.customers?.fone_movel || item.customers?.mobile_phone || '';

            // Mensagem Personalizada
            const whatsappMessage = `Olá ${nomeCliente.split(' ')[0]}! Tudo bem? Aqui é da Ótica. Os óculos de *${nomePaciente}* ficaram prontos! Quando puder, passe aqui para retirar e ajustar. 😎`
            const whatsappLink = `https://wa.me/55${formatPhoneForWhatsapp(telefoneRaw)}?text=${encodeURIComponent(whatsappMessage)}`

            return (
              <div key={item.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden hover:shadow-md transition-all group ${isAtrasado ? 'border-red-200 ring-1 ring-red-100' : 'border-slate-200'}`}>
                
                {/* Faixa de Status */}
                <div className={`px-4 py-2 text-xs font-black uppercase tracking-widest flex justify-between items-center ${isAtrasado ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                    <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Pronto há {diasEspera} dia{diasEspera !== 1 && 's'}
                    </span>
                    <span className="opacity-70">OS #{item.id}</span>
                </div>

                <div className="p-5">
                    {/* Identificação do Paciente (Dono do Óculos) */}
                    <div className="mb-6">
                        <h3 className="font-bold text-slate-800 text-lg truncate flex items-center gap-2" title={nomePaciente}>
                            <User className="h-5 w-5 text-slate-400 shrink-0" />
                            {nomePaciente}
                        </h3>
                        {/* Se for dependente, mostra quem é o responsável logo abaixo */}
                        {item.dependente && (
                            <p className="text-xs text-slate-500 pl-7 truncate">
                                Resp: {nomeCliente}
                            </p>
                        )}
                        <p className="text-xs text-slate-400 pl-7 mt-1">
                            Montado em: {new Date(item.dt_montado_em).toLocaleDateString('pt-BR')}
                        </p>
                    </div>

                    {/* Ações */}
                    <div className="grid grid-cols-2 gap-3">
                        <Link 
                            href={`/dashboard/loja/${storeId}/vendas/${item.venda_id || ''}`}
                            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                        >
                            <DollarSign className="h-4 w-4" />
                            Ver Venda
                        </Link>

                        {telefoneRaw ? (
                            <a 
                                href={whatsappLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-200 transition-transform active:scale-95"
                            >
                                <MessageCircle className="h-4 w-4" />
                                Avisar
                            </a>
                        ) : (
                            <button disabled className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-gray-100 text-gray-400 cursor-not-allowed">
                                <AlertTriangle className="h-4 w-4" />
                                Sem Whats
                            </button>
                        )}
                    </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}