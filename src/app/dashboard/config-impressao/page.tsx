'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Move, Copy, RotateCcw, Upload, Eye } from 'lucide-react'

// --- CONFIGURAÇÕES ---
const MM_TO_PX = 3.78 
const PAGE_WIDTH_MM = 210 
const PAGE_HEIGHT_MM = 297

interface Field {
    id: string
    label: string
    x: number
    y: number
    color: string
}

export default function PrintLayoutEditor() {
    // --- ESTADOS ---
    const [fields, setFields] = useState<Field[]>([
        // ==============================
        //        VIA SUPERIOR
        // ==============================
        { id: 'os_sup', label: 'Nº O.S.', x: 77, y: 44, color: 'bg-rose-500' },
        { id: 'nome_sup', label: 'Cliente', x: 28, y: 44, color: 'bg-blue-500' },
        
        { id: 'data_dia_sup', label: 'Dia', x: 24, y: 38, color: 'bg-blue-400' },
        { id: 'data_mes_sup', label: 'Mês', x: 36, y: 38, color: 'bg-blue-400' },
        { id: 'data_ano_sup', label: 'Ano', x: 46, y: 38, color: 'bg-blue-400' },

        { id: 'total_vista_sup', label: 'Total à Vista', x: 40, y: 55, color: 'bg-orange-400' },
        { id: 'sinal_sup', label: 'Sinal', x: 26, y: 60, color: 'bg-orange-400' },
        { id: 'retirada_sup', label: 'Retirada', x: 33, y: 66, color: 'bg-orange-400' },
        
        { id: 'total_prazo_sup', label: 'Total a Prazo', x: 82, y: 55, color: 'bg-orange-500' },
        { id: 'entrada_sup', label: 'Entrada', x: 82, y: 60, color: 'bg-orange-500' }, 
        { id: 'parcelas_sup', label: 'Qtd Parc.', x: 59, y: 66, color: 'bg-orange-500' },
        { id: 'vlr_parcela_sup', label: 'Valor Parc. R$', x: 91, y: 66, color: 'bg-orange-600' },

        { id: 'entrega_dia_sup', label: 'Dia', x: 43, y: 75, color: 'bg-teal-500' },
        { id: 'entrega_mes_sup', label: 'Mês', x: 55, y: 75, color: 'bg-teal-500' },
        { id: 'entrega_hora_sup', label: 'Hora', x: 68, y: 75, color: 'bg-teal-600' },
        { id: 'entrega_min_sup', label: 'Min', x: 76, y: 75, color: 'bg-teal-600' },

        // ==============================
        //        VIA INFERIOR
        // ==============================
        { id: 'os_inf', label: 'Nº O.S.', x: 78, y: 98, color: 'bg-rose-600' },
        { id: 'fone_inf', label: 'Telefone', x: 73, y: 104, color: 'bg-blue-400' },
        { id: 'nome_inf', label: 'Nome Completo', x: 28, y: 110, color: 'bg-blue-600' },

        { id: 'data_dia_inf', label: 'Dia', x: 21, y: 104, color: 'bg-blue-400' },
        { id: 'data_mes_inf', label: 'Mês', x: 35, y: 104, color: 'bg-blue-400' },
        { id: 'data_ano_inf', label: 'Ano', x: 47, y: 104, color: 'bg-blue-400' },

        { id: 'total_vista_inf', label: 'Total Vista', x: 38, y: 120, color: 'bg-orange-400' },
        { id: 'sinal_inf', label: 'Sinal', x: 27, y: 125, color: 'bg-orange-400' },
        { id: 'restante_inf', label: 'Restante', x: 33, y: 132, color: 'bg-orange-400' },
        
        { id: 'total_prazo_inf', label: 'Total Prazo', x: 83, y: 120, color: 'bg-orange-500' },
        { id: 'entrada_inf', label: 'Entrada', x: 75, y: 125, color: 'bg-orange-500' },
        { id: 'parc_detalhe_inf', label: 'Desc. Parc.', x: 63, y: 132, color: 'bg-orange-500' },
        { id: 'vlr_parcela_inf', label: 'Valor Parc. R$', x: 85, y: 132, color: 'bg-orange-600' },

        { id: 'entrega_dia_inf', label: 'Dia', x: 48, y: 139, color: 'bg-teal-500' },
        { id: 'entrega_mes_inf', label: 'Mês', x: 56, y: 139, color: 'bg-teal-500' },
        { id: 'entrega_hora_inf', label: 'Hora', x: 70, y: 139, color: 'bg-teal-600' },
        { id: 'entrega_min_inf', label: 'Min', x: 78, y: 139, color: 'bg-teal-600' },

        // ==============================
        //        DADOS TÉCNICOS
        // ==============================
        { id: 'od_esf', label: 'OD Esf', x: 17, y: 152, color: 'bg-emerald-500' },
        { id: 'od_cil', label: 'OD Cil', x: 31, y: 152, color: 'bg-emerald-500' },
        { id: 'od_eixo', label: 'OD Eixo', x: 45, y: 152, color: 'bg-emerald-500' },
        { id: 'od_dnp', label: 'OD DNP', x: 44, y: 146, color: 'bg-emerald-600' },
        
        { id: 'oe_esf', label: 'OE Esf', x: 62, y: 152, color: 'bg-emerald-500' },
        { id: 'oe_cil', label: 'OE Cil', x: 77, y: 152, color: 'bg-emerald-500' },
        { id: 'oe_eixo', label: 'OE Eixo', x: 95, y: 152, color: 'bg-emerald-500' },
        { id: 'oe_dnp', label: 'OE DNP', x: 90, y: 145, color: 'bg-emerald-600' },

        { id: 'adicao', label: 'Adição', x: 17, y: 158, color: 'bg-emerald-700' },
        { id: 'altura', label: 'Altura', x: 40, y: 158, color: 'bg-emerald-700' },
        { id: 'diametro', label: 'Diâmetro', x: 67, y: 158, color: 'bg-emerald-700' },
        { id: 'cor', label: 'Cor', x: 83, y: 158, color: 'bg-emerald-700' },

        { id: 'lente_desc', label: 'Desc. Lente', x: 34, y: 163, color: 'bg-purple-500' },
        { id: 'lente_valor', label: 'R$ Lente', x: 90, y: 164, color: 'bg-purple-600' },
        
        { id: 'armacao_desc', label: 'Desc. Armação', x: 30, y: 169, color: 'bg-purple-500' },
        { id: 'armacao_valor', label: 'R$ Armação', x: 92, y: 169, color: 'bg-purple-600' },

        { id: 'otico', label: 'Ótico Resp.', x: 43, y: 179, color: 'bg-slate-600' },
    ])

    const [draggingId, setDraggingId] = useState<string | null>(null)
    const [bgImage, setBgImage] = useState<string | null>(null)
    const [bgOpacity, setBgOpacity] = useState(0.5) 
    
    const containerRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleMouseDown = (id: string) => setDraggingId(id)

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!draggingId || !containerRef.current) return
            const rect = containerRef.current.getBoundingClientRect()
            let newX = (e.clientX - rect.left) / MM_TO_PX
            let newY = (e.clientY - rect.top) / MM_TO_PX
            newX = Math.max(0, Math.min(PAGE_WIDTH_MM, newX))
            newY = Math.max(0, Math.min(PAGE_HEIGHT_MM, newY))
            setFields(prev => prev.map(f => f.id === draggingId ? { ...f, x: Math.round(newX), y: Math.round(newY) } : f))
        }
        const handleMouseUp = () => setDraggingId(null)
        if (draggingId) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [draggingId])

    const generateCode = () => {
        const code = fields.map(f => `const ${f.id.toUpperCase()}_X = ${f.x} / ${f.id.toUpperCase()}_Y = ${f.y}`).join('\n')
        navigator.clipboard.writeText(code)
        alert('Coordenadas copiadas!')
    }

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            setBgImage(URL.createObjectURL(file))
        }
    }

    return (
        <div className="p-8 bg-slate-100 min-h-screen font-sans text-slate-800 flex flex-col items-center">
            <header className="w-full max-w-6xl mb-6 flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Move className="h-6 w-6 text-indigo-600" />
                        Calibrador: Protocolo Ótica (Alinhamento ESQUERDA)
                    </h1>
                    <p className="text-slate-500 text-sm">O bloco começa exatamente onde está a bolinha preta.</p>
                </div>
                
                <div className="flex gap-2 items-center bg-white p-2 rounded-lg shadow-sm border border-slate-200">
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition-colors">
                        <Upload className="h-4 w-4" /> Foto
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />

                    {bgImage && (
                        <div className="flex items-center gap-2 border-l pl-2 ml-2">
                            <Eye className="h-4 w-4 text-slate-400" />
                            <input type="range" min="0" max="1" step="0.1" value={bgOpacity} onChange={(e) => setBgOpacity(parseFloat(e.target.value))} className="w-20 accent-indigo-600 cursor-pointer" />
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    <button onClick={() => window.location.reload()} className="px-4 py-2 bg-white border rounded-lg text-sm font-bold hover:bg-slate-50"><RotateCcw className="h-4 w-4" /></button>
                    <button onClick={generateCode} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg active:scale-95 transition-all">
                        <Copy className="h-4 w-4" /> Copiar
                    </button>
                </div>
            </header>

            <div className="flex gap-8 items-start justify-center w-full max-w-6xl">
                <div className="relative group shadow-2xl">
                    <div className="absolute -top-6 left-0 text-xs font-bold text-slate-400">0,0 (mm)</div>
                    <div 
                        ref={containerRef}
                        className="bg-white border-2 border-slate-800 relative overflow-hidden"
                        style={{ 
                            width: `${PAGE_WIDTH_MM * MM_TO_PX}px`, 
                            height: `${PAGE_HEIGHT_MM * MM_TO_PX}px`,
                            backgroundImage: bgImage ? `url(${bgImage})` : 'none',
                            backgroundSize: '100% 100%',
                            backgroundRepeat: 'no-repeat'
                        }}
                    >
                        {bgImage && <div className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: 1 - bgOpacity }} />}
                        
                        {/* Grade de ajuda */}
                        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#000 0.5px, transparent 0.5px), linear-gradient(90deg, #000 0.5px, transparent 0.5px)', backgroundSize: `${10 * MM_TO_PX}px ${10 * MM_TO_PX}px` }} />

                        {fields.map(field => (
                            <div
                                key={field.id}
                                onMouseDown={() => handleMouseDown(field.id)}
                                className={`
                                    absolute cursor-move select-none 
                                    text-left origin-left
                                    transition-transform hover:scale-105 active:scale-110
                                    ${draggingId === field.id ? 'z-50' : 'z-10'}
                                `}
                                style={{
                                    left: `${field.x * MM_TO_PX}px`,
                                    top: `${field.y * MM_TO_PX}px`,
                                    // AQUI: Translate apenas no Y. O X é zero (fixo na esquerda)
                                    transform: 'translateY(-50%)' 
                                }}
                            >
                                {/* PONTO ZERO (MIRA) - Fica na borda esquerda */}
                                <div className="w-2 h-2 bg-black rounded-full absolute -left-1 top-1/2 -translate-y-1/2 opacity-70" />
                                
                                <div className={`
                                    px-2 py-0.5 rounded-r text-[9px] text-white font-bold shadow-sm whitespace-nowrap
                                    ${field.color} border border-white/50
                                `}>
                                    {field.label}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="w-64 bg-white p-4 rounded-xl shadow-sm border border-slate-200 shrink-0 h-[800px] flex flex-col">
                    <h3 className="font-bold text-xs uppercase text-slate-400 tracking-wider mb-4 border-b pb-2">Campos</h3>
                    <div className="space-y-2 overflow-y-auto pr-2 flex-1">
                        {fields.map(f => (
                            <div key={f.id} className="bg-slate-50 p-2 rounded border border-slate-100 hover:border-slate-300 transition-colors">
                                <div className="flex items-center gap-2 mb-1">
                                    <div className={`w-2 h-2 rounded-full ${f.color}`} />
                                    <span className="text-[10px] font-bold text-slate-700 truncate">{f.label}</span>
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex items-center gap-1 bg-white border rounded px-1 w-1/2">
                                        <span className="text-[8px] text-slate-400 font-bold">X</span>
                                        <input type="number" value={f.x} onChange={(e) => setFields(prev => prev.map(i => i.id === f.id ? {...i, x: Number(e.target.value)} : i))} className="w-full text-[10px] font-bold outline-none bg-transparent" />
                                    </div>
                                    <div className="flex items-center gap-1 bg-white border rounded px-1 w-1/2">
                                        <span className="text-[8px] text-slate-400 font-bold">Y</span>
                                        <input type="number" value={f.y} onChange={(e) => setFields(prev => prev.map(i => i.id === f.id ? {...i, y: Number(e.target.value)} : i))} className="w-full text-[10px] font-bold outline-none bg-transparent" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}