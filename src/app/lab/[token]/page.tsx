import { notFound } from 'next/navigation'
import { getOSByLabToken } from '@/lib/actions/medidas.actions'
import { LabPhotoViewer } from './LabPhotoViewer'

export const metadata = { title: 'Medidas da Armação | Ótica Pro' }

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex justify-between py-2 border-b border-white/5 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-bold text-white">{value}</span>
    </div>
  )
}

export default async function LabTokenPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const os = await getOSByLabToken(params.token)
  if (!os) return notFound()

  const proto = os.protocolo_fisico ?? `OS #${os.id}`
  const temReceita = os.receita_longe_od_esferico || os.receita_longe_oe_esferico
  const temMedidas = os.medida_dnp_od || os.medida_dnp_oe

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6 pt-4">
        {os.store_name && (
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">{os.store_name}</p>
        )}
        <h1 className="text-2xl font-black">{proto}</h1>
        {os.patient_name && (
          <p className="text-slate-400 mt-1">{os.patient_name}</p>
        )}
      </div>

      {/* Foto */}
      {os.foto_medicao_url && (
        <div className="mb-6">
          <LabPhotoViewer url={os.foto_medicao_url} />
        </div>
      )}

      {/* Medidas */}
      {temMedidas && (
        <div className="mb-6 bg-slate-900 rounded-2xl p-4 border border-white/10">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Medidas</h2>

          <div className="grid grid-cols-2 gap-x-6">
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">OD</p>
              <Row label="DNP" value={os.medida_dnp_od} />
              <Row label="Altura" value={os.medida_altura_od} />
              <Row label="Diâm. mín." value={os.medida_diametro_od} />
              <Row label="Pálpebra" value={os.medida_palpebra_od} />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">OE</p>
              <Row label="DNP" value={os.medida_dnp_oe} />
              <Row label="Altura" value={os.medida_altura_oe} />
              <Row label="Diâm. mín." value={os.medida_diametro_oe} />
              <Row label="Pálpebra" value={os.medida_palpebra_oe} />
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-white/5">
            <Row label="Horizontal" value={os.medida_horizontal} />
            <Row label="Vertical" value={os.medida_vertical} />
            <Row label="Ponte" value={os.medida_ponte} />
            <Row label="Diâmetro" value={os.medida_diametro} />
          </div>
        </div>
      )}

      {/* Receita */}
      {temReceita && (
        <div className="mb-6 bg-slate-900 rounded-2xl p-4 border border-white/10">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Receita</h2>
          <div className="grid grid-cols-3 gap-2 text-xs mb-2">
            <div />
            <div className="text-center font-bold text-slate-400">Esf</div>
            <div className="text-center font-bold text-slate-400">Cil / Eixo</div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="text-slate-400 flex items-center">OD</div>
            <div className="text-center font-bold">{os.receita_longe_od_esferico || '—'}</div>
            <div className="text-center font-bold">
              {os.receita_longe_od_cilindrico ? `${os.receita_longe_od_cilindrico} × ${os.receita_longe_od_eixo || '—'}°` : '—'}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm mt-2">
            <div className="text-slate-400 flex items-center">OE</div>
            <div className="text-center font-bold">{os.receita_longe_oe_esferico || '—'}</div>
            <div className="text-center font-bold">
              {os.receita_longe_oe_cilindrico ? `${os.receita_longe_oe_cilindrico} × ${os.receita_longe_oe_eixo || '—'}°` : '—'}
            </div>
          </div>
          {os.receita_adicao && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <Row label="Adição" value={os.receita_adicao} />
            </div>
          )}
        </div>
      )}

      <p className="text-center text-xs text-slate-600 pb-6">
        Acesso exclusivo para laboratório · gestao-otica-pro.vercel.app
      </p>
    </div>
  )
}
