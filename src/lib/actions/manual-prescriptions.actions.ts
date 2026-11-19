'use server'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { degreeFields, prescriptionFields, type ManualPrescription } from '@/lib/manual-prescriptions'

const idSchema = z.number().int().positive().safe()
const prescriptionDate = z.string().date()
const degreeFormat = /^[+-]?\d{1,3}(?:[,.]\d{1,2})?$/
const axisFormat = /^\d{1,3}(?:[°º])?$/
type NamedOption = { id: number; nome: string }
type Profile = { tenant_id: string | null; store_id: number | null; role: string | null }

async function getContext(storeId: number, customerId: number) {
    if (!idSchema.safeParse(storeId).success || !idSchema.safeParse(customerId).success) {
        throw new Error('Cliente ou loja inválidos.')
    }
    const { data: { user } } = await createClient().auth.getUser()
    if (!user) throw new Error('Entre no sistema para acessar as receitas.')

    const db = createAdminClient()
    const { data: profileData } = await db.from('profiles')
        .select('tenant_id, store_id, role').eq('id', user.id).maybeSingle()
    const profile = profileData as Profile | null
    if (!profile?.tenant_id || (profile.role !== 'admin' && Number(profile.store_id) !== storeId)) {
        throw new Error('Você não tem acesso às receitas desta loja.')
    }

    const tenantId = profile.tenant_id
    const [store, customer] = await Promise.all([
        db.from('stores').select('id').eq('id', storeId).eq('tenant_id', tenantId).maybeSingle(),
        db.from('customers').select('id').eq('id', customerId).eq('store_id', storeId)
            .eq('tenant_id', tenantId).maybeSingle(),
    ])
    if (!store.data || !customer.data) throw new Error('Cliente não encontrado nesta loja.')

    const dependents = () => db.from('dependentes').select('id, full_name')
        .eq('customer_id', customerId).eq('store_id', storeId).eq('tenant_id', tenantId)
    const doctors = () => db.from('oftalmologistas').select('id, nome_completo').eq('store_id', storeId)
    // A tabela nova ainda não faz parte dos tipos gerados do Supabase.
    const prescriptions = () => db.from('customer_manual_prescriptions' as never)
    const available = () => prescriptions().select(['id', 'dependente_id', 'data_receita', 'oftalmologista_id', 'obs_os', ...prescriptionFields].join(','))
        .eq('tenant_id', tenantId).eq('store_id', storeId).eq('customer_id', customerId).is('used_at', null)

    return { db, tenantId, userId: user.id, prescriptions, available, dependents, doctors }
}

export async function getManualPrescriptionHistory(storeId: number, customerId: number): Promise<{
    recipes: ManualPrescription[]; dependents: NamedOption[]; doctors: NamedOption[]
}> {
    const context = await getContext(storeId, customerId)
    const [recipes, dependents, doctors] = await Promise.all([
        context.available().order('id', { ascending: false }),
        context.dependents().order('full_name'),
        context.doctors().order('nome_completo'),
    ])
    if (recipes.error || dependents.error || doctors.error) {
        throw new Error('Não foi possível carregar as receitas avulsas.')
    }
    return {
        recipes: (recipes.data ?? []) as unknown as ManualPrescription[],
        dependents: ((dependents.data ?? []) as { id: number; full_name: string }[])
            .map(row => ({ id: row.id, nome: row.full_name })),
        doctors: ((doctors.data ?? []) as { id: number; nome_completo: string }[])
            .map(row => ({ id: row.id, nome: row.nome_completo })),
    }
}

export async function getLatestManualPrescription(
    storeId: number, customerId: number, dependenteId: number | null
): Promise<ManualPrescription | null> {
    const context = await getContext(storeId, customerId)
    const query = context.available()
    if (dependenteId === null) {
        query.is('dependente_id', null)
    } else {
        const result = await context.dependents().eq('id', dependenteId).maybeSingle()
        if (!result.data) throw new Error('Dependente não encontrado.')
        query.eq('dependente_id', dependenteId)
    }
    const { data, error } = await query.order('id', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new Error('Não foi possível consultar a receita avulsa.')
    return data as unknown as ManualPrescription | null
}

export async function saveManualPrescription(
    storeId: number, customerId: number, form: FormData, prescriptionId: number | null = null,
) {
    if (prescriptionId !== null && !idSchema.safeParse(prescriptionId).success) {
        return { message: 'Receita avulsa inválida.' }
    }
    const read = (name: string) => String(form.get(name) ?? '').trim() || null
    const dependenteId = read('dependente_id') ? Number(read('dependente_id')) : null
    const doctorId = read('oftalmologista_id') ? Number(read('oftalmologista_id')) : null
    const date = prescriptionDate.safeParse(read('data_receita'))
    const notes = read('obs_os')
    if (!date.success) return { message: 'Informe uma data de receita válida.' }
    if ((dependenteId !== null && !idSchema.safeParse(dependenteId).success)
        || (doctorId !== null && !idSchema.safeParse(doctorId).success)) {
        return { message: 'Confira o paciente e o médico selecionados.' }
    }
    if (notes && notes.length > 2000) return { message: 'Use até 2.000 caracteres na observação.' }

    const values = Object.fromEntries(prescriptionFields.map(field => [field, read(field)]))
    for (const field of degreeFields) {
        // O campo de grau pode ter só o sinal ao receber foco, antes de digitar.
        if (!field.endsWith('_eixo') && (values[field] === '-' || values[field] === '+')) values[field] = null
    }
    if (!degreeFields.some(field => values[field])) return { message: 'Preencha pelo menos um campo de grau.' }
    for (const field of degreeFields) {
        const value = values[field]
        if (!value) continue
        const valid = field.endsWith('_eixo')
            ? axisFormat.test(value) && Number.parseInt(value, 10) <= 180
            : degreeFormat.test(value)
        if (!valid) return { message: 'Confira os campos de grau. O eixo deve estar entre 0 e 180.' }
    }
    if (prescriptionFields.some(field => (values[field]?.length ?? 0) > 24)) {
        return { message: 'Confira os valores das medidas.' }
    }

    try {
        const context = await getContext(storeId, customerId)
        const [dependent, doctor] = await Promise.all([
            dependenteId === null ? null : context.dependents().eq('id', dependenteId).maybeSingle(),
            doctorId === null ? null : context.doctors().eq('id', doctorId).maybeSingle(),
        ])
        if (dependent && !dependent.data) return { message: 'Dependente não encontrado neste cadastro.' }
        if (doctor && !doctor.data) return { message: 'Médico não encontrado nesta loja.' }

        const payload = {
            ...values,
            dependente_id: dependenteId,
            oftalmologista_id: doctorId,
            data_receita: date.data,
            obs_os: notes,
        }

        if (prescriptionId !== null) {
            const { data, error } = await context.prescriptions().update(payload as never)
                .eq('id', prescriptionId).eq('tenant_id', context.tenantId)
                .eq('store_id', storeId).eq('customer_id', customerId).is('used_at', null)
                .select('id').maybeSingle()
            if (error) return { message: 'Não foi possível atualizar a receita avulsa. Tente novamente.' }
            if (!data) return { message: 'Esta receita avulsa não está mais disponível para edição.' }
            return { success: true }
        }

        const { error } = await context.prescriptions().insert({
            ...payload,
            tenant_id: context.tenantId,
            store_id: storeId,
            customer_id: customerId,
            created_by: context.userId,
        } as never)
        if (!error) return { success: true }
    } catch {
        return { message: 'Não foi possível salvar a receita para este cliente.' }
    }
    return { message: 'Não foi possível salvar a receita avulsa. Tente novamente.' }
}

export async function deleteManualPrescription(storeId: number, customerId: number, prescriptionId: number) {
    if (!idSchema.safeParse(prescriptionId).success) return { message: 'Receita avulsa inválida.' }

    try {
        const { db, tenantId } = await getContext(storeId, customerId)
        const { data, error } = await db.rpc('delete_available_manual_prescription' as never, {
            p_prescription_id: prescriptionId,
            p_store_id: storeId,
            p_tenant_id: tenantId,
            p_customer_id: customerId,
        } as never)
        if (!error && (data as unknown) === true) return { success: true }
        if (!error) return { message: 'Esta receita avulsa não está mais disponível para exclusão.' }
    } catch {
        return { message: 'Não foi possível apagar a receita para este cliente.' }
    }
    return { message: 'Não foi possível apagar a receita avulsa. Tente novamente.' }
}
