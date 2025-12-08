// Caminho: src/lib/actions/customer.actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/database.types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// Importamos os helpers administrativos para bypassar o RLS (leitura e escrita)
import { getProfileByAdmin, createAdminClient } from '@/lib/supabase/admin'

type Customer = Database['public']['Tables']['customers']['Row']

// --- Funções Helper do CPF ---
function validaCPF(cpf: string | null | undefined): boolean {
  if (!cpf) return false
  const cpfLimpo = cpf.replace(/\D/g, '')
  if (cpfLimpo.length !== 11 || /^(\d)\1+$/.test(cpfLimpo)) return false

  let soma = 0,
    resto
  for (let i = 1; i <= 9; i++)
    soma += parseInt(cpfLimpo.substring(i - 1, i)) * (11 - i)
  
  resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(cpfLimpo.substring(9, 10))) return false

  soma = 0
  for (let i = 1; i <= 10; i++)
    soma += parseInt(cpfLimpo.substring(i - 1, i)) * (12 - i)
  resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(cpfLimpo.substring(10, 11))) return false

  return true
}

// --- Esquema de Validação ---
const CustomerSchema = z.object({
  id: z.coerce.number().optional(),
  // CORREÇÃO ANTERIOR MANTIDA: Removido required_error
  store_id: z.coerce.number(),
  full_name: z.string().min(3, { message: 'Nome completo é obrigatório.' }),
  rg: z.string().optional().nullable(),
  cpf: z.string().optional().nullable(),
  birth_date: z.string().nullable().optional(),
  naturalidade: z.string().optional().nullable(),
  estado_civil: z.string().optional().nullable(),
  pai: z.string().optional().nullable(),
  mae: z.string().optional().nullable(),
  conjuge_nome: z.string().optional().nullable(),
  conjuge_nascimento: z.string().nullable().optional(),
  conjuge_naturalidade: z.string().optional().nullable(),
  conjuge_trabalho: z.string().optional().nullable(),
  conjuge_fone: z.string().optional().nullable(),
  rua: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  complemento: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  uf: z.string().optional().nullable(),
  cep: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  fone_movel: z.string().optional().nullable(),
  email: z.string().email({ message: 'E-mail inválido.' }).optional().or(z.literal('')).nullable(),
  obs_residencial: z.string().optional().nullable(),
  comercial_trabalho: z.string().optional().nullable(),
  comercial_cargo: z.string().optional().nullable(),
  comercial_endereco: z.string().optional().nullable(),
  comercial_fone: z.string().optional().nullable(),
  comercial_renda: z.coerce.number().optional().nullable(), 
  obs_comercial: z.string().optional().nullable(),
  ref_comercio_1: z.string().optional().nullable(),
  ref_comercio_2: z.string().optional().nullable(),
  ref_pessoal_1: z.string().optional().nullable(),
  ref_pessoal_2: z.string().optional().nullable(),
  obs_debito: z.string().optional().nullable(),
  faixa_etaria: z.string().optional().nullable(),
})

export type CustomerActionResult = {
  success: boolean
  message: string
  data?: Customer
  errors?: Record<string, string[]>
}

//================================================================
// 1. ACTION: SALVAR CLIENTE (NOVO E EDIÇÃO)
//================================================================
export async function saveCustomerDetails(
  prevState: CustomerActionResult,
  formData: FormData
): Promise<CustomerActionResult> {
  const supabase = createClient()
  const customerId = formData.get('id')
  
  // 1. Obter Usuário Logado
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Usuário não autenticado.' }
  
  // 2. Obter Perfil (CORREÇÃO AQUI: Cast 'as any' para garantir acesso ao tenant_id)
  const profile = await getProfileByAdmin(user.id) as any

  if (!profile?.tenant_id || !profile?.store_id) {
    return { success: false, message: 'Perfil do usuário incompleto (sem loja/tenant).' }
  }
  
  const { tenant_id, store_id } = profile

  // 3. Pré-processar CPF
  const emptyToNull = (value: FormDataEntryValue | null) => value === '' ? null : value
  const cpfFromForm = emptyToNull(formData.get('cpf')) as string | null
  const unmaskedCpf = cpfFromForm ? cpfFromForm.replace(/\D/g, '') : null
  const cpfToSave = unmaskedCpf 
  
  // 4. Validar Campos
  const validatedFields = CustomerSchema.safeParse({
    id: customerId,
    store_id: store_id,
    full_name: formData.get('full_name'),
    rg: emptyToNull(formData.get('rg')),
    cpf: cpfToSave,
    birth_date: emptyToNull(formData.get('birth_date')),
    naturalidade: emptyToNull(formData.get('naturalidade')),
    estado_civil: emptyToNull(formData.get('estado_civil')),
    pai: emptyToNull(formData.get('pai')),
    mae: emptyToNull(formData.get('mae')),
    conjuge_nome: emptyToNull(formData.get('conjuge_nome')),
    conjuge_nascimento: emptyToNull(formData.get('conjuge_nascimento')),
    conjuge_naturalidade: emptyToNull(formData.get('conjuge_naturalidade')),
    conjuge_trabalho: emptyToNull(formData.get('conjuge_trabalho')),
    conjuge_fone: emptyToNull(formData.get('conjuge_fone')),
    rua: emptyToNull(formData.get('rua')),
    numero: emptyToNull(formData.get('numero')),
    bairro: emptyToNull(formData.get('bairro')),
    complemento: emptyToNull(formData.get('complemento')),
    cidade: emptyToNull(formData.get('cidade')),
    uf: emptyToNull(formData.get('uf')),
    cep: emptyToNull(formData.get('cep')),
    phone: emptyToNull(formData.get('phone')),
    fone_movel: formData.get('fone_movel'),
    email: emptyToNull(formData.get('email')),
    obs_residencial: emptyToNull(formData.get('obs_residencial')),
    comercial_trabalho: emptyToNull(formData.get('comercial_trabalho')),
    comercial_cargo: emptyToNull(formData.get('comercial_cargo')),
    comercial_endereco: emptyToNull(formData.get('comercial_endereco')),
    comercial_fone: emptyToNull(formData.get('comercial_fone')),
    comercial_renda: emptyToNull(formData.get('comercial_renda')),
    obs_comercial: emptyToNull(formData.get('obs_comercial')),
    ref_comercio_1: emptyToNull(formData.get('ref_comercio_1')),
    ref_comercio_2: emptyToNull(formData.get('ref_comercio_2')),
    ref_pessoal_1: emptyToNull(formData.get('ref_pessoal_1')),
    ref_pessoal_2: emptyToNull(formData.get('ref_pessoal_2')),
    obs_debito: emptyToNull(formData.get('obs_debito')),
    faixa_etaria: emptyToNull(formData.get('faixa_etaria')),
  })

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Erro de validação. Verifique os campos.',
      errors: validatedFields.error.flatten().fieldErrors,
    }
  }

  const { id: _, store_id: __, ...customerData } = validatedFields.data
  
  // CORREÇÃO MANTIDA: any aqui para aceitar campos novos
  const dataToSave: any = {
      ...customerData,
      store_id: store_id,
      tenant_id: tenant_id, 
  }

  const supabaseAdmin = createAdminClient();

  // --- TRAVA DE SEGURANÇA ---
  let queryDuplicidade = (supabaseAdmin
      .from('customers') as any)
      .select('id')
      .eq('store_id', store_id)
      .ilike('full_name', dataToSave.full_name)
      
  if (customerId) {
      queryDuplicidade = queryDuplicidade.neq('id', customerId)
  }

  const { data: duplicados } = await queryDuplicidade.limit(1)

  if (duplicados && duplicados.length > 0) {
      return { 
          success: false, 
          message: `Atenção: Já existe um cliente cadastrado com o nome "${dataToSave.full_name}".` 
      }
  }

  try {
    let error;
    let savedData: Customer | null = null;
    
    if (customerId) {
      // CORREÇÃO MANTIDA: Cast 'as any'
      const { data, error: updateError } = await (supabaseAdmin.from('customers') as any)
        .update(dataToSave)
        .eq('id', customerId)
        .select()
        .single();
      error = updateError;
      savedData = data;
    } else {
      // CORREÇÃO MANTIDA: Cast 'as any'
      const { data, error: insertError } = await (supabaseAdmin.from('customers') as any)
        .insert(dataToSave)
        .select()
        .single();
      error = insertError;
      savedData = data;
    }

    if (error) {
      if (error.message.includes('customers_cpf_key')) {
        return { success: false, message: 'Erro: Já existe um cliente com este CPF.' }
      }
      throw new Error(error.message)
    }

    revalidatePath(`/dashboard/loja/${store_id}/clientes`);

    return { success: true, message: 'Cliente salvo com sucesso!', data: savedData! }

  } catch (error: any) {
    return { success: false, message: `Erro no banco de dados: ${error.message}` }
  }
}

//================================================================
// 2. ACTION: DELETAR CLIENTE
//================================================================

export async function deleteCustomer(
    customerId: number,
    storeId: number,
): Promise<CustomerActionResult> {
    const supabaseAdmin = createAdminClient();

    try {
        const { error: deleteError } = await (supabaseAdmin.from('customers') as any)
            .delete()
            .eq('id', customerId)

        if (deleteError) throw new Error(deleteError.message)

        revalidatePath(`/dashboard/loja/${storeId}/clientes`)
        return { success: true, message: 'Cliente deletado com sucesso.' }
    } catch (error: any) {
        return { success: false, message: `Erro ao deletar: ${error.message}` }
    }
}

// ================================================================
// 3. ACTION: CADASTRO RÁPIDO (BALCÃO)
// ================================================================
const QuickCustomerSchema = z.object({
  store_id: z.coerce.number(),
  full_name: z.string().min(3, "Nome muito curto."),
  fone_movel: z.string().min(8, "Telefone inválido."),
})

export async function createQuickCustomer(formData: FormData): Promise<CustomerActionResult> {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    
    if (!user) return { success: false, message: 'Sem permissão.' }
    
    // CORREÇÃO AQUI: Cast 'as any' no profile também
    const profile = await getProfileByAdmin(user.id) as any

    const rawData = {
        store_id: formData.get('store_id'),
        full_name: formData.get('full_name'),
        fone_movel: formData.get('fone_movel')
    }

    const validated = QuickCustomerSchema.safeParse(rawData)
    
    if (!validated.success) {
        return { success: false, message: 'Dados inválidos.', errors: validated.error.flatten().fieldErrors }
    }

    const { store_id, full_name, fone_movel } = validated.data

    try {
        // CORREÇÃO MANTIDA: Cast 'as any'
        const { data: existe } = await (supabaseAdmin.from('customers') as any)
            .select('id')
            .eq('store_id', store_id)
            .ilike('full_name', full_name.trim())
            .maybeSingle()
        
        if (existe) {
            return { success: false, message: 'Já existe um cliente com este nome exato.' }
        }

        // CORREÇÃO MANTIDA: Cast 'as any' no insert
        const { data: newCustomer, error } = await (supabaseAdmin.from('customers') as any).insert({
            tenant_id: profile?.tenant_id,
            store_id,
            full_name: full_name.trim(),
            fone_movel: fone_movel.replace(/\D/g, ''),
            created_at: new Date().toISOString()
        }).select().single()

        if (error) throw error

        revalidatePath(`/dashboard/loja/${store_id}/clientes`)
        return { success: true, message: 'Cliente cadastrado!', data: newCustomer }

    } catch (e: any) {
        return { success: false, message: e.message }
    }
}