'use server'

import { createClient } from '@/lib/supabase/server'; // Cliente Normal (Para pegar seu ID)
import { createClient as createAdmin } from '@supabase/supabase-js'; // Cliente Admin (Para gravar à força)
import { revalidatePath } from 'next/cache';

// --- CONFIGURAÇÃO ADMIN ---
const supabaseAdmin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- TIPAGEM ---
interface NovoCarneDTO {
  venda_id: number;
  customer_id: number;
  store_id: number;
  tenant_id: string;
  valor_total: number;
  qtd_parcelas: number;
  data_primeiro_vencimento: string;
}

// 1. INVESTIGAR VENDA
export async function investigarVendaLab(vendaIdInput: string) {
  try {
    const { data: venda, error: erroVenda } = await supabaseAdmin
      .from('vendas')
      .select('*')
      .eq('id', vendaIdInput)
      .single();

    if (erroVenda || !venda) {
      return { success: false, message: `Venda ${vendaIdInput} não encontrada.` };
    }

    const { data: carne } = await supabaseAdmin
      .from('financiamento_loja')
      .select('*')
      .eq('venda_id', venda.id)
      .single();

    let parcelas: any[] = [];
    if (carne) {
      const { data: p } = await supabaseAdmin
        .from('financiamento_parcelas')
        .select('*')
        .eq('financiamento_id', carne.id)
        .order('numero_parcela');
      parcelas = p || [];
    }

    return { success: true, data: { venda, carne, parcelas } };

  } catch (error: any) {
    return { success: false, message: 'Erro interno: ' + error.message };
  }
}

// 2. CRIAR CARNÊ (COM DEBUG E USER ID)
// 2. CRIAR CARNÊ (CORRIGIDO: REMOVIDO CAMPO 'STATUS' DA CAPA)
// 2. CRIAR CARNÊ (CORRIGIDO: REMOVIDO STATUS DA CAPA E VENDA_ID DAS PARCELAS)
export async function criarCarneLab(dados: NovoCarneDTO) {
  console.log('--- [LAB] INICIANDO CRIAÇÃO ---');

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id; 

  // A. Verificar duplicidade
  const { data: existente } = await supabaseAdmin
    .from('financiamento_loja')
    .select('id')
    .eq('venda_id', dados.venda_id)
    .single();

  if (existente) {
    return { success: false, message: 'Já existe um carnê. Exclua o anterior primeiro.' };
  }

  // B. Criar a Capa
  const payloadCapa = {
      tenant_id: dados.tenant_id,
      venda_id: dados.venda_id,
      customer_id: dados.customer_id,
      store_id: dados.store_id,
      valor_total_financiado: dados.valor_total,
      quantidade_parcelas: dados.qtd_parcelas,
      data_inicio: dados.data_primeiro_vencimento,
      // status: 'Ativo', <-- REMOVIDO (Erro anterior)
      created_at: new Date().toISOString(),
      created_by_user_id: userId,
      employee_id: dados.venda_id ? undefined : undefined 
  };

  const { data: capa, error: erroCapa } = await supabaseAdmin
    .from('financiamento_loja')
    .insert(payloadCapa)
    .select()
    .single();

  if (erroCapa) {
    console.error('[LAB ERRO CAPA]', erroCapa);
    return { 
      success: false, 
      message: `ERRO DE BANCO NA CAPA: ${erroCapa.message}` 
    };
  }

  // C. Calcular Parcelas
  const valorParcela = Number((dados.valor_total / dados.qtd_parcelas).toFixed(2));
  const diferenca = Number((dados.valor_total - (valorParcela * dados.qtd_parcelas)).toFixed(2));
  
  const parcelas = [];
  const dataBase = new Date(dados.data_primeiro_vencimento);

  for (let i = 1; i <= dados.qtd_parcelas; i++) {
    const valorReal = i === 1 ? valorParcela + diferenca : valorParcela;
    const vencimento = new Date(dataBase);
    if (i > 1) vencimento.setMonth(vencimento.getMonth() + (i - 1));

    parcelas.push({
      tenant_id: dados.tenant_id,
      financiamento_id: capa.id,
      // venda_id: dados.venda_id, <--- REMOVIDO: O erro diz que esta coluna não existe em parcelas
      store_id: dados.store_id,
      customer_id: dados.customer_id,
      numero_parcela: i,
      data_vencimento: vencimento.toISOString().split('T')[0],
      valor_parcela: valorReal,
      valor_pago: 0,
      status: 'Pendente'
    });
  }

  // D. Inserir Parcelas
  const { error: erroParcelas } = await supabaseAdmin
    .from('financiamento_parcelas')
    .insert(parcelas);

  if (erroParcelas) {
    console.error('[LAB ERRO PARCELAS]', erroParcelas);
    // Rollback: Se falhar na parcela, apaga a capa para não deixar lixo
    await supabaseAdmin.from('financiamento_loja').delete().eq('id', capa.id); 
    return { success: false, message: `ERRO NAS PARCELAS: ${erroParcelas.message}` };
  }

  // E. Atualizar Venda
  const { error: erroUpdate } = await supabaseAdmin
    .from('vendas')
    .update({ financiamento_id: capa.id })
    .eq('id', dados.venda_id);

  if (erroUpdate) {
     return { success: false, message: `ERRO AO VINCULAR VENDA: ${erroUpdate.message}` };
  }

  revalidatePath('/dashboard/lab-financeiro');
  return { success: true, message: 'Carnê criado com sucesso!' };
}

// 3. EXCLUSÃO COM RASTREAMENTO (SEM ZUMBIS)
export async function excluirCarneLab(financiamentoId: number, vendaId: number) {
  console.log(`--- [LAB] INICIANDO EXCLUSÃO DO CARNÊ ${financiamentoId} ---`);

  try {
    // PASSO 1: O MAIS IMPORTANTE - Desvincular a venda IMEDIATAMENTE
    console.log('[LAB DELETE] Passo 1: Libertando a Venda...');
    const { error: erroUpdate } = await supabaseAdmin
      .from('vendas')
      .update({ financiamento_id: null })
      .eq('id', vendaId);

    if (erroUpdate) {
      console.error('[LAB DELETE ERROR] Falha ao desvincular venda:', erroUpdate);
      return { success: false, message: 'ERRO CRÍTICO: O banco travou ao tentar soltar a venda. Abortando.' };
    }
    console.log('[LAB DELETE] Venda libertada com sucesso.');

    // PASSO 2: Apagar as parcelas
    console.log('[LAB DELETE] Passo 2: Apagando parcelas...');
    const { error: erroParcelas, count: qtdParcelas } = await supabaseAdmin
      .from('financiamento_parcelas')
      .delete({ count: 'exact' }) // Pede contagem de quantos apagou
      .eq('financiamento_id', financiamentoId);

    if (erroParcelas) {
        console.error('[LAB DELETE ERROR] Falha nas parcelas:', erroParcelas);
        return { success: false, message: 'Venda foi solta, mas erro ao apagar parcelas.' };
    }
    console.log(`[LAB DELETE] ${qtdParcelas} parcelas apagadas.`);

    // PASSO 3: Apagar a capa
    console.log('[LAB DELETE] Passo 3: Apagando a capa (Contrato)...');
    const { error: erroCapa } = await supabaseAdmin
      .from('financiamento_loja')
      .delete()
      .eq('id', financiamentoId);

    if (erroCapa) {
        console.error('[LAB DELETE ERROR] Falha na capa:', erroCapa);
        // Nota: As parcelas já foram, a venda já foi solta. Sobrou só a capa vazia.
        return { success: false, message: 'Venda solta, parcelas apagadas, mas a CAPA travou.' };
    }
    console.log('[LAB DELETE] Capa apagada. Limpeza completa.');

    revalidatePath('/dashboard/lab-financeiro');
    return { success: true, message: 'Carnê excluído e venda limpa com sucesso.' };

  } catch (error: any) {
    console.error('[LAB EXCEPTION]', error);
    return { success: false, message: 'Erro de exceção: ' + error.message };
  }
}