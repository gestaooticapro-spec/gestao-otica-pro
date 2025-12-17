'use server'

import { createClient } from '@/lib/supabase/server'; 
import { createClient as createAdmin } from '@supabase/supabase-js'; 
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

// 1. INVESTIGAR VENDA (Mantido igual)
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

// 2. CRIAR CARNÊ (Mantido igual)
export async function criarCarneLab(dados: NovoCarneDTO) {
  console.log('--- [LAB] INICIANDO CRIAÇÃO ---');

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id; 

  const { data: existente } = await supabaseAdmin
    .from('financiamento_loja')
    .select('id')
    .eq('venda_id', dados.venda_id)
    .single();

  if (existente) {
    return { success: false, message: 'Já existe um carnê. Exclua o anterior primeiro.' };
  }

  const payloadCapa = {
      tenant_id: dados.tenant_id,
      venda_id: dados.venda_id,
      customer_id: dados.customer_id,
      store_id: dados.store_id,
      valor_total_financiado: dados.valor_total,
      quantidade_parcelas: dados.qtd_parcelas,
      data_inicio: dados.data_primeiro_vencimento,
      created_at: new Date().toISOString(),
      created_by_user_id: userId
  };

  const { data: capa, error: erroCapa } = await supabaseAdmin
    .from('financiamento_loja')
    .insert(payloadCapa)
    .select()
    .single();

  if (erroCapa) {
    console.error('[LAB ERRO CAPA]', erroCapa);
    return { success: false, message: `ERRO DE BANCO NA CAPA: ${erroCapa.message}` };
  }

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
      store_id: dados.store_id,
      customer_id: dados.customer_id,
      numero_parcela: i,
      data_vencimento: vencimento.toISOString().split('T')[0],
      valor_parcela: valorReal,
      status: 'Pendente'
    });
  }

  const { error: erroParcelas } = await supabaseAdmin
    .from('financiamento_parcelas')
    .insert(parcelas);

  if (erroParcelas) {
    console.error('[LAB ERRO PARCELAS]', erroParcelas);
    await supabaseAdmin.from('financiamento_loja').delete().eq('id', capa.id); 
    return { success: false, message: `ERRO NAS PARCELAS: ${erroParcelas.message}` };
  }

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

// 3. EXCLUSÃO COM RASTREAMENTO (Mantido igual)
export async function excluirCarneLab(financiamentoId: number, vendaId: number) {
  console.log(`--- [LAB] INICIANDO EXCLUSÃO DO CARNÊ ${financiamentoId} ---`);

  try {
    const { error: erroUpdate } = await supabaseAdmin
      .from('vendas')
      .update({ financiamento_id: null })
      .eq('id', vendaId);

    if (erroUpdate) return { success: false, message: 'ERRO CRÍTICO: Falha ao desvincular venda.' };

    const { error: erroParcelas } = await supabaseAdmin
      .from('financiamento_parcelas')
      .delete()
      .eq('financiamento_id', financiamentoId);

    if (erroParcelas) return { success: false, message: 'Venda solta, mas erro ao apagar parcelas.' };

    const { error: erroCapa } = await supabaseAdmin
      .from('financiamento_loja')
      .delete()
      .eq('id', financiamentoId);

    if (erroCapa) return { success: false, message: 'Erro ao apagar capa.' };

    revalidatePath('/dashboard/lab-financeiro');
    return { success: true, message: 'Carnê excluído e venda limpa com sucesso.' };

  } catch (error: any) {
    console.error('[LAB EXCEPTION]', error);
    return { success: false, message: 'Erro de exceção: ' + error.message };
  }
}

// 4. RENEGOCIAR PARCELAS (AGORA COM LÓGICA INTELIGENTE)
export async function renegociarParcelasLab(
  financiamentoId: number, 
  novaQtdRestante: number, 
  dataInicio: string
) {
  console.log(`--- [LAB] RENEGOCIAÇÃO ID: ${financiamentoId} ---`);

  try {
    // A. Busca dados da capa e TODAS as parcelas atuais
    const { data: capaOriginal } = await supabaseAdmin
      .from('financiamento_loja')
      .select('*')
      .eq('id', financiamentoId)
      .single();

    if (!capaOriginal) return { success: false, message: 'Carnê original não encontrado.' };

    const { data: parcelasAtuais } = await supabaseAdmin
      .from('financiamento_parcelas')
      .select('*')
      .eq('financiamento_id', financiamentoId)
      .order('numero_parcela');

    if (!parcelasAtuais) return { success: false, message: 'Nenhuma parcela encontrada.' };

    // B. Calcula o que já foi pago e o que falta
    // Filtra parcelas pagas (considera pago se status='Pago' OU se tem valor_pago > 0)
    const parcelasPagas = parcelasAtuais.filter(p => p.status === 'Pago' || p.valor_pago > 0);
    const totalJaPago = parcelasPagas.reduce((acc, p) => acc + Number(p.valor_pago || 0), 0);
    
    // O saldo devedor é o Valor Total do contrato MENOS o que já entrou de dinheiro
    const valorTotalContrato = Number(capaOriginal.valor_total_financiado);
    const saldoDevedor = Number((valorTotalContrato - totalJaPago).toFixed(2));

    if (saldoDevedor <= 0) {
      return { success: false, message: 'Este carnê já está quitado ou saldo é zero.' };
    }

    console.log(`[LAB] Total Pago: ${totalJaPago} | Saldo a Renegociar: ${saldoDevedor}`);

    // C. Remove APENAS as parcelas Pendentes/Atrasadas
    // Não mexemos nas pagas para manter o histórico financeiro
    const { error: erroDelete } = await supabaseAdmin
      .from('financiamento_parcelas')
      .delete()
      .eq('financiamento_id', financiamentoId)
      .neq('status', 'Pago')
      .is('valor_pago', null); // Garante que não apaga nada que tenha recebimento parcial (opcional, mas seguro)

      // Nota: Se houver parcelas parciais, a lógica fica mais complexa. 
      // Aqui assumimos: Se não está 'Pago' full, deleta e renegocia o saldo total restante.

    if (erroDelete) {
      return { success: false, message: 'Erro ao limpar parcelas pendentes: ' + erroDelete.message };
    }

    // D. Atualiza a capa
    // A nova quantidade total de parcelas será: (Número de parcelas que ficaram pagas) + (Nova quantidade solicitada)
    const qtdPagas = parcelasPagas.length;
    const novaQtdTotal = qtdPagas + novaQtdRestante;

    await supabaseAdmin
      .from('financiamento_loja')
      .update({ 
        quantidade_parcelas: novaQtdTotal, 
        // Não mudamos o valor_total_financiado, pois a dívida é a mesma, só mudou o prazo
        // data_inicio: dataInicio // Opcional: manter data original ou mudar? Normalmente não muda data da capa, só das novas parcelas.
      })
      .eq('id', financiamentoId);

    // E. Gera as NOVAS parcelas para o saldo devedor
    const valorParcelaNova = Number((saldoDevedor / novaQtdRestante).toFixed(2));
    const diferenca = Number((saldoDevedor - (valorParcelaNova * novaQtdRestante)).toFixed(2));
    
    const novasParcelas = [];
    const dataBase = new Date(dataInicio);

    // Loop para criar APENAS as parcelas faltantes
    for (let i = 1; i <= novaQtdRestante; i++) {
      const valorReal = i === 1 ? valorParcelaNova + diferenca : valorParcelaNova;
      
      const vencimento = new Date(dataBase);
      if (i > 1) vencimento.setMonth(vencimento.getMonth() + (i - 1));

      // Importante: A numeração continua de onde parou. 
      // Ex: Se pagou a 1 e 2. A próxima nova será a 3.
      const numeroRealParcela = qtdPagas + i;

      novasParcelas.push({
        tenant_id: capaOriginal.tenant_id,
        financiamento_id: financiamentoId,
        store_id: capaOriginal.store_id,
        customer_id: capaOriginal.customer_id,
        numero_parcela: numeroRealParcela,
        data_vencimento: vencimento.toISOString().split('T')[0],
        valor_parcela: valorReal,
        valor_pago: 0,
        status: 'Pendente'
      });
    }

    const { error: erroInsert } = await supabaseAdmin
      .from('financiamento_parcelas')
      .insert(novasParcelas);

    if (erroInsert) throw erroInsert;

    revalidatePath('/dashboard/lab-financeiro');
    return { success: true, message: `Renegociação: ${qtdPagas} mantidas, ${novaQtdRestante} novas criadas.` };

  } catch (error: any) {
    console.error('[LAB RENEGOCIACAO ERROR]', error);
    return { success: false, message: 'Erro ao renegociar: ' + error.message };
  }
}