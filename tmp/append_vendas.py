import sys

code_to_append = """
// ================================================================
// 31. ACTION: TRANSFERIR TITULARIDADE DA VENDA
// ================================================================
export async function transferirTitularidadeVenda(
  vendaId: number,
  storeId: number,
  novoCustomerId: number,
  justificativa: string
): Promise<{ success: boolean; message: string }> {
  try {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    
    if (!user) return { success: false, message: 'Usuário não autenticado.' }

    // 1. Validar a Venda e checar permissão
    const { data: venda, error: vendaError } = await supabaseAdmin
      .from('vendas')
      .select('customer_id, created_by_user_id')
      .eq('id', vendaId)
      .eq('store_id', storeId)
      .single()

    if (vendaError || !venda) throw new Error('Venda não encontrada.')

    if (venda.created_by_user_id !== user.id) {
      return { success: false, message: 'Apenas quem abriu a venda pode transferir a titularidade.' }
    }

    if (venda.customer_id === novoCustomerId) {
      return { success: false, message: 'O novo titular deve ser diferente do atual.' }
    }

    // Identifica Tenant ID para o log de histórico
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    // Atualização em múltiplas tabelas (cascata lógica)
    const { error: errorVenda } = await (supabaseAdmin.from('vendas') as any)
      .update({ customer_id: novoCustomerId })
      .eq('id', vendaId)
      .eq('store_id', storeId)

    if (errorVenda) throw new Error('Erro ao atualizar titular da venda.')

    await (supabaseAdmin.from('service_orders') as any)
      .update({ customer_id: novoCustomerId })
      .eq('venda_id', vendaId)
      .eq('store_id', storeId)

    await (supabaseAdmin.from('financiamento_loja') as any)
      .update({ customer_id: novoCustomerId })
      .eq('venda_id', vendaId)
      .eq('store_id', storeId)

    await (supabaseAdmin.from('financiamento_parcelas') as any)
      .update({ customer_id: novoCustomerId })
      .eq('venda_id', vendaId)
      .eq('store_id', storeId)

    // Log Auditoria no novo cliente
    if (profile?.tenant_id) {
      await (supabaseAdmin.from('cobranca_historico') as any)
        .insert({
          tenant_id: profile.tenant_id,
          store_id: storeId,
          customer_id: novoCustomerId, 
          venda_id: vendaId,
          tipo_contato: 'Auditoria',
          resumo_conversa: `[Transferência de Titularidade] Venda #${vendaId} transferida do cliente ID ${venda.customer_id}. Motivo: ${justificativa}`,
          registrado_por_id: user.id
        })
    }

    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}`)
    revalidatePath(`/dashboard/loja/${storeId}/vendas`)
    
    return { success: true, message: 'Titularidade transferida com sucesso! Lembre-se de corrigir os dependentes manualmente dentro de cada OS.' }
  } catch (error: any) {
    console.error('Erro na transferência:', error)
    return { success: false, message: error.message || 'Erro inesperado.' }
  }
}
"""

with open("src/lib/actions/vendas.actions.ts", "a", encoding="utf-8") as f:
    f.write(code_to_append)

print("Appended to file")
