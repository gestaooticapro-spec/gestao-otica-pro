import { getPublicTicket } from '@/lib/actions/assistance.actions'
import { CheckCircle2, Clock, MapPin, Package, Store, Search, FileText, AlertTriangle, MessageCircle } from 'lucide-react'
import { notFound } from 'next/navigation'

export const metadata = {
  title: 'Rastreio de Garantia | Ótica Pro',
}

// Mapa de Status do Banco -> Índice da Timeline (0 a 4)
const STATUS_MAP: Record<string, number> = {
  'Triagem': 0,            // Solicitação Aberta
  'EmTratativa': 1,        // Em Análise
  'AguardandoChegada': 2,  // Aguardando Peça
  'AguardandoCliente': 3,  // Peça na Loja
  'LogisticaReversa': 4,   // Finalizado / Devolução
  'Concluido': 4,          // Finalizado
}

export default async function RastreioPage({ params }: { params: { token: string } }) {
  const ticket = await getPublicTicket(params.token)

  if (!ticket) return notFound()

  // Define o índice ativo com base no Status do Banco
  const currentStepIndex = STATUS_MAP[ticket.status as string] ?? 0
  const isCancelado = ticket.status === 'Cancelado'

  // Lógica do Link do WhatsApp Dinâmico
  const whatsappLoja = ticket.stores?.whatsapp 
      ? `55${ticket.stores.whatsapp.replace(/\D/g, '')}` 
      : '' 
  
  const linkFalar = whatsappLoja 
      ? `https://wa.me/${whatsappLoja}?text=${encodeURIComponent(`Olá, estou vendo o rastreio da minha garantia (Produto: ${ticket.product_descricao}) e gostaria de uma informação.`)}`
      : '#'

  const steps = [
    { 
      label: 'Solicitação Aberta', 
      date: ticket.dt_abertura, 
      icon: FileText, 
    },
    { 
      label: 'Em Tratativa com Fabricante', 
      date: ticket.dt_solicitacao_peca, 
      icon: Search, 
    },
    { 
      label: 'Aguardando Chegada da Peça', 
      date: null, 
      icon: Clock, 
    },
    { 
      label: 'Pronto para Retirada', 
      date: ticket.dt_chegada_peca || ticket.dt_troca_cliente, 
      icon: MapPin, 
    },
    { 
      label: 'Processo Finalizado', 
      date: ticket.dt_conclusao || ticket.dt_envio_fornecedor, 
      icon: CheckCircle2, 
    }
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
        
        {/* Header da Loja */}
        <div className={`p-8 text-center text-white relative overflow-hidden ${isCancelado ? 'bg-red-600' : 'bg-blue-600'}`}>
          <div className="absolute top-0 left-0 w-full h-full bg-white/10 opacity-20 transform -skew-y-6"></div>
          
          <div className="relative z-10">
            {isCancelado ? <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-white/90" /> : <Store className="h-12 w-12 mx-auto mb-3 text-white/80" />}
            
            <h1 className="text-xl font-black tracking-wide uppercase drop-shadow-md">
              {ticket.stores?.name || 'ÓTICA PARCEIRA'}
            </h1>
            <p className="text-white/80 text-xs mt-1 font-medium tracking-wider">Central de Relacionamento</p>
          </div>
        </div>

        {/* Resumo do Produto */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Produto em Assistência</p>
          <p className="text-lg font-black text-slate-800 leading-tight">
            {ticket.product_descricao}
          </p>
          
          <div className={`mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm ${isCancelado ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
            {!isCancelado && <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>}
            {isCancelado ? 'ATENDIMENTO CANCELADO' : (ticket.status_publico || 'Em Andamento')}
          </div>
        </div>

        {/* Timeline Vertical */}
        {!isCancelado ? (
          <div className="p-8 bg-white">
            <div className="relative border-l-2 border-slate-100 ml-3 space-y-10 pb-2">
              {steps.map((step, idx) => {
                const isCompleted = idx <= currentStepIndex
                const isCurrent = idx === currentStepIndex
                
                return (
                  <div key={idx} className="relative pl-8 group">
                    {/* Linha Conectora Colorida */}
                    {idx < currentStepIndex && (
                        <div className="absolute left-[-2px] top-6 w-[2px] h-[calc(100%+24px)] bg-blue-500 -z-10 transition-all duration-700"></div>
                    )}

                    {/* Ícone Bolinha */}
                    <div className={`
                      absolute -left-[14px] top-0 w-8 h-8 rounded-full border-2 flex items-center justify-center z-10 transition-all duration-300
                      ${isCompleted ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white border-slate-200 text-slate-300'}
                      ${isCurrent ? 'ring-4 ring-blue-100 scale-110' : ''}
                    `}>
                        <step.icon className="h-4 w-4" />
                    </div>
                    
                    {/* Texto */}
                    <div className={`transition-all duration-500 ${isCompleted ? 'opacity-100 translate-x-0' : 'opacity-40 translate-x-1'}`}>
                      <p className={`text-sm font-bold leading-none ${isCurrent ? 'text-blue-700 scale-105 origin-left' : 'text-slate-700'}`}>
                        {step.label}
                      </p>
                      {step.date && (
                        <p className="text-[10px] text-slate-500 mt-1.5 font-medium uppercase tracking-wide bg-slate-50 inline-block px-2 py-0.5 rounded border border-slate-100">
                          {new Date(step.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
            <div className="p-12 text-center text-slate-400 bg-slate-50">
                <p className="text-sm font-medium text-slate-500">O processo foi encerrado sem conclusão.</p>
                <p className="text-xs mt-2">Por favor, entre em contato com a loja.</p>
            </div>
        )}

        {/* Footer */}
        <div className="bg-slate-50 p-6 text-center border-t border-slate-100">
           <p className="text-xs text-slate-400 mb-4 font-medium">Precisa falar com a gente?</p>
           <a 
             href={linkFalar} 
             target="_blank"  
             className={`block w-full py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold shadow-lg shadow-green-200/50 transition-all active:scale-95 flex items-center justify-center gap-2 ${!whatsappLoja ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
           >
             <MessageCircle className="h-5 w-5" />
             Falar com Atendente
           </a>
        </div>
      </div>
      
      <p className="mt-8 text-[10px] text-slate-400 uppercase font-bold tracking-widest opacity-50">
        Rastreio Seguro • Gestão Ótica Pro
      </p>
    </div>
  )
}