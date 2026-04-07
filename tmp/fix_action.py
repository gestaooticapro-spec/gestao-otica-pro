filepath = "src/lib/actions/vendas.actions.ts"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# The appended block uses LF only (no \r)
old_sig = "export async function transferirTitularidadeVenda(\n  vendaId: number,\n  storeId: number,\n  novoCustomerId: number,\n  justificativa: string\n): Promise<{ success: boolean; message: string }>"

new_action = """// ================================================================
// 31. ACTION: TRANSFERIR TITULARIDADE DA VENDA
// ================================================================
export async function transferirTitularidadeVenda(
  vendaId: number,
  storeId: number,
  novoCustomerId: number,
  justificativa: string,
  authedEmployeeId: number,
  authedEmployeeName: string
): Promise<{ success: boolean; message: string }> {
  try {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    
    if (!user) return { success: false, message: 'Usuário não autenticado.' }

    // 1. Validar a Venda e checar permissão via employee_id (PIN)
    const { data: venda, error: vendaError } = await supabaseAdmin
      .from('vendas')
      .select('customer_id, employee_id, created_by_user_id')
      .eq('id', vendaId)
      .eq('store_id', storeId)
      .single()

    if (vendaError || !venda) throw new Error('Venda não encontrada.')

    // O funcionário autenticado por PIN deve ser quem abriu a venda
    if (venda.employee_id !== authedEmployeeId) {
      return { success: false, message: 'Apenas o vendedor que abriu esta venda pode transferir a titularidade.' }
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

    const oldCustomerId = venda.customer_id

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
          resumo_conversa: `[Transferência de Titularidade] Venda #$` + `{vendaId} transferida do cliente ID $` + `{oldCustomerId}. Autorizado por: $` + `{authedEmployeeName} (ID $` + `{authedEmployeeId}). Motivo: $` + `{justificativa}`,
          registrado_por_id: user.id
        })
    }

    revalidatePath(`/dashboard/loja/$` + `{storeId}/vendas/$` + `{vendaId}`)
    revalidatePath(`/dashboard/loja/$` + `{storeId}/vendas/$` + `{vendaId}/experimental`)
    revalidatePath(`/dashboard/loja/$` + `{storeId}/vendas`)
    
    return { success: true, message: 'Titularidade transferida com sucesso! Lembre-se de revisar os dependentes manualmente dentro de cada OS.' }
  } catch (error: any) {
    console.error('Erro na transferência:', error)
    return { success: false, message: error.message || 'Erro inesperado.' }
  }
}
"""

if old_sig in content:
    # Find start of the section comment
    section_start = content.find("// ================================================================\n// 31. ACTION: TRANSFERIR TITULARIDADE DA VENDA")
    if section_start == -1:
        print("ERROR: Could not find section header")
    else:
        # Replace from section start to end of file
        content = content[:section_start] + new_action
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print("SUCCESS: Action replaced")
else:
    print("ERROR: Could not find old signature")
    # Find what we have
    idx = content.find("transferirTitularidadeVenda")
    if idx >= 0:
        print("Found at index", idx)
        print(repr(content[idx:idx+200]))
    else:
        print("Function not found at all")
