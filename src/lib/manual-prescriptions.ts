export const degreeFields = [
    'receita_longe_od_esferico', 'receita_longe_od_cilindrico', 'receita_longe_od_eixo',
    'receita_longe_oe_esferico', 'receita_longe_oe_cilindrico', 'receita_longe_oe_eixo',
    'receita_perto_od_esferico', 'receita_perto_od_cilindrico', 'receita_perto_od_eixo',
    'receita_perto_oe_esferico', 'receita_perto_oe_cilindrico', 'receita_perto_oe_eixo',
    'receita_adicao',
] as const

export const prescriptionMeasureFields = [
    'medida_dnp_od', 'medida_dnp_oe', 'medida_altura_od', 'medida_altura_oe',
] as const

export const prescriptionFields = [...degreeFields, ...prescriptionMeasureFields] as const

export type ManualPrescription = Record<(typeof prescriptionFields)[number], string | null> & {
    id: number
    dependente_id: number | null
    data_receita: string
    oftalmologista_id: number | null
    obs_os: string | null
}

export function calculateNearSphere(farSphere: string | null | undefined, addition: string | null | undefined) {
    if (!farSphere?.trim() || !addition?.trim()) return null
    const far = Number(farSphere.replace(',', '.'))
    const add = Number(addition.replace(',', '.'))
    if (!Number.isFinite(far) || !Number.isFinite(add)) return null

    const hundredths = Math.round(far * 100) + Math.round(add * 100)
    const magnitude = (Math.abs(hundredths) / 100).toFixed(2).replace('.', ',')
    return `${hundredths < 0 ? '-' : '+'}${magnitude}`
}
