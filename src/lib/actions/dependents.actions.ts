// ARQUIVO: src/lib/actions/dependents.actions.ts
'use server'

import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/database.types'

type Dependente = Database['public']['Tables']['dependentes']['Row']

const DependenteSchema = z.object({
  id: z.coerce.number().optional(), // Aceita ID para edição
  store_id: z.coerce.number(),
  customer_id: z.coerce.number(),
  nome_completo: z.string().min(2, 'Nome obrigatório'),
  parentesco: z.string().min(2, 'Parentesco obrigatório'),
  data_nascimento: z.string().optional().nullable(),
})

export type SaveDependenteResult = {
  success: boolean
  message: string
  data?: Dependente
  errors?: Record<string, string[]>
}

// --- SALVAR (CRIAR OU EDITAR) ---
export async function saveDependente(
  prevState: SaveDependenteResult,
  formData: FormData
): Promise<SaveDependenteResult> {
  const supabase = createClient()
  
  // 1. Autenticação
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Usuário não autenticado.' }

  // 2. Contexto de Segurança (Tenant)
  const profile = await getProfileByAdmin(user.id)
  
  // Cast as any no profile para garantir leitura do tenant_id
  if (!(profile as any)?.tenant_id) {
    return { success: false, message: 'Erro de permissão: Usuário sem vínculo com Tenant.' }
  }
  const tenantId = (profile as any).tenant_id

  // 3. Validação
  const rawData = {
    id: formData.get('id'),
    store_id: formData.get('store_id'),
    customer_id: formData.get('customer_id'),
    nome_completo: formData.get('nome_completo'),
    parentesco: formData.get('parentesco'),
    data_nascimento: formData.get('data_nascimento') || null,
  }

  const validated = DependenteSchema.safeParse(rawData)

  if (!validated.success) {
    return { 
      success: false, 
      message: 'Erro de validação nos dados.', 
      errors: validated.error.flatten().fieldErrors 
    }
  }

  const { id, ...depData } = validated.data
  const supabaseAdmin = createAdminClient()

  try {
    const payload = {
      tenant_id: tenantId,
      store_id: depData.store_id,
      customer_id: depData.customer_id,
      full_name: depData.nome_completo,
      birth_date: depData.data_nascimento,
      parentesco: depData.parentesco
    }

    let data: Dependente | null = null
    let error = null

    if (id) {
      // --- MODO EDIÇÃO (UPDATE) ---
      // CORREÇÃO: Cast 'as any' no update
      const res = await (supabaseAdmin.from('dependentes') as any)
        .update(payload)
        .eq('id', id)
        .select()
        .single()
      data = res.data
      error = res.error
    } else {
      // --- MODO CRIAÇÃO (INSERT) ---
      // CORREÇÃO: Cast 'as any' no insert
      const res = await (supabaseAdmin.from('dependentes') as any)
        .insert(payload)
        .select()
        .single()
      data = res.data
      error = res.error
    }

    if (error) throw error

    return { success: true, message: id ? 'Dependente atualizado!' : 'Dependente adicionado!', data: data! }
  } catch (error: any) {
    console.error("Erro save dependente:", error)
    return { success: false, message: `Erro ao salvar: ${error.message}` }
  }
}

// --- BUSCAR LISTA ---
export async function getDependentes(customerId: number) {
  const supabaseAdmin = createAdminClient()
  
  // CORREÇÃO: Cast 'as any' no select
  const { data, error } = await (supabaseAdmin.from('dependentes') as any)
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) return []
  return data as Dependente[]
}

// --- EXCLUIR ---
export async function deleteDependente(dependenteId: number) {
  const supabaseAdmin = createAdminClient()
  
  // CORREÇÃO: Cast 'as any' no delete
  const { error } = await (supabaseAdmin.from('dependentes') as any)
    .delete()
    .eq('id', dependenteId)

  if (error) return { success: false, message: error.message }
  return { success: true, message: 'Dependente removido.' }
}