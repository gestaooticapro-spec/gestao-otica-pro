'use client'

import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

export default function TowerAssetLabelsPrint({ batch, assets }: {
  batch: { id: string; batch_code: string; batch_name: string; quantity: number; status: string }
  assets: Array<{ id: string; public_code: string }>
}) {
  return <main className="min-h-screen bg-slate-100 p-6 text-slate-950 print:bg-white print:p-0"><header className="mx-auto mb-6 flex max-w-6xl items-center justify-between gap-4 print:hidden"><div><Link href="/admin/torres/equipamentos" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Voltar</Link><h1 className="mt-3 text-2xl font-black">{batch.batch_name}</h1><p className="text-sm text-slate-500">{batch.batch_code} · {assets.length} etiquetas</p></div><button type="button" onClick={() => window.print()} className="inline-flex h-12 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white"><Printer className="h-5 w-5" />Imprimir ou salvar PDF</button></header><section className="mx-auto grid max-w-[190mm] grid-cols-3 gap-2 print:gap-[2mm]">{assets.map((asset) => <article key={asset.id} className="flex min-h-[38mm] break-inside-avoid items-center gap-3 rounded-md border border-slate-400 bg-white p-3 print:min-h-[38mm]"><QRCodeSVG value={`MBTOWER-ASSET:1:${asset.public_code}`} size={92} level="H" marginSize={1} className="h-24 w-24 shrink-0" /><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">MBOptical · Torre</p><p className="mt-1 font-mono text-base font-black leading-tight">{asset.public_code}</p><p className="mt-2 text-[8px] leading-3 text-slate-500">Identificação pública permanente. Não contém senha ou credencial.</p></div></article>)}</section><style jsx global>{`@page { size: A4; margin: 8mm; } @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style></main>
}
