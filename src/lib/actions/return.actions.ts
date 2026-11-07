'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { SaleReturnRequestSchema } from '@/lib/sale-return-request'
import { verifyEmployeeAuthorization } from '@/lib/server/employee-authorization'

export type ReturnActionResult = { success: boolean; message: string }

export async function processarDevolucao(_prevState: unknown, formData: FormData): Promise<ReturnActionResult> {
    const { data: { user }, error: authError } = await createClient().auth.getUser()
    if (authError || !user) return { success: false, message: 'Usuário não autenticado.' }
    const profile = await getProfileByAdmin(user.id) as { tenant_id: string | null; store_id: number | null; role: string } | null
    if (!profile?.tenant_id) return { success: false, message: 'Perfil inválido.' }
    let items: unknown
    try { items = JSON.parse(String(formData.get('itens_json'))) }
    catch { return { success: false, message: 'Itens da devolução inválidos.' } }
    const parsed = SaleReturnRequestSchema.safeParse({
        store_id: formData.get('store_id'), venda_id: formData.get('venda_id'),
        customer_id: formData.get('customer_id'), employee_id: formData.get('employee_id'),
        tipo_reembolso: formData.get('tipo_reembolso'), idempotency_key: formData.get('idempotency_key'),
        authorization_token: formData.get('authorization_token'), itens: items,
    })
    if (!parsed.success) return { success: false, message: 'Dados inválidos. Confira os itens e autorize novamente pelo PIN.' }
    const data = parsed.data
    if (profile.role !== 'admin' && Number(profile.store_id) !== data.store_id) {
        return { success: false, message: 'Usuário sem acesso a esta loja.' }
    }
    if (data.tipo_reembolso !== 'Carteira') {
        return { success: false, message: 'Estorno financeiro indisponível. Este fluxo devolve o valor em Crédito em Loja.' }
    }
    try {
        const authorization = verifyEmployeeAuthorization(data.authorization_token, {
            userId: user.id, tenantId: profile.tenant_id, storeId: data.store_id,
            purpose: 'sale_return', context: `return:${data.venda_id}:${data.idempotency_key}`,
        })
        if (!authorization || authorization.employeeId !== data.employee_id) {
            return { success: false, message: 'Autorização inválida ou expirada. Informe novamente o PIN.' }
        }
        const { data: result, error } = await (createAdminClient() as any).rpc('return_sale_integral', {
            p_sale_id: data.venda_id, p_store_id: data.store_id, p_customer_id: data.customer_id,
            p_employee_id: authorization.employeeId, p_items: data.itens,
            p_tenant_id: profile.tenant_id, p_user_id: user.id, p_key: data.idempotency_key,
        })
        if (error) return { success: false, message: error.message }
        if (!result?.message) return { success: false, message: 'Resposta incerta. Confira o histórico da venda antes de repetir.' }
        for (const path of ['vendas', `vendas/${data.venda_id}`, `vendas/${data.venda_id}/experimental`,
            'clientes', 'estoque', 'financeiro/comissoes']) revalidatePath(`/dashboard/loja/${data.store_id}/${path}`)
        return { success: true, message: result.message }
    } catch (error: unknown) {
        return { success: false, message: error instanceof Error ? error.message : 'Falha ao confirmar a devolução. Confira o histórico antes de repetir.' }
    }
}
