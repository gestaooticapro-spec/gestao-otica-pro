'use client'

import { useRouter } from 'next/navigation'
import { Tag } from 'lucide-react'

export default function FiltroMarcaEstoque({
    marcas,
    selecionada
}: {
    marcas: string[],
    selecionada: string
}) {
    const router = useRouter()

    return (
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md">
                <Tag className="w-4 h-4 text-pink-400" />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Marca Alvo</span>

                <select
                    value={selecionada}
                    onChange={(e) => {
                        const val = e.target.value
                        // Navegação nativa do Next.js preservando storeId da URL
                        const url = new URL(window.location.href)
                        url.searchParams.set('marca', val)
                        router.push(url.pathname + url.search)
                    }}
                    className="bg-transparent border-none text-sm font-bold text-white focus:ring-0 cursor-pointer min-w-[150px] outline-none appearance-none pr-8 relative"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='Length 19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.5rem center',
                        backgroundSize: '1em'
                    }}
                >
                    {marcas.map((m) => (
                        <option key={m} value={m} className="bg-slate-900 text-white">
                            {m}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    )
}
