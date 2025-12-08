// Caminho: src/components/vendas/CollapsibleBox.tsx
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

type ColorScheme = 'blue' | 'emerald' | 'purple' | 'amber' | 'gray'

interface CollapsibleBoxProps {
  title: string
  // MUDANÇA 1: Agora aceitamos um ReactNode (o ícone já montado) em vez de LucideIcon
  icon: React.ReactNode 
  children: React.ReactNode
  color?: ColorScheme
  defaultOpen?: boolean
  badge?: string | number 
}

export default function CollapsibleBox({
  title,
  icon,
  children,
  color = 'gray',
  defaultOpen = false,
  badge
}: CollapsibleBoxProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const styles = {
    blue: {
      bgHeader: 'bg-blue-50',
      hoverHeader: 'hover:bg-blue-100',
      textTitle: 'text-blue-900',
      textIcon: 'text-blue-700', // Mantemos aqui caso precisemos usar em outro lugar, mas o ícone virá estilizado do pai
      border: 'border-blue-200',
      badge: 'bg-blue-200 text-blue-800'
    },
    emerald: {
      bgHeader: 'bg-emerald-50',
      hoverHeader: 'hover:bg-emerald-100',
      textTitle: 'text-emerald-900',
      textIcon: 'text-emerald-700',
      border: 'border-emerald-200',
      badge: 'bg-emerald-200 text-emerald-800'
    },
    purple: {
      bgHeader: 'bg-purple-50',
      hoverHeader: 'hover:bg-purple-100',
      textTitle: 'text-purple-900',
      textIcon: 'text-purple-700',
      border: 'border-purple-200',
      badge: 'bg-purple-200 text-purple-800'
    },
    amber: {
      bgHeader: 'bg-amber-50',
      hoverHeader: 'hover:bg-amber-100',
      textTitle: 'text-amber-900',
      textIcon: 'text-amber-700',
      border: 'border-amber-200',
      badge: 'bg-amber-200 text-amber-800'
    },
    gray: {
      bgHeader: 'bg-gray-50',
      hoverHeader: 'hover:bg-gray-100',
      textTitle: 'text-gray-800',
      textIcon: 'text-gray-600',
      border: 'border-gray-300',
      badge: 'bg-gray-200 text-gray-800'
    }
  }

  const currentStyle = styles[color]

  return (
    <div className={`border rounded-xl shadow-sm overflow-hidden bg-white ${currentStyle.border}`}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex justify-between items-center px-4 py-3 cursor-pointer transition-colors select-none ${currentStyle.bgHeader} ${currentStyle.hoverHeader}`}
      >
        <div className="flex items-center gap-3">
          {/* MUDANÇA 2: Renderizamos o ícone diretamente, pois ele já vem como elemento */}
          {icon}
          
          <h2 className={`font-bold text-base ${currentStyle.textTitle}`}>{title}</h2>
          
          {badge && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${currentStyle.badge}`}>
              {badge}
            </span>
          )}
        </div>

        <div className={currentStyle.textIcon}>
          {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
      </div>

      {isOpen && (
        <div className="p-4 animate-in slide-in-from-top-2 fade-in duration-200">
          {children}
        </div>
      )}
    </div>
  )
}