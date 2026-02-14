'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, Loader2 } from 'lucide-react'
import { searchProductsForManualMatch } from '@/lib/actions/xml.actions'

interface ProductSearchComboboxProps {
    storeId: number
    onSelect: (product: { id: number, nome: string, codigo_barras: string, estoque_atual: number, referencia?: string }) => void
    onCancel: () => void
}

export function ProductSearchCombobox({ storeId, onSelect, onCancel }: ProductSearchComboboxProps) {
    const [search, setSearch] = useState('')
    const [results, setResults] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)

    const containerRef = useRef<HTMLDivElement>(null)

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (search.length >= 3) {
                setIsLoading(true)
                try {
                    const data = await searchProductsForManualMatch(search, storeId)
                    setResults(data || [])
                    setIsOpen(true)
                } catch (err) {
                    console.error(err)
                } finally {
                    setIsLoading(false)
                }
            } else {
                setResults([])
                setIsOpen(false)
            }
        }, 500)

        return () => clearTimeout(timer)
    }, [search, storeId])

    // Update coordinates
    const updatePosition = () => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            setCoords({
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width
            })
        }
    }

    useEffect(() => {
        if (isOpen) {
            updatePosition()
            window.addEventListener('scroll', updatePosition, true)
            window.addEventListener('resize', updatePosition)
        }
        return () => {
            window.removeEventListener('scroll', updatePosition, true)
            window.removeEventListener('resize', updatePosition)
        }
    }, [isOpen])

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                // Check if click is inside the portal dropdown (which is in document.body)
                // Since portal events bubble, we might need a specific ref for the dropdown content
                // But simplifying: just close if not clicking input. 
                // Wait, clicking the dropdown itself will trigger this if we don't check.
                // React Portals event bubbling means e.target inside portal will propagate to ancestors in React Tree.
                // But native DOM event listener on window won't see it as contained in containerRef.

                // We need to permit clicks on the portal.
                const dropdownEl = document.getElementById('combobox-portal')
                if (dropdownEl && dropdownEl.contains(e.target as Node)) return

                setIsOpen(false)
            }
        }
        if (isOpen) window.addEventListener('mousedown', handleClickOutside)
        return () => window.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])


    return (
        <div ref={containerRef} className="relative w-full max-w-sm">
            <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                    autoFocus
                    type="text"
                    placeholder="Buscar produto para vincular..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => {
                        if (search.length >= 3) setIsOpen(true)
                    }}
                />
                {isLoading && (
                    <Loader2 className="absolute right-3 top-2.5 h-4 w-4 text-indigo-400 animate-spin" />
                )}
            </div>

            {/* Portal do Dropdown */}
            {isOpen && coords && (results.length > 0 || search.length >= 3) && createPortal(
                <div
                    id="combobox-portal"
                    style={{
                        position: 'fixed',
                        top: coords.top,
                        left: coords.left,
                        width: coords.width,
                        zIndex: 9999
                    }}
                    className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-200"
                >
                    {/* Lista */}
                    {results.length > 0 ? (
                        <div className="p-1">
                            {results.map((product) => (
                                <button
                                    key={product.id}
                                    onClick={() => {
                                        onSelect(product)
                                        setIsOpen(false)
                                        setSearch('')
                                    }}
                                    className="w-full text-left px-3 py-2 rounded hover:bg-white/10 flex items-center justify-between group transition-colors"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-slate-200 group-hover:text-white truncate">
                                            {product.nome}
                                        </p>
                                        <div className="flex gap-2 text-[10px] text-slate-400 truncate">
                                            <span>Ref: {product.referencia || '-'}</span>
                                            <span>•</span>
                                            <span>EAN: {product.codigo_barras || '-'}</span>
                                        </div>
                                    </div>
                                    {/* Exibir se já tem estoque */}
                                    {product.estoque_atual > 0 && (
                                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 whitespace-nowrap ml-2">
                                            {product.estoque_atual} un
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="p-4 text-center text-xs text-slate-500">
                            {isLoading ? "Buscando..." : "Nenhum produto encontrado."}
                        </div>
                    )}

                    {/* Botão Cancelar Busca */}
                    <div className="border-t border-white/5 p-2">
                        <button
                            onClick={() => {
                                onCancel()
                                setIsOpen(false)
                            }}
                            className="w-full text-center text-xs text-red-400 hover:text-red-300 py-1"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    )
}
