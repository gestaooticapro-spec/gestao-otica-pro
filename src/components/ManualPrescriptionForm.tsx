'use client'

import { useState, type FormEvent } from 'react'
import { DegreeInput } from '@/components/ui/DegreeInput'
import { saveManualPrescription } from '@/lib/actions/manual-prescriptions.actions'
import { getLocalDateKey } from '@/lib/financing-dates'
import { calculateNearSphere, type degreeFields, type ManualPrescription } from '@/lib/manual-prescriptions'

const fieldStyle = 'w-full min-w-0 rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm'
const inputStyle = `${fieldStyle} text-white`
type Option = { id: number; nome: string }
type FormattedDegree = Exclude<(typeof degreeFields)[number], `${string}_eixo`>

export default function ManualPrescriptionForm({
    storeId, customerId, customerName, dependents, doctors, selectedDependentId, recipe, onCancel, onSaved,
}: {
    storeId: number
    customerId: number
    customerName: string
    dependents: Option[]
    doctors: Option[]
    selectedDependentId: number | null
    recipe?: ManualPrescription
    onCancel: () => void
    onSaved: (dependenteId: number | null) => void
}) {
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [degrees, setDegrees] = useState<Partial<Record<FormattedDegree, string | null>>>(recipe ?? {})

    function updateDegree(name: FormattedDegree, value: string) {
        setDegrees(previous => {
            const next = { ...previous, [name]: value }
            for (const eye of ['od', 'oe'] as const) {
                const far = `receita_longe_${eye}_esferico` as const
                const near = `receita_perto_${eye}_esferico` as const
                if (name !== 'receita_adicao' && name !== far) continue
                const calculated = calculateNearSphere(next[far], next.receita_adicao)
                const previousCalculation = calculateNearSphere(previous[far], previous.receita_adicao)
                if (calculated !== null || previous[near] === previousCalculation) next[near] = calculated
            }
            return next
        })
    }

    function degreeInput(name: FormattedDegree) {
        return <DegreeInput name={name} value={degrees[name] ?? ''}
            onChange={value => updateDegree(name, value)}
            className={`${fieldStyle} text-center`} />
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (saving) return
        const form = new FormData(event.currentTarget)
        setSaving(true)
        setError('')
        try {
            const result = await saveManualPrescription(storeId, customerId, form, recipe?.id ?? null)
            if (result.success) onSaved(Number(form.get('dependente_id')) || null)
            else setError(result.message || 'Não foi possível salvar a receita.')
        } catch {
            setError('Não foi possível confirmar o salvamento da receita. Confira o histórico.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            <h4 className="text-sm font-bold text-white">{recipe ? 'Editar grau avulso' : 'Cadastrar grau avulso'}</h4>
            <fieldset disabled={saving} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                    <label className="space-y-1 text-xs text-slate-300">
                        <span>Paciente</span>
                        <select name="dependente_id" defaultValue={(recipe ? recipe.dependente_id : selectedDependentId) ?? ''} className={inputStyle}>
                            <option value="">{customerName || 'Titular'} (Titular)</option>
                            {dependents.map(dep => <option key={dep.id} value={dep.id}>{dep.nome}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1 text-xs text-slate-300">
                        <span>Data da receita</span>
                        <input type="date" name="data_receita" defaultValue={recipe?.data_receita ?? getLocalDateKey()} required className={inputStyle} />
                    </label>
                    <label className="space-y-1 text-xs text-slate-300">
                        <span>Médico</span>
                        <select name="oftalmologista_id" defaultValue={recipe?.oftalmologista_id ?? ''} className={inputStyle}>
                            <option value="">Não informado</option>
                            {doctors.map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.nome}</option>)}
                        </select>
                    </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    {(['longe', 'perto'] as const).map(distance => (
                        <div key={distance} className="space-y-2 rounded-xl border border-white/10 p-3">
                            <p className="text-xs font-bold text-sky-200">Para {distance}</p>
                            <div className="grid grid-cols-[auto_repeat(3,minmax(0,1fr))] items-center gap-2 text-center text-xs text-slate-300">
                                <span /><span>ESF</span><span>CIL</span><span>EIXO</span>
                                {(['od', 'oe'] as const).map(eye => (
                                    <div key={eye} className="contents">
                                        <span className="font-bold uppercase">{eye}</span>
                                        {([['esferico', 'Esférico'], ['cilindrico', 'Cilíndrico']] as const).map(([field, label]) => (
                                            <label key={field} className="min-w-0">
                                                <span className="sr-only">{label} para {distance}, {eye.toUpperCase()}</span>
                                                {degreeInput(`receita_${distance}_${eye}_${field}`)}
                                            </label>
                                        ))}
                                        <input name={`receita_${distance}_${eye}_eixo`}
                                            defaultValue={recipe?.[`receita_${distance}_${eye}_eixo`] ?? ''}
                                            aria-label={`Eixo para ${distance}, ${eye.toUpperCase()}`}
                                            inputMode="numeric" placeholder="0–180" maxLength={8} className={inputStyle} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <label className="space-y-1 text-xs text-slate-300">
                        <span>Adição</span>
                        {degreeInput('receita_adicao')}
                    </label>
                    {([
                        ['medida_dnp_od', 'DNP OD'], ['medida_dnp_oe', 'DNP OE'],
                        ['medida_altura_od', 'Altura OD'], ['medida_altura_oe', 'Altura OE'],
                    ] as const).map(([name, label]) => (
                        <label key={name} className="space-y-1 text-xs text-slate-300">
                            <span>{label}</span>
                            <input name={name} defaultValue={recipe?.[name] ?? ''} maxLength={24} className={inputStyle} />
                        </label>
                    ))}
                </div>
                <label className="block space-y-1 text-xs text-slate-300">
                    <span>Observações</span>
                    <textarea name="obs_os" defaultValue={recipe?.obs_os ?? ''} maxLength={2000} rows={2} className={inputStyle} />
                </label>
            </fieldset>
            {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} disabled={saving} className="px-3 py-2 text-sm text-slate-300 disabled:opacity-50">Cancelar</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-50">
                    {saving ? 'Salvando…' : 'Salvar grau'}
                </button>
            </div>
        </form>
    )
}
