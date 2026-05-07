import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { DesktopModeButton } from '@/components/tablet/DesktopModeButton'

export default function TabletMenuPage({ params }: { params: { storeId: string } }) {
  const { storeId } = params

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8 gap-8">
      <h1 className="text-2xl font-bold tracking-wide">Menu Tablet</h1>

      <div className="grid grid-cols-2 gap-6 w-full max-w-lg">
        <Link
          href={`/tablet/${storeId}/os`}
          className="flex flex-col items-center justify-center gap-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-2xl p-10 transition-colors aspect-square"
        >
          <ClipboardList className="w-14 h-14" />
          <span className="text-xl font-bold">OS</span>
          <span className="text-xs text-indigo-200 text-center">Pedidos pendentes de laboratório</span>
        </Link>
      </div>

      <DesktopModeButton storeId={storeId} />
    </div>
  )
}
