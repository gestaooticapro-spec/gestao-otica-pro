import FrameMeasurementTool from '@/components/medidas/FrameMeasurementTool'

export const metadata = { title: 'Medidor de Armação' }

export default function MedidasArmacaoPage() {
  return (
    <div className="min-h-screen bg-slate-950">
      <FrameMeasurementTool />
    </div>
  )
}
