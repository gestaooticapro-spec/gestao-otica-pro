'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  title: string
  icon: React.ReactNode
  colorClass: string
  defaultExpanded?: boolean
  children: React.ReactNode
}

export default function ExpandableReportCard({ title, icon, colorClass, defaultExpanded = false, children }: Props) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div className={`bg-black/40 border border-white/5 rounded-3xl backdrop-blur-md overflow-hidden transition-all duration-300 ${isExpanded ? 'ring-1 ring-white/10 shadow-xl' : 'hover:bg-white/5'}`}>
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-5 text-left transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-4">
            <div className={`p-2 rounded-xl ${colorClass.includes('fuchsia') ? 'bg-fuchsia-500/20 text-fuchsia-400' : 
                             colorClass.includes('emerald') ? 'bg-emerald-500/20 text-emerald-400' :
                             colorClass.includes('blue') ? 'bg-blue-500/20 text-blue-400' :
                             colorClass.includes('rose') ? 'bg-rose-500/20 text-rose-400' :
                             'bg-amber-500/20 text-amber-400'}`}>
                {icon}
            </div>
            <h3 className="text-slate-200 font-bold uppercase tracking-widest text-sm lg:text-base">{title}</h3>
        </div>
        <div className="text-slate-500 bg-white/5 p-2 rounded-full">
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {isExpanded && (
        <div className="p-6 border-t border-white/5 animate-in slide-in-from-top-2 duration-300">
          {children}
        </div>
      )}
    </div>
  )
}
