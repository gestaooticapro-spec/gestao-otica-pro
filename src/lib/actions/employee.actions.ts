// Caminho: src/lib/actions/employee.actions.ts
'use server'

import { Database } from '@/lib/database.types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type Employee = Database['public']['Tables']['employees']['Row']

// --- Schema de Validação ---
const EmployeeSchema = z.object({
  id: z.coerce.number().optional(),
  store_id: z.coerce.number(),
  full_name: z.string().min(2, 'Nome deve ter pelo menos 2 letras.'),
  pin: z.string().min(4, 'O PIN deve ter pelo menos 4 números.'),
  role: z.enum(['vendedor', 'gerente', 'tecnico']).optional().default('vendedor'),
  is_active: z.boolean().optional(),
  comm_rate_guaranteed: z.coerce.number().min(0).optional(),
  comm_rate_store_credit: z.coerce.number().min(0).optional(),
  comm_rate_store_total: z.coerce.number().min(0).optional(),
  comm_rate_received: z.coerce.number().min(0).optional(),
  comm_rate_profit: z.coerce.number().min(0).optional(),
})

export type EmployeeActionResult = {
  success: boolean
  message: string
  errors?: Record<string, string[]>
}

// --- Helper de Contexto Seguro ---
async function getManagerContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Usuário não autenticado.')
  
  const profile = await getProfileByAdmin(user.id)
  
  // Apenas Managers ou Admins podem gerenciar equipe
  // Cast 'as any' para garantir acesso às propriedades
  const p = profile as any;
  if (!p || (p.role !== 'manager' && p.role !== 'admin')) {
      throw new Error('Permissão negada. Apenas gerentes podem acessar esta área.')
  }
  
  return { profile: p, supabaseAdmin: createAdminClient() }
}

// 1. SALVAR (CRIAR / EDITAR)
export async function saveEmployee(
  prevState: EmployeeActionResult, 
  formData: FormData
): Promise<EmployeeActionResult> {
  try {
    const { profile, supabaseAdmin } = await getManagerContext()
    
    const rawFormData = {
      id: formData.get('id') ? parseInt(formData.get('id') as string) : undefined,
      store_id: profile.store_id,
      full_name: formData.get('full_name'),
      pin: formData.get('pin'),
      role: formData.get('role'),
      is_active: true,
      comm_rate_guaranteed: formData.get('comm_rate_guaranteed'),
      comm_rate_store_credit: formData.get('comm_rate_store_credit'),
      comm_rate_store_total: formData.get('comm_rate_store_total'),
      comm_rate_received: formData.get('comm_rate_received'),
      comm_rate_profit: formData.get('comm_rate_profit'),
    }

    const validated = EmployeeSchema.safeParse(rawFormData)

    if (!validated.success) {
      return { 
        success: false, 
        message: 'Dados inválidos.', 
        errors: validated.error.flatten().fieldErrors 
      }
    }

    const { id, ...data } = validated.data
    
    // --- VERIFICAÇÃO DE PIN DUPLICADO ---
    // Cast 'as any' na chamada do banco
    const { data: existingRaw } = await (supabaseAdmin.from('employees') as any)
        .select('id, full_name')
        .eq('store_id', profile.store_id)
        .eq('pin', data.pin)
        .maybeSingle()

    const existingEmployee = existingRaw as any;

    // Se achou alguém E (estamos criando novo OU editando e o ID é diferente do encontrado)
    if (existingEmployee && (!id || existingEmployee.id !== id)) {
        return { 
            success: false, 
            message: `Erro: O PIN ${data.pin} já pertence a ${existingEmployee.full_name}.` 
        }
    }
    // -------------------------------------

    const payload = { ...data, tenant_id: profile.tenant_id }

if (id) {
      // ATUALIZAÇÃO: O payload já contém os novos campos graças ao spread '...data'
      const { error } = await (supabaseAdmin.from('employees') as any)
        .update(payload) // Payload completo com comissões
        .eq('id', id)
        .eq('store_id', profile.store_id)
      
      if (error) throw error
    } else {
      const { error } = await (supabaseAdmin.from('employees') as any)
        .insert(payload)
      
      if (error) throw error
    }

    revalidatePath(`/dashboard/loja/${profile.store_id}/config`)
    return { success: true, message: 'Funcionário salvo com sucesso!' }

  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// 2. LISTAR FUNCIONÁRIOS
// 2. LISTAR FUNCIONÁRIOS (ATUALIZADO COM COLUNAS EXPLÍCITAS)
export async function getEmployees(storeId: number): Promise<Employee[]> {
  const supabaseAdmin = createAdminClient()
  
  // Cast 'as any' na chamada
  const { data, error } = await (supabaseAdmin.from('employees') as any)
    .select(`
      id, 
      store_id, 
      full_name, 
      pin, 
      role, 
      is_active, 
      created_at,
      comm_rate_guaranteed,
      comm_rate_store_credit,
      comm_rate_store_total,
      comm_rate_received,
      comm_rate_profit,
      comm_tiers_json
    `)
    .eq('store_id', storeId)
    .order('full_name')

  if (error) {
    console.error('Erro ao buscar funcionários:', error)
    return []
  }
  return data as Employee[]
}

// 3. ALTERAR STATUS (SOFT DELETE)
export async function toggleEmployeeStatus(
    employeeId: number, 
    currentStatus: boolean,
    storeId: number
): Promise<EmployeeActionResult> {
    try {
        const supabaseAdmin = createAdminClient()
        
        // Cast 'as any' na chamada
        const { error } = await (supabaseAdmin.from('employees') as any)
            .update({ is_active: !currentStatus })
            .eq('id', employeeId)
            .eq('store_id', storeId)

        if (error) throw error

        revalidatePath(`/dashboard/loja/${storeId}/config`)
        return { success: true, message: `Funcionário ${!currentStatus ? 'ativado' : 'inativado'}.` }
    } catch (error: any) {
        return { success: false, message: error.message }
    }
}