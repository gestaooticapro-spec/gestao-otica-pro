'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function BackButton({ title = 'Voltar' }: { title?: string }) {
  const router = useRouter()

  return (
    <button
      onClick={() => router.back()}
      className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
      title={title}
    >
      <ArrowLeft className="h-4 w-4" />
    </button>
  )
}
