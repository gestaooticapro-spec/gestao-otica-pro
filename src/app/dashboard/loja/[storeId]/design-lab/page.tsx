'use client'

import { useState } from 'react'
import { 
  Save, User, Eye, Ruler, 
  CalendarClock, Truck, QrCode, 
  History, Printer, ArrowLeft, MessageCircle
} from 'lucide-react'

// --- NOVO DESIGN SYSTEM (DARK MINIMAL V2) ---

const darkCard = "bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg mb-3"
const labelStyle = "block text-[9px] font-bold text-slate-400 uppercase mb-0.5 tracking-wider"
const inputStyle = "block w-full h-8 rounded-md border-0 bg-white text-slate-900 text-xs px-2 focus:ring-2 focus:ring-blue-500 font-bold placeholder:text-slate-300 transition-all disabled:opacity-50 disabled:bg-gray-200"

// Título de Seção com linha divisória
const SectionHeader = ({ icon: Icon, title }: { icon: any, title: string }) => (
    <div className="flex items-center gap-2 mb-2 pl-1 pt-2">
        <div className="p-1 bg-slate-200 rounded text-slate-700"><Icon className="h-3 w-3" /></div>
        <h3 className="text-xs font-black text-slate-700 uppercase">{title}</h3>
        <div className="flex-1 h-px bg-slate-300 ml-2"></div>
    </div>
)

export default function DesignLabOSPage() {
  return (
    // CONTAINER MESTRE (Ocupa toda a largura, sem sidebar)
    <div className="flex h-[calc(100vh-120px)] w-full overflow-hidden bg-slate-100 rounded-xl border border-slate-200 shadow-sm relative">
      
      {/* 1. HEADER FIXO (BARRA DE FERRAMENTAS) */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-slate-900 border-b border-slate-800 px-6 flex justify-between items-center shadow-md z-20">
            <div className="flex items-center gap-4">
                <button className="text-slate-400 hover:text-white transition-colors">
                    <ArrowLeft className="h-5 w-5" />
                </button>
                
                {/* Protocolo em Destaque */}
                <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Protocolo</label>
                    <div className="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded border border-slate-700">
                        <QrCode className="h-4 w-4 text-blue-400" />
                        <span className="text-sm font-mono font-bold text-white tracking-widest">550-2025</span>
                    </div>
                </div>

                <div className="h-8 w-px bg-slate-700 mx-2"></div>

                <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Status</label>
                    <select className="h-8 rounded bg-blue-600 text-white text-xs font-bold border-none px-3 cursor-pointer hover:bg-blue-500 transition-colors">
                        <option>No Laboratório</option>
                        <option>Montagem</option>
                        <option>Aguardando Cliente</option>
                        <option>Entregue</option>
                    </select>
                </div>
            </div>

            <div className="text-right">
                <p className="text-[9px] text-slate-400 uppercase font-bold flex items-center justify-end gap-1">
                    <CalendarClock className="h-3 w-3" /> Prazo
                </p>
                <p className="text-base font-black text-green-400">20/12/2025</p>
            </div>
      </div>

      {/* 2. MIOLO DO FORMULÁRIO (Rolagem Interna) */}
      <div className="absolute top-16 bottom-16 left-0 right-0 overflow-y-auto p-6 custom-scrollbar bg-gradient-to-br from-gray-100 to-gray-200">
         <div className="max-w-5xl mx-auto space-y-4">

            {/* --- BLOCO 1: IDENTIFICAÇÃO & PRODUTOS --- */}
            <div className="grid grid-cols-12 gap-4">
                {/* Coluna Esquerda: Pessoas */}
                <div className="col-span-5">
                    <SectionHeader icon={User} title="Cliente & Médico" />
                    <div className={darkCard}>
                        <div className="space-y-2">
                            <div>
                                <label className={labelStyle}>Paciente</label>
                                <div className="flex gap-2">
                                    <select className={inputStyle}>
                                        <option>Ana Souza (Titular)</option>
                                        <option>Pedro (Dependente)</option>
                                    </select>
                                    <button className="bg-green-600 w-10 rounded text-white flex items-center justify-center hover:bg-green-500 shadow-sm" title="WhatsApp">
                                        <MessageCircle className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className={labelStyle}>Oftalmologista</label>
                                    <input className={inputStyle} placeholder="Nome ou CRM" />
                                </div>
                                <div>
                                    <label className={labelStyle}>Vendedor</label>
                                    <input className={inputStyle} value="João Silva" disabled />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Coluna Direita: Produtos */}
                <div className="col-span-7">
                    <SectionHeader icon={Eye} title="Produtos Vinculados" />
                    <div className={darkCard}>
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className={labelStyle}>Lente OD</label>
                                    <input className={inputStyle} value="Hoya BlueControl 1.59" readOnly />
                                </div>
                                <div>
                                    <label className={labelStyle}>Lente OE</label>
                                    <input className={inputStyle} value="Hoya BlueControl 1.59" readOnly />
                                </div>
                            </div>
                            <div className="grid grid-cols-12 gap-2">
                                <div className="col-span-8">
                                    <label className={labelStyle}>Armação</label>
                                    <input className={inputStyle} value="Rayban Aviator Preto Metálico" readOnly />
                                </div>
                                <div className="col-span-4">
                                    <label className={labelStyle}>Tratamento</label>
                                    <input className={inputStyle} value="AR Premium" readOnly />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- BLOCO 2: DADOS TÉCNICOS (GRID DENSA) --- */}
            <div>
                <SectionHeader icon={Ruler} title="Receita & Medidas" />
                <div className={darkCard}>
                    {/* Linha de Cabeçalho da Tabela */}
                    <div className="grid grid-cols-12 gap-2 mb-1 text-center pr-2">
                        <div className="col-span-1"></div>
                        <div className="col-span-2 text-[9px] font-bold text-slate-400">ESFÉRICO</div>
                        <div className="col-span-2 text-[9px] font-bold text-slate-400">CILÍNDRICO</div>
                        <div className="col-span-2 text-[9px] font-bold text-slate-400">EIXO</div>
                        <div className="col-span-1 text-[9px] font-bold text-slate-400">DNP</div>
                        <div className="col-span-1 text-[9px] font-bold text-slate-400">ALTURA</div>
                        <div className="col-span-3 text-[9px] font-bold text-slate-400 border-l border-slate-600 pl-1">OBS</div>
                    </div>

                    {/* OD */}
                    <div className="grid grid-cols-12 gap-2 items-center mb-2">
                        <div className="col-span-1 text-right font-black text-blue-400 text-sm">OD</div>
                        <div className="col-span-2"><input className={inputStyle + " text-center"} placeholder="-0.00" /></div>
                        <div className="col-span-2"><input className={inputStyle + " text-center"} placeholder="-0.00" /></div>
                        <div className="col-span-2"><input className={inputStyle + " text-center"} placeholder="0º" /></div>
                        <div className="col-span-1"><input className={inputStyle + " text-center bg-blue-50 text-blue-900"} placeholder="mm" /></div>
                        <div className="col-span-1"><input className={inputStyle + " text-center bg-blue-50 text-blue-900"} placeholder="mm" /></div>
                        {/* Obs Unificada Rowspan */}
                        <div className="col-span-3 row-span-2 pl-2 border-l border-slate-600">
                             <textarea className="w-full h-[72px] rounded bg-white text-xs p-1 resize-none" placeholder="Obs técnica..."></textarea>
                        </div>
                    </div>

                    {/* OE */}
                    <div className="grid grid-cols-12 gap-2 items-center mb-3">
                        <div className="col-span-1 text-right font-black text-blue-400 text-sm">OE</div>
                        <div className="col-span-2"><input className={inputStyle + " text-center"} placeholder="-0.00" /></div>
                        <div className="col-span-2"><input className={inputStyle + " text-center"} placeholder="-0.00" /></div>
                        <div className="col-span-2"><input className={inputStyle + " text-center"} placeholder="0º" /></div>
                        <div className="col-span-1"><input className={inputStyle + " text-center bg-blue-50 text-blue-900"} placeholder="mm" /></div>
                        <div className="col-span-1"><input className={inputStyle + " text-center bg-blue-50 text-blue-900"} placeholder="mm" /></div>
                    </div>

                    {/* Linha Extra (Adição e Armação) */}
                    <div className="grid grid-cols-12 gap-2 pt-2 border-t border-slate-700 mt-2">
                        <div className="col-span-2">
                            <label className={labelStyle + " text-green-400"}>Adição</label>
                            <input className={inputStyle + " text-center font-black"} placeholder="+2.00" />
                        </div>
                        <div className="col-span-2">
                            <label className={labelStyle}>Ponte</label>
                            <input className={inputStyle + " text-center"} />
                        </div>
                        <div className="col-span-2">
                            <label className={labelStyle}>Vertical</label>
                            <input className={inputStyle + " text-center"} />
                        </div>
                        <div className="col-span-2">
                            <label className={labelStyle}>Horizontal</label>
                            <input className={inputStyle + " text-center"} />
                        </div>
                        <div className="col-span-2">
                            <label className={labelStyle}>Diagonal</label>
                            <input className={inputStyle + " text-center"} />
                        </div>
                         <div className="col-span-2">
                            <label className={labelStyle}>Diâmetro</label>
                            <input className={inputStyle + " text-center"} />
                        </div>
                    </div>
                </div>
            </div>

            {/* --- BLOCO 3: LABORATÓRIO (Rastreio Detalhado) --- */}
            <div>
                <SectionHeader icon={Truck} title="Rastreio do Laboratório" />
                <div className={darkCard}>
                    <div className="grid grid-cols-5 gap-3">
                        <div className="col-span-2">
                            <label className={labelStyle}>Laboratório / Pedido</label>
                            <div className="flex gap-2">
                                <input className={inputStyle} placeholder="Nome do Lab" />
                                <input className={inputStyle} placeholder="Nº Externo" />
                            </div>
                        </div>
                        <div>
                            <label className={labelStyle}>Enviado</label>
                            <input type="date" className={inputStyle} />
                        </div>
                         <div>
                            <label className={labelStyle}>Chegou Lente</label>
                            <input type="date" className={inputStyle} />
                        </div>
                         <div>
                            <label className={labelStyle}>Montado</label>
                            <input type="date" className={inputStyle} />
                        </div>
                    </div>
                </div>
            </div>

         </div>
      </div>

      {/* 3. RODAPÉ FIXO (BOTÕES DE AÇÃO) */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 px-6 flex justify-between items-center shadow-lg z-30">
            <div className="flex gap-2">
                 <button className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-2">
                    <History className="h-4 w-4" /> Histórico
                 </button>
                 <button className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-2">
                    <Printer className="h-4 w-4" /> Imprimir
                 </button>
            </div>
            <div className="flex gap-3">
                <button className="px-6 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 transition-colors uppercase">
                    Cancelar
                </button>
                <button className="px-8 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition-transform active:scale-95 flex items-center gap-2 uppercase tracking-wide">
                    <Save className="h-4 w-4" /> Salvar Ordem
                </button>
            </div>
      </div>

    </div>
  )
}