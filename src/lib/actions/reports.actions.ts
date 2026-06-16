'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { format, parseISO, startOfDay, endOfDay, addDays, getDaysInMonth, startOfMonth, endOfMonth, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { isStoreModuleEnabledForStore } from '@/lib/store-modules.server'

export interface VendaRelatorioItem {
  id: number
  data: string
  data_fechamento: string | null
  cliente: string
  vendedor: string
  medico: string
  itens_resumo: string
  status: string
  valor_total: number
  valor_final: number
  valor_pago: number
  saldo_devedor: number
  nf_emitida: boolean
}

export async function getRelatorioVendas(
  storeId: number,
  dataInicio: string,
  dataFim: string
): Promise<VendaRelatorioItem[]> {
  const supabase = createAdminClient()
  // BRT = UTC-3: midnight local = 03:00 UTC
  const inicioIso = `${dataInicio}T03:00:00.000Z`
  const fimDate = new Date(`${dataFim}T03:00:00.000Z`)
  fimDate.setUTCDate(fimDate.getUTCDate() + 1)
  fimDate.setUTCMilliseconds(fimDate.getUTCMilliseconds() - 1)
  const fimIso = fimDate.toISOString()

  const { data: vendas, error: vendasError } = await (supabase.from('vendas') as any)
    .select(`
      id,
      created_at,
      data_fechamento,
      status,
      valor_total,
      valor_final,
      valor_restante,
      nf_emitida,
      customers(full_name),
      employees(full_name)
    `)
    .eq('store_id', storeId)
    .gte('created_at', inicioIso)
    .lte('created_at', fimIso)
    .order('id', { ascending: false })

  if (vendasError) throw new Error(vendasError.message)
  if (!vendas || vendas.length === 0) return []

  const vendaIds = vendas.map((v: any) => v.id)

  const [itensRes, pagamentosRes, osRes] = await Promise.all([
    supabase
      .from('venda_itens')
      .select('venda_id, descricao, quantidade')
      .in('venda_id', vendaIds),
    supabase
      .from('pagamentos')
      .select('venda_id, valor_pago')
      .in('venda_id', vendaIds),
    (supabase.from('service_orders') as any)
      .select('venda_id, oftalmologista_id, oftalmologistas(nome_completo)')
      .in('venda_id', vendaIds),
  ])

  if (itensRes.error) throw new Error(itensRes.error.message)
  if (pagamentosRes.error) throw new Error(pagamentosRes.error.message)

  const itensPorVenda = new Map<number, string[]>()
    ; (itensRes.data || []).forEach((item: any) => {
      const atual = itensPorVenda.get(item.venda_id) || []
      const qtd = Number(item.quantidade || 0)
      const desc = String(item.descricao || '').trim()
      if (desc) atual.push(`${qtd > 0 ? `${qtd}x ` : ''}${desc}`)
      itensPorVenda.set(item.venda_id, atual)
    })

  const pagoPorVenda = new Map<number, number>()
    ; (pagamentosRes.data || []).forEach((pag: any) => {
      const atual = pagoPorVenda.get(pag.venda_id) || 0
      pagoPorVenda.set(pag.venda_id, atual + Number(pag.valor_pago || 0))
    })

  // Mapa de médico por venda (pega o primeiro OS com oftalmologista)
  const medicoPorVenda = new Map<number, string>()
    ; (osRes.data || []).forEach((os: any) => {
      if (os.oftalmologista_id && os.oftalmologistas?.nome_completo && !medicoPorVenda.has(os.venda_id)) {
        medicoPorVenda.set(os.venda_id, os.oftalmologistas.nome_completo)
      }
    })

  return vendas.map((v: any) => {
    const valorPago = pagoPorVenda.get(v.id) || 0
    const saldoDevedor = Math.max(0, Number(v.valor_restante ?? (v.valor_final || 0) - valorPago))
    return {
      id: v.id,
      data: v.created_at,
      data_fechamento: v.data_fechamento || null,
      cliente: v.customers?.full_name || 'Consumidor Final',
      vendedor: v.employees?.full_name || '-',
      medico: medicoPorVenda.get(v.id) || '-',
      itens_resumo: (itensPorVenda.get(v.id) || []).join(' | ') || '-',
      status: v.status,
      valor_total: Number(v.valor_total || 0),
      valor_final: Number(v.valor_final || 0),
      valor_pago: valorPago,
      saldo_devedor: saldoDevedor,
      nf_emitida: v.nf_emitida || false,
    }
  })
}

export interface DailyFlowRow {
  date: Date;
  diaSemana: string;
  diaMes: string;
  reportMode?: 'installments' | 'cash';

  // Entradas reais (Recibos / Pagamentos realizados no dia)
  entradasTotais: number;
  entradasAcumuladas: number;

  // Vendas realizadas no dia
  vendaGarantida: number; // Pix, Dinheiro, Cartão (Valor Final da Venda - Valor Financiado)
  vendaParcelada: number; // Valor Financiado na loja
  vendaTotal: number; // Garantida + Parcelada
  vendaAcumulada: number;
  valorInicialGaveta?: number;
  valorFinalGaveta?: number;
  totalDinheiro?: number;
  totalMaquina?: number;
  totalDiario?: number;
  diarioAcumulado?: number;
}

export async function getDailyFlowReport(storeId: number, monthStr: string, yearStr: string): Promise<DailyFlowRow[]> {
  const supabase = createAdminClient()
  const month = parseInt(monthStr) - 1; // 0-indexed para date-fns
  const year = parseInt(yearStr);
  const installmentsEnabled = await isStoreModuleEnabledForStore(storeId, 'installments')

  const startDate = startOfMonth(new Date(year, month));
  const endDate = endOfMonth(startDate);

  const startDateStr = startOfDay(startDate).toISOString();
  const endDateStr = endOfDay(endDate).toISOString();

  if (!installmentsEnabled) {
    const { data: caixasRaw, error: caixasError } = await (supabase.from('caixa_diario') as any)
      .select('id, data_abertura, status, saldo_inicial, saldo_final')
      .eq('store_id', storeId)
      .gte('data_abertura', startDateStr)
      .lte('data_abertura', endDateStr)
      .order('data_abertura', { ascending: true });

    if (caixasError) throw new Error(caixasError.message);

    const caixas = (caixasRaw || []) as Array<{
      id: number;
      data_abertura: string;
      status: string;
      saldo_inicial: number | null;
      saldo_final: number | null;
    }>;

    const caixaIds = caixas.map((caixa) => caixa.id);

    const [{ data: pagamentosRaw, error: pagError }, { data: movimentosRaw, error: movError }] = await Promise.all([
      (supabase.from('pagamentos') as any)
        .select('created_at, valor_pago, forma_pagamento')
        .eq('store_id', storeId)
        .gte('created_at', startDateStr)
        .lte('created_at', endDateStr),
      caixaIds.length > 0
        ? (supabase.from('caixa_movimentacoes') as any)
          .select('caixa_id, tipo, valor')
          .in('caixa_id', caixaIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (pagError) throw new Error(pagError.message);
    if (movError) throw new Error(movError.message);

    const pagamentos = (pagamentosRaw || []) as Array<{
      created_at: string;
      valor_pago: number;
      forma_pagamento: string | null;
    }>;

    const movimentos = (movimentosRaw || []) as Array<{
      caixa_id: number;
      tipo: 'Entrada' | 'Saida';
      valor: number;
    }>;

    const caixaPorDia = new Map<string, typeof caixas[number]>();
    caixas.forEach((caixa) => {
      caixaPorDia.set(format(parseISO(caixa.data_abertura), 'yyyy-MM-dd'), caixa);
    });

    const movimentosPorCaixa = new Map<number, { entradas: number; saidas: number }>();
    movimentos.forEach((movimento) => {
      const atual = movimentosPorCaixa.get(movimento.caixa_id) || { entradas: 0, saidas: 0 };
      const valor = Number(movimento.valor || 0);
      if (movimento.tipo === 'Entrada') atual.entradas += valor;
      else atual.saidas += valor;
      movimentosPorCaixa.set(movimento.caixa_id, atual);
    });

    const pagamentosPorDia = new Map<string, { dinheiro: number; maquina: number; outros: number }>();
    pagamentos.forEach((pagamento) => {
      const dia = format(parseISO(pagamento.created_at), 'yyyy-MM-dd');
      const atual = pagamentosPorDia.get(dia) || { dinheiro: 0, maquina: 0, outros: 0 };
      const valor = Number(pagamento.valor_pago || 0);
      const forma = String(pagamento.forma_pagamento || '').toLowerCase();

      if (forma.includes('dinheiro')) atual.dinheiro += valor;
      else if (forma.includes('pix') || forma.includes('cart')) atual.maquina += valor;
      else atual.outros += valor;

      pagamentosPorDia.set(dia, atual);
    });

    const daysInMonth = getDaysInMonth(startDate);
    const reportData: DailyFlowRow[] = [];
    let diarioAcumulado = 0;

    for (let i = 1; i <= daysInMonth; i++) {
      const currentDate = new Date(year, month, i);
      const dayString = format(currentDate, 'yyyy-MM-dd');
      const caixa = caixaPorDia.get(dayString);
      const pagamentosDoDia = pagamentosPorDia.get(dayString) || { dinheiro: 0, maquina: 0, outros: 0 };
      const movimentosDoDia = caixa ? (movimentosPorCaixa.get(caixa.id) || { entradas: 0, saidas: 0 }) : { entradas: 0, saidas: 0 };

      const valorInicialGaveta = Number(caixa?.saldo_inicial || 0);
      const totalDinheiro = pagamentosDoDia.dinheiro;
      const totalMaquina = pagamentosDoDia.maquina;
      const totalDiario = totalDinheiro + totalMaquina + pagamentosDoDia.outros;
      const valorFinalEsperado = valorInicialGaveta + totalDinheiro + movimentosDoDia.entradas - movimentosDoDia.saidas;
      const valorFinalGaveta = caixa?.status === 'Fechado' && caixa.saldo_final !== null
        ? Number(caixa.saldo_final)
        : valorFinalEsperado;

      diarioAcumulado += totalDiario;

      reportData.push({
        date: currentDate,
        diaMes: format(currentDate, 'dd/MM'),
        diaSemana: format(currentDate, 'EEEE', { locale: ptBR }),
        reportMode: 'cash',
        entradasTotais: 0,
        entradasAcumuladas: 0,
        vendaGarantida: 0,
        vendaParcelada: 0,
        vendaTotal: 0,
        vendaAcumulada: 0,
        valorInicialGaveta,
        valorFinalGaveta,
        totalDinheiro,
        totalMaquina,
        totalDiario,
        diarioAcumulado,
      });
    }

    return reportData;
  }

  // 1. Buscar Pagamentos (Entradas reais) no período
  const { data: pagamentosRaw, error: pagError } = await (supabase.from('pagamentos') as any)
    .select('data_pagamento, valor_pago')
    .eq('store_id', storeId)
    .gte('data_pagamento', startDateStr)
    .lte('data_pagamento', endDateStr);

  if (pagError) throw new Error(pagError.message);
  const pagamentos = (pagamentosRaw || []) as any[];

  // 2. Buscar Vendas no período (para calcular garantida vs parcelada)
  // Para identificar o quanto da venda foi parcelado na loja, olhamos para a tabela de financiamento
  // Como a venda tem 'valor_final', a venda garantida é (valor_final - valor_financiado).
  const { data: vendasRaw, error: vendError } = await (supabase.from('vendas') as any)
    .select(`
            id, 
            created_at, 
            valor_final,
            financiamento_loja!financiamento_loja_venda_id_fkey ( valor_total_financiado )
        `)
    .eq('store_id', storeId)
    .neq('status', 'Cancelada') // Ignora canceladas
    .gte('created_at', startDateStr)
    .lte('created_at', endDateStr);

  if (vendError) throw new Error(vendError.message);
  const vendas = (vendasRaw || []) as any[];

  // 3. Montar as linhas (um para cada dia do mês)
  const daysInMonth = getDaysInMonth(startDate);
  const reportData: DailyFlowRow[] = [];

  let entradasAcumuladas = 0;
  let vendaAcumulada = 0;

  for (let i = 1; i <= daysInMonth; i++) {
    const currentDate = new Date(year, month, i);
    const dayString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`; // YYYY-MM-DD local

    // --- Filtrar Pagamentos do dia ---
    const pagamentosDoDia = pagamentos.filter(p => {
      // p.data_pagamento vem como '2026-02-24T00:00:00+00:00', pegamos apenas a data
      return p.data_pagamento.substring(0, 10) === dayString;
    });
    const entradasTotais = pagamentosDoDia.reduce((acc, p) => acc + p.valor_pago, 0);
    entradasAcumuladas += entradasTotais;

    // --- Filtrar Vendas do dia ---
    const vendasDoDia = vendas.filter(v => {
      // ajustamos timezone UTC pra local e vemos se bate o dia
      const vDate = new Date(v.created_at);
      const vLocalStr = `${vDate.getFullYear()}-${String(vDate.getMonth() + 1).padStart(2, '0')}-${String(vDate.getDate()).padStart(2, '0')}`;
      return vLocalStr === dayString;
    });

    let vendaGarantida = 0;
    let vendaParcelada = 0;

    vendasDoDia.forEach(venda => {
      // @ts-ignore
      const financiamentos = venda.financiamento_loja as any[];
      let financiado = 0;
      if (financiamentos && financiamentos.length > 0) {
        financiado = financiamentos.reduce((acc, f) => acc + (f.valor_total_financiado || 0), 0);
      }

      // Garantida é o final menos o que foi pro financiamento (promissórias)
      const garantida = Math.max(0, venda.valor_final - financiado);

      vendaGarantida += garantida;
      vendaParcelada += financiado;
    });

    const vendaTotal = vendaGarantida + vendaParcelada;
    vendaAcumulada += vendaTotal;

    reportData.push({
      date: currentDate,
      diaMes: format(currentDate, 'dd/MM'),
      diaSemana: format(currentDate, 'EEEE', { locale: ptBR }),
      reportMode: 'installments',
      entradasTotais,
      entradasAcumuladas,
      vendaGarantida,
      vendaParcelada,
      vendaTotal,
      vendaAcumulada
    });
  }

  return reportData;
}

export async function getParcelamentoMetrics(storeId: number) {
  if (!(await isStoreModuleEnabledForStore(storeId, 'installments'))) {
    return { vincendasValor: 0, vincendasQtd: 0, atrasadasValor: 0, atrasadasQtd: 0, perdidasValor: 0, perdidasQtd: 0, clientesSpc: 0 }
  }

  const supabase = createAdminClient();
  const todayStr = startOfDay(new Date()).toISOString();
  const ninetyDaysAgoStr = startOfDay(addDays(new Date(), -90)).toISOString();

  // Vincendas (A vencer: data_vencimento >= hoje)
  const { data: vincendasRaw, error: err1 } = await (supabase.from('financiamento_parcelas') as any)
    .select('valor_parcela')
    .eq('store_id', storeId)
    .eq('status', 'Pendente')
    .gt('valor_parcela', 0.01)
    .gte('data_vencimento', todayStr);

  const vincendas = (vincendasRaw || []) as any[];
  const vincendasValor = vincendas.reduce((acc: number, p: any) => acc + Number(p.valor_parcela || 0), 0);
  const vincendasQtd = vincendas.length || 0;

  // Atrasadas (Vencidas, mas menos de 90 dias: hoje > data_vencimento >= hoje - 90 dias)
  const { data: atrasadasRaw, error: err2 } = await (supabase.from('financiamento_parcelas') as any)
    .select('valor_parcela')
    .eq('store_id', storeId)
    .eq('status', 'Pendente')
    .gt('valor_parcela', 0.01)
    .lt('data_vencimento', todayStr)
    .gte('data_vencimento', ninetyDaysAgoStr);

  const atrasadas = (atrasadasRaw || []) as any[];
  const atrasadasValor = atrasadas.reduce((acc: number, p: any) => acc + Number(p.valor_parcela || 0), 0);
  const atrasadasQtd = atrasadas.length || 0;

  // Perdidas (Vencidas há mais de 90 dias)
  const { data: perdidasRaw, error: err3 } = await (supabase.from('financiamento_parcelas') as any)
    .select('valor_parcela')
    .eq('store_id', storeId)
    .eq('status', 'Pendente')
    .gt('valor_parcela', 0.01)
    .lt('data_vencimento', ninetyDaysAgoStr);

  const perdidas = (perdidasRaw || []) as any[];
  const perdidasValor = perdidas.reduce((acc: number, p: any) => acc + Number(p.valor_parcela || 0), 0);
  const perdidasQtd = perdidas.length || 0;

  // Clientes no SPC
  const { count: clientesSpc, error: err4 } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('is_spc', true);

  if (err1 || err2 || err3 || err4) {
    console.error("Erro consultando parcelamento", { err1, err2, err3, err4 });
  }

  return {
    vincendasValor,
    vincendasQtd,
    atrasadasValor,
    atrasadasQtd,
    perdidasValor,
    perdidasQtd,
    clientesSpc: clientesSpc || 0
  };
}

export interface ParcelaAtrasadaItem {
  id: number
  numero_parcela: number
  valor_parcela: number
  data_vencimento: string
  customer_id: number | null
  customer_name: string
  venda_id: number | null
  dias_atraso: number
}

export async function getParcelasAtrasadas(storeId: number): Promise<ParcelaAtrasadaItem[]> {
  if (!(await isStoreModuleEnabledForStore(storeId, 'installments'))) return []

  const supabase = createAdminClient()
  const today = startOfDay(new Date())
  const todayStr = today.toISOString()
  const ninetyDaysAgoStr = startOfDay(addDays(new Date(), -90)).toISOString()

  const { data, error } = await (supabase.from('financiamento_parcelas') as any)
    .select(`
      id,
      numero_parcela,
      valor_parcela,
      data_vencimento,
      customer_id,
      customers ( full_name ),
      financiamento_loja ( venda_id )
    `)
    .eq('store_id', storeId)
    .eq('status', 'Pendente')
    .gt('valor_parcela', 0.01)
    .lt('data_vencimento', todayStr)
    .gte('data_vencimento', ninetyDaysAgoStr)
    .order('data_vencimento', { ascending: true })

  if (error) throw new Error(error.message)

  return ((data || []) as any[]).map((item: any) => {
    const dueDate = startOfDay(new Date(item.data_vencimento))
    const diffMs = today.getTime() - dueDate.getTime()
    const daysLate = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))

    return {
      id: Number(item.id),
      numero_parcela: Number(item.numero_parcela || 0),
      valor_parcela: Number(item.valor_parcela || 0),
      data_vencimento: item.data_vencimento,
      customer_id: item.customer_id ?? null,
      customer_name: item.customers?.full_name || 'Cliente nao identificado',
      venda_id: item.financiamento_loja?.venda_id ?? null,
      dias_atraso: daysLate
    }
  })
}

export interface FinanceiroExpenseItem {
  id: number;
  description: string;
  category: string;
  paymentMethod: string;
  sourceLabel: string;
  paymentDate: string | null;
  amountPaid: number;
}

export interface FinanceiroMetrics {
  recebidoTotal: number;
  recebidoDinheiro: number;
  recebidoPix: number;
  recebidoCartao: number;
  cartaoAReceber: number;
  despesasTotal: number;
  categoriasOrdenadas: Array<{ name: string; value: number }>;
  despesasDetalhadas: FinanceiroExpenseItem[];
}

export async function getFinanceiroMetrics(storeId: number, monthStr: string, yearStr: string): Promise<FinanceiroMetrics> {
  const supabase = createAdminClient();
  const month = parseInt(monthStr) - 1;
  const year = parseInt(yearStr);

  const startDate = startOfMonth(new Date(year, month));
  const endDate = endOfMonth(startDate);

  const startDateStr = startOfDay(startDate).toISOString();
  const endDateStr = endOfDay(endDate).toISOString();

  // Recebimentos (Pagamentos)
  const { data: recebimentosRaw, error: err1 } = await (supabase.from('pagamentos') as any)
    .select('valor_pago, forma_pagamento')
    .eq('store_id', storeId)
    .gte('data_pagamento', startDateStr)
    .lte('data_pagamento', endDateStr);

  let recebidoTotal = 0;
  let recebidoDinheiro = 0;
  let recebidoPix = 0;
  let recebidoCartao = 0;

  const recebimentos = (recebimentosRaw || []) as any[];
  recebimentos.forEach((r: any) => {
    recebidoTotal += r.valor_pago;
    const forma = (r.forma_pagamento || '').toLowerCase();
    if (forma.includes('dinheiro')) recebidoDinheiro += r.valor_pago;
    else if (forma.includes('pix')) recebidoPix += r.valor_pago;
    else if (forma.includes('cart') || forma.includes('credito') || forma.includes('debito')) recebidoCartao += r.valor_pago;
  });

  // Saidas do fluxo de caixa
  const { data: despesasRaw, error: err2 } = await (supabase.from('caixa_movimentacoes') as any)
    .select('id, descricao, categoria, valor, forma_pagamento, created_at')
    .eq('store_id', storeId)
    .eq('tipo', 'Saida')
    .gte('created_at', startDateStr)
    .lte('created_at', endDateStr)
    .order('created_at', { ascending: false });

  let despesasTotal = 0;
  const despesasPorCategoria: Record<string, number> = {};
  const despesasDetalhadas: FinanceiroExpenseItem[] = [];

  const despesas = (despesasRaw || []) as any[];
  despesas.forEach((d: any) => {
    const valor = Number(d.valor || 0);
    despesasTotal += valor;
    const cat = d.categoria || 'Sem Categoria';
    despesasPorCategoria[cat] = (despesasPorCategoria[cat] || 0) + valor;
    const description = d.descricao || 'Sem descricao';
    const sourceLabel = description.startsWith('Pagto Conta:')
      ? 'Conta paga no caixa'
      : 'Lancamento manual';

    despesasDetalhadas.push({
      id: Number(d.id),
      description,
      category: cat,
      paymentMethod: d.forma_pagamento || 'Dinheiro',
      sourceLabel,
      paymentDate: d.created_at || null,
      amountPaid: valor,
    });
  });

  // Valores a Receber (Cartão / Contas a Receber)
  const { data: aReceberRaw, error: err3 } = await (supabase.from('contas_a_receber') as any)
    .select('valor_liquido')
    .eq('store_id', storeId)
    .eq('status', 'Pendente')
    .gte('data_prevista', startDateStr)
    .lte('data_prevista', endDateStr);

  const aReceber = (aReceberRaw || []) as any[];
  const cartaoAReceber = aReceber.reduce((acc: number, c: any) => acc + Number(c.valor_liquido || 0), 0);

  if (err1 || err2 || err3) {
    console.error("Erro consultando métricas financeiras", { err1, err2, err3 });
  }

  // Sort categories by amount
  const categoriasOrdenadas = Object.entries(despesasPorCategoria)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return {
    recebidoTotal,
    recebidoDinheiro,
    recebidoPix,
    recebidoCartao,
    cartaoAReceber,
    despesasTotal,
    categoriasOrdenadas,
    despesasDetalhadas
  };
}

export async function getProdutosMetrics(storeId: number) {
  const supabase = createAdminClient();

  // Produtos com Estoque Baixo (entre 1 e 5 — zerados são peças que já saíram e não serão repostas)
  const { data: estoqueBaixo, error: err1 } = await supabase
    .from('products')
    .select('id, nome, categoria, estoque_atual, estoque_minimo')
    .eq('store_id', storeId)
    .gt('estoque_atual', 0)
    .lte('estoque_atual', 5)
    .order('estoque_atual', { ascending: true })
    .limit(10);

  // Produtos com Maior Margem de Lucro (calculada dinamicamente)
  const { data: produtosParaMargem, error: err2 } = await supabase
    .from('products')
    .select('id, nome, categoria, preco_custo, preco_venda')
    .eq('store_id', storeId)
    .gt('estoque_atual', 0)
    .gt('preco_venda', 0);

  const maiorMargem = (produtosParaMargem || [])
    .map((p: any) => {
      const custo = p.preco_custo || 0;
      const venda = p.preco_venda || 0;
      const margem = custo === 0 ? 100 : Math.round(((venda - custo) / venda) * 100);
      return { ...p, margem_lucro: margem };
    })
    .sort((a: any, b: any) => b.margem_lucro - a.margem_lucro)
    .slice(0, 10);

  // Produtos Mais Vendidos
  const trintaDiasAtras = startOfDay(addDays(new Date(), -30)).toISOString();

  const { data: itensVendidosRaw, error: err3 } = await (supabase.from('venda_itens') as any)
    .select(`
            quantidade,
            valor_total_item,
            product_id,
            unidade,
            products(nome, categoria)
        `)
    .eq('store_id', storeId)
    .not('product_id', 'is', null)
    .order('id', { ascending: false })
    .limit(1000);

  const itensVendidos = (itensVendidosRaw || []) as any[];
  const vendasPorProduto: Record<number, { nome: string; categoria: string; qtd: number; valor: number; unidadeLabel: string }> = {};

  itensVendidos.forEach((item: any) => {
    if (!item.product_id) return;
    const pid = item.product_id;
    const prodData = item.products as any;

    if (!vendasPorProduto[pid]) {
      vendasPorProduto[pid] = {
        nome: prodData?.nome || 'Desconhecido',
        categoria: prodData?.categoria || 'Sem Categoria',
        qtd: 0,
        valor: 0,
        unidadeLabel: (item as any).unidade === 'Par' ? 'par' : 'un'
      };
    }
    // Par = 2 unidades reais de lente, Unidade = 1
    const multiplicador = (item as any).unidade === 'Par' ? 2 : 1;
    vendasPorProduto[pid].qtd += (item.quantidade || 0) * multiplicador;
    vendasPorProduto[pid].valor += item.valor_total_item || 0;
  });

  const maisVendidos = Object.values(vendasPorProduto)
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, 10);

  if (err1 || err2 || err3) {
    console.error("Erro consultando produtos", { err1, err2, err3 });
  }

  return {
    estoqueBaixo: estoqueBaixo || [],
    maiorMargem: maiorMargem || [],
    maisVendidos
  };
}

export async function getClientesMetrics(storeId: number) {
  const supabase = createAdminClient();

  // Pegar vendas pagas/fechadas do último ano para ter volume suficiente de ranking e churn
  const doisAnosAtras = startOfDay(addDays(new Date(), -730)).toISOString();
  const umAnoAtras = addDays(new Date(), -365);

  const { data: vendasRaw, error: err1 } = await (supabase.from('vendas') as any)
    .select(`
            customer_id,
            valor_final,
            created_at,
            customers (full_name, phone)
        `)
    .eq('store_id', storeId)
    .neq('status', 'Cancelada')
    .gte('created_at', doisAnosAtras)
    .order('created_at', { ascending: false });

  // Agrupar por cliente
  const clientesMap: Record<number, { nome: string; telefone: string; totalGasto: number; ultimaVenda: Date }> = {};

  const vendas = (vendasRaw || []) as any[];
  vendas.forEach((v: any) => {
    if (!v.customer_id) return;
    const cid = v.customer_id;
    const custData = v.customers as any;
    const vDate = parseISO(v.created_at);

    if (!clientesMap[cid]) {
      clientesMap[cid] = {
        nome: custData?.full_name || 'Desconhecido',
        telefone: custData?.phone || '',
        totalGasto: 0,
        ultimaVenda: vDate
      };
    }

    clientesMap[cid].totalGasto += v.valor_final || 0;
    // Atualiza para a data mais recente
    if (vDate > clientesMap[cid].ultimaVenda) {
      clientesMap[cid].ultimaVenda = vDate;
    }
  });

  const todosClientes = Object.values(clientesMap);

  // Ranking VIP (Mais gastaram no ano)
  const rankingVip = [...todosClientes]
    .sort((a, b) => b.totalGasto - a.totalGasto)
    .slice(0, 10);

  // Risco de Churn (Última compra há mais de 1 ano — ciclo natural da ótica)
  const clientesInativos = todosClientes
    .filter(c => c.ultimaVenda < umAnoAtras)
    .sort((a, b) => b.totalGasto - a.totalGasto) // Mostrar os melhores clientes que estamos perdendo
    .slice(0, 20); // Top 20 para ligar

  if (err1) {
    console.error("Erro consultando clientes", err1);
  }

  const postSalesEnabled = await isStoreModuleEnabledForStore(storeId, 'postSales')
  const { count: posVendasFeitos } = postSalesEnabled
    ? await supabase
      .from('post_sales_interactions')
      .select('*', { count: 'exact', head: true })
    : { count: 0 }

  return {
    rankingVip,
    clientesInativos,
    posVendasRealizados: posVendasFeitos || 0
  };
}

export async function getMovimentoMetrics(storeId: number, monthStr: string, yearStr: string) {
  const supabase = createAdminClient();
  const month = parseInt(monthStr) - 1;
  const year = parseInt(yearStr);

  const startDate = startOfMonth(new Date(year, month)).toISOString();
  const endDate = endOfMonth(new Date(year, month)).toISOString();

  const { data: movementsRaw, error: err1 } = await (supabase.from('stock_movements') as any)
    .select(`
            tipo,
            quantidade,
            variant_id,
            product_variants (is_sobra)
        `)
    .eq('store_id', storeId)
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  let entradasGerais = 0;
  let saidasGerais = 0;
  let sobrasEntraram = 0;
  let sobrasVendidas = 0;

  const movements = (movementsRaw || []) as any[];
  movements.forEach((m: any) => {
    const qty = m.quantidade || 0;
    const isSobra = (m.product_variants as any)?.is_sobra === true;

    if (m.tipo === 'Entrada') {
      entradasGerais += qty;
      if (isSobra) sobrasEntraram += qty;
    } else if (m.tipo === 'Saida') {
      saidasGerais += qty;
      if (isSobra) sobrasVendidas += qty;
    } else if (m.tipo === 'Devolucao') {
      // Compensação: se o item foi devolvido/venda cancelada,
      // ele anula a saída que havia sido registrada.
      saidasGerais -= qty;
      if (isSobra) sobrasVendidas -= qty;
    }
  });

  if (err1) {
    console.error("Erro consultando movimentos", err1);
  }

  return {
    entradasGerais,
    saidasGerais: Math.max(0, saidasGerais),
    sobrasEntraram,
    sobrasVendidas: Math.max(0, sobrasVendidas)
  };
}

export async function getCobrancaMetrics(storeId: number, monthStr: string, yearStr: string) {
  if (!(await isStoreModuleEnabledForStore(storeId, 'installments'))) {
    return { totalAcionamentos: 0, cobrancasComSucesso: 0, sucessoRate: 0, rankingOperadores: [], interacoesByType: [], timelineData: [] };
  }

  const supabase = createAdminClient();
  const month = parseInt(monthStr) - 1;
  const year = parseInt(yearStr);

  const startDate = startOfMonth(new Date(year, month)).toISOString();
  const endDate = endOfMonth(new Date(year, month)).toISOString();

  // 1. Pega todas as ações de cobrança feitas no mês atual
  const { data: cobrancasRaw, error: errCobrancas } = await (supabase.from('cobranca_historico') as any)
    .select(`
            id,
            created_at,
            tipo_contato,
            registrado_por_id,
            venda_id,
            customer_id
        `)
    .eq('store_id', storeId)
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (errCobrancas) {
    console.error("Erro consultando cobranças", errCobrancas);
    return { totalAcionamentos: 0, cobrancasComSucesso: 0, sucessoRate: 0, rankingOperadores: [], interacoesByType: [], timelineData: [] };
  }

  // 2. Busca os pagamentos de financiamento dos clientes cobrados para avaliar "Sucesso"
  const cobrancas = (cobrancasRaw || []) as any[];
  const clienteIds = Array.from(new Set(cobrancas.map((c: any) => c.customer_id) || []));
  let parcelasPagas: any[] = [];

  if (clienteIds.length > 0) {
    const { data: pagamentos } = await (supabase.from('financiamento_parcelas') as any)
      .select(`
            id,
            customer_id,
            financiamento_loja(venda_id),
            data_pagamento
        `)
      .eq('status', 'Pago')
      .in('customer_id', clienteIds)
      .gte('data_pagamento', startDate);

    parcelasPagas = pagamentos || [];
  }

  let totalAcionamentos = 0;
  let cobrancasComSucesso = 0;
  let sucessoRate = 0;

  const interacoesMap: Record<string, number> = {};
  const timelineMap: Record<string, number> = {};
  const timelineSucessoMap: Record<string, number> = {};

  cobrancas.forEach((c: any) => {
    const cobThis = c as any;
    totalAcionamentos++;
    const dateStr = cobThis.created_at.split('T')[0];
    const cobDataObj = new Date(cobThis.created_at);

    // Timeline base
    timelineMap[dateStr] = (timelineMap[dateStr] || 0) + 1;

    // Interações
    const tipo = cobThis.tipo_contato || 'Outros';
    interacoesMap[tipo] = (interacoesMap[tipo] || 0) + 1;

    // Avaliação de Sucesso: O cliente pagou a parcela dessa venda EXATA logo após (ou no mesmo dia)?
    const hasPayment = parcelasPagas.some(p => {
      if (p.customer_id !== cobThis.customer_id) return false;

      // Supabase returns related table as object or array depending on relation type. financiamento_loja -> 1:1 or 1:N
      let vendaPagamento = null;
      if (Array.isArray(p.financiamento_loja) && p.financiamento_loja.length > 0) {
        vendaPagamento = p.financiamento_loja[0]?.venda_id;
      } else if (p.financiamento_loja) {
        vendaPagamento = p.financiamento_loja?.venda_id;
      }

      // Se a cobrança é de uma venda específica, e essa parcela/pagamento não é dela, ignore.
      if (cobThis.venda_id && vendaPagamento && cobThis.venda_id !== vendaPagamento) {
        return false;
      }

      if (p.data_pagamento) {
        const dataPag = new Date(p.data_pagamento);
        if (dataPag >= cobDataObj || dataPag.toISOString().split('T')[0] === dateStr) {
          return true;
        }
      }
      return false;
    });

    if (hasPayment) {
      cobrancasComSucesso++;
      timelineSucessoMap[dateStr] = (timelineSucessoMap[dateStr] || 0) + 1;
    }
  });

  sucessoRate = totalAcionamentos > 0 ? Math.round((cobrancasComSucesso / totalAcionamentos) * 100) : 0;

  // Formatações
  const interacoesByType = Object.keys(interacoesMap).map(k => ({
    name: k,
    value: interacoesMap[k]
  }));

  const sortedDays = Object.keys(timelineMap).sort();
  const timelineData = sortedDays.map(day => ({
    date: day.split('-').reverse().slice(0, 2).join('/'),
    contatos: timelineMap[day],
    sucessos: timelineSucessoMap[day] || 0
  }));

  return {
    totalAcionamentos,
    cobrancasComSucesso,
    sucessoRate,
    interacoesByType,
    timelineData
  };
}

// ================================================================
// 9. RELATÓRIO: PÓS-VENDA
// ================================================================
export async function getPosVendaMetrics(storeId: number, monthStr: string, yearStr: string) {
  if (!(await isStoreModuleEnabledForStore(storeId, 'postSales'))) {
    return {
      totalPosVendas: 0,
      concluidos: 0,
      emAcompanhamento: 0,
      notaMedia: 'N/A',
      taxaConclusao: 0,
      interactionsByType: [],
      avaliacoesDistribuidas: [
        { name: '5 Estrelas', value: 0 },
        { name: '4 Estrelas', value: 0 },
        { name: '3 Estrelas', value: 0 },
        { name: '2 Estrelas', value: 0 },
        { name: '1 Estrela', value: 0 },
      ],
      timelineData: []
    }
  }

  const supabase = createAdminClient();
  const month = parseInt(monthStr) - 1;
  const year = parseInt(yearStr);

  const startDate = startOfMonth(new Date(year, month)).toISOString();
  const endDate = endOfMonth(new Date(year, month)).toISOString();

  // Busca os Post-Sales
  const { data: posVendas, error: err1 } = await supabase
    .from('post_sales')
    .select('id, status, avaliacao_cliente, created_at, updated_at')
    .eq('store_id', storeId)
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  // Busca as Interações
  const { data: interacoes, error: err2 } = await supabase
    .from('post_sales_interactions')
    .select('tipo_contato, created_at')
    .eq('store_id', storeId)
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (err1) console.error("Erro consultando post_sales", err1);
  if (err2) console.error("Erro consultando post_sales_interactions", err2);

  let totalPosVendas = 0;
  let concluidos = 0;
  let emAcompanhamento = 0;
  let somaNotas = 0;
  let qtdNotas = 0;

  const avaliacoesDistribuidas = [
    { name: '5 Estrelas', value: 0 },
    { name: '4 Estrelas', value: 0 },
    { name: '3 Estrelas', value: 0 },
    { name: '2 Estrelas', value: 0 },
    { name: '1 Estrela', value: 0 },
  ];

  posVendas?.forEach(item => {
    const ps = item as any;
    totalPosVendas++;
    if (ps.status === 'Concluido') {
      concluidos++;
      if (ps.avaliacao_cliente) {
        somaNotas += ps.avaliacao_cliente;
        qtdNotas++;
        const estrelas = Math.min(Math.max(ps.avaliacao_cliente, 1), 5);
        avaliacoesDistribuidas[5 - estrelas].value++;
      }
    } else {
      emAcompanhamento++;
    }
  });

  const notaMedia = qtdNotas > 0 ? (somaNotas / qtdNotas).toFixed(1) : 'N/A';
  const taxaConclusao = totalPosVendas > 0 ? ((concluidos / totalPosVendas) * 100).toFixed(0) : 0;

  // Interações por tipo
  const interactionsMap: Record<string, number> = {};
  interacoes?.forEach(item => {
    const int = item as any;
    interactionsMap[int.tipo_contato] = (interactionsMap[int.tipo_contato] || 0) + 1;
  });

  const interactionsByType = Object.keys(interactionsMap).map(key => ({
    name: key,
    value: interactionsMap[key]
  })).sort((a, b) => b.value - a.value);

  // Linha do tempo de contatos
  const timelineMap: Record<string, number> = {};
  interacoes?.forEach(item => {
    const int = item as any;
    const day = int.created_at.split('T')[0];
    timelineMap[day] = (timelineMap[day] || 0) + 1;
  });

  const timelineData = Object.keys(timelineMap)
    .sort()
    .map(date => {
      const [y, m, d] = date.split('-');
      return {
        date: `${d}/${m}`,
        contatos: timelineMap[date]
      };
    });

  return {
    totalPosVendas,
    concluidos,
    emAcompanhamento,
    notaMedia,
    taxaConclusao,
    interactionsByType,
    avaliacoesDistribuidas,
    timelineData
  };
}

// ================================================================
// 10. RELATÓRIO: RANKING DE MÉDICOS
// ================================================================

export interface MedicoRankingItem {
  oftalmologista_id: number
  nome: string
  clinica: string | null
  total_receitas: number
  total_vendido: number
  ticket_medio: number
}

export async function getRankingMedicos(
  storeId: number,
  dataInicio: string,
  dataFim: string
): Promise<MedicoRankingItem[]> {
  const supabase = createAdminClient()

  const inicioIso = `${dataInicio}T03:00:00.000Z`
  const fimDate2 = new Date(`${dataFim}T03:00:00.000Z`)
  fimDate2.setUTCDate(fimDate2.getUTCDate() + 1)
  fimDate2.setUTCMilliseconds(fimDate2.getUTCMilliseconds() - 1)
  const fimIso = fimDate2.toISOString()

  const { data: osRaw, error: osErr } = await (supabase.from('service_orders') as any)
    .select(`
      id,
      oftalmologista_id,
      venda_id,
      oftalmologistas ( nome_completo, clinica ),
      vendas ( valor_final, status )
    `)
    .eq('store_id', storeId)
    .not('oftalmologista_id', 'is', null)
    .gte('created_at', inicioIso)
    .lte('created_at', fimIso)

  if (osErr) {
    console.error("[getRankingMedicos] Erro:", osErr)
    return []
  }

  const oss = (osRaw || []) as any[]

  const mapa = new Map<number, {
    nome: string
    clinica: string | null
    receitas: number
    valorVendido: number
    vendasContadas: Set<number>
  }>()

  oss.forEach((os: any) => {
    const medId = os.oftalmologista_id
    const nome = os.oftalmologistas?.nome_completo || 'Desconhecido'
    const clinica = os.oftalmologistas?.clinica || null

    if (!mapa.has(medId)) {
      mapa.set(medId, { nome, clinica, receitas: 0, valorVendido: 0, vendasContadas: new Set() })
    }

    const entry = mapa.get(medId)!
    entry.receitas++

    if (os.vendas?.status === 'Fechada' && os.venda_id && !entry.vendasContadas.has(os.venda_id)) {
      entry.valorVendido += Number(os.vendas.valor_final || 0)
      entry.vendasContadas.add(os.venda_id)
    }
  })

  return Array.from(mapa.entries()).map(([id, entry]) => ({
    oftalmologista_id: id,
    nome: entry.nome,
    clinica: entry.clinica,
    total_receitas: entry.receitas,
    total_vendido: entry.valorVendido,
    ticket_medio: entry.receitas > 0 ? parseFloat((entry.valorVendido / entry.receitas).toFixed(2)) : 0
  }))
}

// ================================================================
// 11. RELATÓRIO: ANÁLISE DE MARCAS (Solares e Armações)
// ================================================================

export interface BrandMetricsItem {
  marca: string;
  estoqueAtual: number;
  vendidosPeriodo: number;
  receitaPeriodo: number;
  ultimaVenda: Date | null;
}

export async function getBrandMovementMetrics(storeId: number, monthStr: string, yearStr: string): Promise<BrandMetricsItem[]> {
  const supabase = createAdminClient();
  const month = parseInt(monthStr) - 1;
  const year = parseInt(yearStr);

  const startDate = startOfMonth(new Date(year, month)).toISOString();
  const endDate = endOfMonth(new Date(year, month)).toISOString();

  // 1. Fetch current stock for Armacao and Solar grouped by brand
  const { data: productsRaw, error: err1 } = await (supabase.from('products') as any)
    .select('marca, estoque_atual, id')
    .eq('store_id', storeId)
    .in('tipo_produto', ['Armacao', 'Solar']);

  if (err1) {
    console.error("Erro consultando estoque por marca", err1);
    return [];
  }

  const inventoryMap = new Map<string, { estoque: number; productIds: Set<number> }>();
  (productsRaw || []).forEach((p: any) => {
    const marca = (p.marca || 'Sem Marca').trim().toUpperCase();
    if (!inventoryMap.has(marca)) {
      inventoryMap.set(marca, { estoque: 0, productIds: new Set() });
    }
    const entry = inventoryMap.get(marca)!;
    entry.estoque += (p.estoque_atual || 0);
    entry.productIds.add(p.id);
  });

  // 2. Fetch sales for these products in the period
  const { data: vendasPeriodoRaw, error: err2 } = await (supabase.from('venda_itens') as any)
    .select(`
      quantidade,
      valor_total_item,
      product_id,
      vendas!inner ( status, created_at )
    `)
    .eq('store_id', storeId)
    .gte('vendas.created_at', startDate)
    .lte('vendas.created_at', endDate)
    .neq('vendas.status', 'Cancelada');

  if (err2) {
    console.error("Erro consultando vendas por marca no período", err2);
  }

  const salesMap = new Map<number, { qty: number, revenue: number }>();
  (vendasPeriodoRaw || []).forEach((item: any) => {
    if (!item.product_id) return;
    if (!salesMap.has(item.product_id)) {
      salesMap.set(item.product_id, { qty: 0, revenue: 0 });
    }
    const entry = salesMap.get(item.product_id)!;
    entry.qty += (item.quantidade || 0);
    entry.revenue += (item.valor_total_item || 0);
  });

  // 3. Fetch last sale date for these products (all time)
  const { data: allSalesRaw, error: err3 } = await (supabase.from('venda_itens') as any)
    .select(`
      product_id,
      vendas!inner ( status, created_at )
    `)
    .eq('store_id', storeId)
    .neq('vendas.status', 'Cancelada');

  if (err3) {
    console.error("Erro consultando histórico de vendas para marcas", err3);
  }

  const lastSaleMap = new Map<number, Date>();
  (allSalesRaw || []).forEach((item: any) => {
    if (!item.product_id || !item.vendas?.created_at) return;
    const saleDate = new Date(item.vendas.created_at);
    const existingDate = lastSaleMap.get(item.product_id);
    if (!existingDate || saleDate > existingDate) {
      lastSaleMap.set(item.product_id, saleDate);
    }
  });

  // 4. Compile final results
  const results: BrandMetricsItem[] = [];

  for (const [marca, data] of inventoryMap.entries()) {
    if (marca === 'SEM MARCA') continue; // Skip empty/unbranded if desired, but maybe user wants it. Let's keep it but group properly.

    let vendP = 0;
    let recP = 0;
    let currLastSale: Date | null = null;

    for (const pid of data.productIds) {
      // Add period sales
      if (salesMap.has(pid)) {
        const sm = salesMap.get(pid)!;
        vendP += sm.qty;
        recP += sm.revenue;
      }

      // Check last sale
      if (lastSaleMap.has(pid)) {
        const lsDate = lastSaleMap.get(pid)!;
        if (!currLastSale || lsDate > currLastSale) {
          currLastSale = lsDate;
        }
      }
    }

    // Incluir se houver estoque OU tiver vendido no periodo
    if (data.estoque > 0 || vendP > 0) {
      results.push({
        marca: marca,
        estoqueAtual: data.estoque,
        vendidosPeriodo: vendP,
        receitaPeriodo: recP,
        ultimaVenda: currLastSale
      });
    }
  }

  // Ordenar por receita (desc) e vendidos (desc)
  return results.sort((a, b) => b.receitaPeriodo - a.receitaPeriodo || b.vendidosPeriodo - a.vendidosPeriodo);
}

// ================================================================
// 12. RELATÓRIO: ESTOQUE FÍSICO DETALHADO (Solares e Armações)
// ================================================================

export interface EstoqueReportItem {
  id: number;
  tipo_produto: string;
  categoria: string;
  marca: string;
  nome: string;
  preco_custo: number;
  preco_venda: number;
  estoque_atual: number;
  valor_total_venda_estimado: number;
}

export async function getEstoqueSolaresArmacoes(storeId: number, marca?: string): Promise<EstoqueReportItem[]> {
  const supabase = createAdminClient();

  // Building query
  let query = (supabase.from('products') as any)
    .select('id, tipo_produto, categoria, marca, nome, preco_custo, preco_venda, estoque_atual')
    .eq('store_id', storeId)
    .in('tipo_produto', ['Armacao', 'Solar']);

  // Apply brand filter if provided
  if (marca) {
    if (marca === 'SEM MARCA') {
      query = query.or('marca.is.null,marca.eq.""');
    } else {
      query = query.ilike('marca', `%${marca}%`);
    }
  }

  const { data: productsRaw, error } = await query;

  if (error) {
    console.error("Erro consultando estoque detalhado", error);
    return [];
  }

  const result: EstoqueReportItem[] = (productsRaw || []).map((p: any) => {
    const estoque = Number(p.estoque_atual || 0);
    const precoVenda = Number(p.preco_venda || 0);

    return {
      id: p.id,
      tipo_produto: p.tipo_produto || '',
      categoria: p.categoria || '',
      marca: (p.marca || 'Sem Marca').toUpperCase(),
      nome: p.nome || '',
      preco_custo: Number(p.preco_custo || 0),
      preco_venda: precoVenda,
      estoque_atual: estoque,
      valor_total_venda_estimado: estoque > 0 ? (estoque * precoVenda) : 0
    };
  });

  // Ordenar por estoque atual (descrescente)
  return result.sort((a, b) => b.estoque_atual - a.estoque_atual);
}

/**
 * Retorna lista de marcas únicas para o filtro de Estoque
 */
export async function getMarcasFiltroEstoque(storeId: number): Promise<string[]> {
  const supabase = createAdminClient();
  const PAGE_SIZE = 1000;
  const marcasSet = new Set<string>();
  let from = 0;
  let keepGoing = true;

  while (keepGoing) {
    const { data, error } = await (supabase.from('products') as any)
      .select('marca')
      .eq('store_id', storeId)
      .in('tipo_produto', ['Armacao', 'Solar'])
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data || data.length === 0) {
      keepGoing = false;
      break;
    }

    data.forEach((p: any) => {
      const m = (p.marca || 'SEM MARCA').trim().toUpperCase();
      if (m) marcasSet.add(m);
    });

    if (data.length < PAGE_SIZE) {
      keepGoing = false;
    } else {
      from += PAGE_SIZE;
    }
  }

  return Array.from(marcasSet).sort();
}
