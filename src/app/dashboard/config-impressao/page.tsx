'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Move, Copy, RotateCcw, Image as ImageIcon, Upload, Eye, EyeOff } from 'lucide-react'

// --- CONFIGURAÇÕES DO EDITOR ---
const MM_TO_PX = 3.78 // Escala: 1mm ~ 3.78px (Padrão Web)
const PAGE_WIDTH_MM = 297 // A4 Paisagem
const PAGE_HEIGHT_MM = 210

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
        { id: 'nome', label: 'NOME DO CLIENTE', x: 135, y: 43, color: 'bg-blue-500' },
        { id: 'valor1', label: 'VALOR TOTAL (1)', x: 170, y: 55, color: 'bg-emerald-500' },
        { id: 'valor2', label: 'VALOR TOTAL (2)', x: 170, y: 85, color: 'bg-emerald-600' },
        { id: 'data', label: 'DATA', x: 235, y: 60, color: 'bg-purple-500' },
        { id: 'obs', label: 'OBSERVAÇÕES', x: 220, y: 68, color: 'bg-orange-500' },
        { id: 'check', label: 'X (CHECKBOX)', x: 192, y: 65, color: 'bg-red-500' },
    ])

    const [draggingId, setDraggingId] = useState<string | null>(null)
    const [bgImage, setBgImage] = useState<string | null>(null)
    const [bgOpacity, setBgOpacity] = useState(0.5) // Transparência da imagem
    
    const containerRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // --- MANIPULAÇÃO DE ARRASTAR ---
    const handleMouseDown = (id: string) => setDraggingId(id)

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!draggingId || !containerRef.current) return

            const rect = containerRef.current.getBoundingClientRect()
            
            // Calcula a posição relativa ao container
            let newX = (e.clientX - rect.left) / MM_TO_PX
            let newY = (e.clientY - rect.top) / MM_TO_PX

            // Trava dentro dos limites da folha (0 até Largura/Altura Máxima)
            newX = Math.max(0, Math.min(PAGE_WIDTH_MM, newX))
            newY = Math.max(0, Math.min(PAGE_HEIGHT_MM, newY))

            setFields(prev => prev.map(f => 
                f.id === draggingId ? { ...f, x: Math.round(newX), y: Math.round(newY) } : f
            ))
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

    // --- FUNÇÕES AUXILIARES ---
    const generateCode = () => {
        const code = fields.map(f => `const ${f.id.toUpperCase()}_X = ${f.x}\nconst ${f.id.toUpperCase()}_Y = ${f.y}`).join('\n')
        navigator.clipboard.writeText(code)
        alert('Código copiado para a área de transferência!')
    }

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const url = URL.createObjectURL(file)
            setBgImage(url)
        }
    }

    return (
        <div className="p-8 bg-slate-100 min-h-screen font-sans text-slate-800">
            {/* --- CABEÇALHO --- */}
            <header className="mb-6 flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Move className="h-6 w-6 text-indigo-600" />
                        Calibrador Visual
                    </h1>
                    <p className="text-slate-500 text-sm">Use uma foto do formulário como fundo para alinhar os campos.</p>
                </div>
                
                <div className="flex gap-2 items-center bg-white p-2 rounded-lg shadow-sm border border-slate-200">
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition-colors"
                    >
                        <Upload className="h-4 w-4" /> Carregar Foto
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*"
                        onChange={handleImageUpload}
                    />

                    {bgImage && (
                        <div className="flex items-center gap-2 border-l pl-2 ml-2">
                            <Eye className="h-4 w-4 text-slate-400" />
                            <input 
                                type="range" 
                                min="0" max="1" step="0.1" 
                                value={bgOpacity}
                                onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
                                className="w-20 accent-indigo-600 cursor-pointer"
                                title="Ajustar transparência da foto"
                            />
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    <button onClick={() => window.location.reload()} className="px-4 py-2 bg-white border rounded-lg text-sm font-bold hover:bg-slate-50">
                        <RotateCcw className="h-4 w-4" />
                    </button>
                    <button onClick={generateCode} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg active:scale-95 transition-all">
                        <Copy className="h-4 w-4" /> Copiar Código
                    </button>
                </div>
            </header>

            <div className="flex gap-8 items-start">
                
                {/* --- ÁREA DE DESENHO (PAPEL) --- */}
                <div className="relative group">
                    <div className="absolute -top-6 left-0 text-xs font-bold text-slate-400">0,0</div>
                    <div 
                        ref={containerRef}
                        className="bg-white shadow-2xl border-2 border-slate-800 relative overflow-hidden"
                        style={{ 
                            width: `${PAGE_WIDTH_MM * MM_TO_PX}px`, 
                            height: `${PAGE_HEIGHT_MM * MM_TO_PX}px`,
                            // AQUI ESTÁ A MÁGICA DO BACKGROUND
                            backgroundImage: bgImage ? `url(${bgImage})` : 'none',
                            backgroundSize: '100% 100%', // Estica a foto para cobrir exatamente a folha
                            backgroundRepeat: 'no-repeat'
                        }}
                    >
                        {/* Camada Branca para dar o efeito de Opacidade na Imagem de Fundo */}
                        {bgImage && (
                            <div 
                                className="absolute inset-0 bg-white pointer-events-none"
                                style={{ opacity: 1 - bgOpacity }} 
                            />
                        )}

                        {/* Grade Milimetrada (Ajuda Visual) */}
                        <div className="absolute inset-0 opacity-10 pointer-events-none" 
                             style={{ 
                                 backgroundImage: 'linear-gradient(#000 0.5px, transparent 0.5px), linear-gradient(90deg, #000 0.5px, transparent 0.5px)', 
                                 backgroundSize: `${10 * MM_TO_PX}px ${10 * MM_TO_PX}px` 
                             }} 
                        />

                        {/* Campos Arrastáveis */}
                        {fields.map(field => (
                            <div
                                key={field.id}
                                onMouseDown={() => handleMouseDown(field.id)}
                                className={`
                                    absolute cursor-move select-none 
                                    flex flex-col items-center justify-center 
                                    transition-transform hover:scale-105 active:scale-110
                                    ${draggingId === field.id ? 'z-50' : 'z-10'}
                                `}
                                style={{
                                    left: `${field.x * MM_TO_PX}px`,
                                    top: `${field.y * MM_TO_PX}px`,
                                    transform: 'translate(-50%, -50%)' // Centraliza o ponto no mouse
                                }}
                            >
                                {/* Marcador de Centro (Cruz) */}
                                <div className="w-4 h-4 border-l border-t border-black absolute opacity-20 -translate-x-1/2 -translate-y-1/2" />
                                
                                {/* Caixa do Campo */}
                                <div className={`
                                    px-2 py-1 rounded text-[10px] text-white font-bold shadow-md whitespace-nowrap
                                    ${field.color} border border-white/50
                                `}>
                                    {field.label}
                                </div>
                                
                                {/* Coordenadas (Só aparece ao passar o mouse ou arrastar) */}
                                <div className="mt-1 bg-black/75 text-white text-[8px] px-1 rounded font-mono hidden group-hover:block">
                                    X:{field.x} Y:{field.y}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* --- CONTROLES MANUAIS (LADO DIREITO) --- */}
                <div className="w-64 bg-white p-4 rounded-xl shadow-sm border border-slate-200 shrink-0">
                    <h3 className="font-bold text-xs uppercase text-slate-400 tracking-wider mb-4 border-b pb-2">Ajuste Fino (mm)</h3>
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                        {fields.map(f => (
                            <div key={f.id} className="bg-slate-50 p-2 rounded border border-slate-100">
                                <div className="flex items-center gap-2 mb-1">
                                    <div className={`w-2 h-2 rounded-full ${f.color}`} />
                                    <span className="text-[10px] font-bold text-slate-600 truncate flex-1">{f.label}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center gap-1 bg-white border rounded px-1">
                                        <span className="text-[9px] text-slate-400 font-bold">X</span>
                                        <input 
                                            type="number" 
                                            value={f.x} 
                                            onChange={(e) => setFields(prev => prev.map(i => i.id === f.id ? {...i, x: Number(e.target.value)} : i))}
                                            className="w-full text-xs font-bold outline-none bg-transparent"
                                        />
                                    </label>
                                    <label className="flex items-center gap-1 bg-white border rounded px-1">
                                        <span className="text-[9px] text-slate-400 font-bold">Y</span>
                                        <input 
                                            type="number" 
                                            value={f.y} 
                                            onChange={(e) => setFields(prev => prev.map(i => i.id === f.id ? {...i, y: Number(e.target.value)} : i))}
                                            className="w-full text-xs font-bold outline-none bg-transparent"
                                        />
                                    </label>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="mt-4 p-3 bg-blue-50 rounded text-blue-800 text-[10px] leading-relaxed border border-blue-100">
                        <strong>Como usar a foto:</strong>
                        <ol className="list-decimal ml-3 mt-1 space-y-1">
                            <li>Tire uma foto do formulário inteiro.</li>
                            <li>Corte as bordas da foto para sobrar <strong>apenas o papel</strong>.</li>
                            <li>Clique em "Carregar Foto" acima.</li>
                            <li>Use o slider para deixar a foto transparente.</li>
                            <li>Arraste os campos para "casar" com as linhas.</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    )
}