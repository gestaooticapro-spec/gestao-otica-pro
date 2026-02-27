'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { format, parseISO, startOfDay, endOfDay, addDays, getDaysInMonth, startOfMonth, endOfMonth, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export interface VendaRelatorioItem {
  id: number
  data: string
  data_fechamento: string | null
  cliente: string
  vendedor: string
  itens_resumo: string
  status: string
  valor_total: number
  valor_final: number
  valor_pago: number
  saldo_devedor: number
}

export async function getRelatorioVendas(
  storeId: number,
  dataInicio: string,
  dataFim: string
): Promise<VendaRelatorioItem[]> {
  const supabase = createAdminClient()
  const inicioIso = startOfDay(new Date(dataInicio)).toISOString()
  const fimIso = endOfDay(new Date(dataFim)).toISOString()

  const { data: vendas, error: vendasError } = await (supabase.from('vendas') as any)
    .select(`
      id,
      created_at,
      data_fechamento,
      status,
      valor_total,
      valor_final,
      valor_restante,
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

  const [itensRes, pagamentosRes] = await Promise.all([
    supabase
      .from('venda_itens')
      .select('venda_id, descricao, quantidade')
      .in('venda_id', vendaIds),
    supabase
      .from('pagamentos')
      .select('venda_id, valor_pago')
      .in('venda_id', vendaIds),
  ])

  if (itensRes.error) throw new Error(itensRes.error.message)
  if (pagamentosRes.error) throw new Error(pagamentosRes.error.message)

  const itensPorVenda = new Map<number, string[]>()
  ;(itensRes.data || []).forEach((item: any) => {
    const atual = itensPorVenda.get(item.venda_id) || []
    const qtd = Number(item.quantidade || 0)
    const desc = String(item.descricao || '').trim()
    if (desc) atual.push(`${qtd > 0 ? `${qtd}x ` : ''}${desc}`)
    itensPorVenda.set(item.venda_id, atual)
  })

  const pagoPorVenda = new Map<number, number>()
  ;(pagamentosRes.data || []).forEach((pag: any) => {
    const atual = pagoPorVenda.get(pag.venda_id) || 0
    pagoPorVenda.set(pag.venda_id, atual + Number(pag.valor_pago || 0))
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
      itens_resumo: (itensPorVenda.get(v.id) || []).join(' | ') || '-',
      status: v.status,
      valor_total: Number(v.valor_total || 0),
      valor_final: Number(v.valor_final || 0),
      valor_pago: valorPago,
      saldo_devedor: saldoDevedor,
    }
  })
}

export interface DailyFlowRow {
  date: Date;
  diaSemana: string;
  diaMes: string;

  // Entradas reais (Recibos / Pagamentos realizados no dia)
  entradasTotais: number;
  entradasAcumuladas: number;

  // Vendas realizadas no dia
  vendaGarantida: number; // Pix, Dinheiro, Cartão (Valor Final da Venda - Valor Financiado)
  vendaParcelada: number; // Valor Financiado na loja
  vendaTotal: number; // Garantida + Parcelada
  vendaAcumulada: number;
}

export async function getDailyFlowReport(storeId: number, monthStr: string, yearStr: string): Promise<DailyFlowRow[]> {
  const supabase = createAdminClient()
  const month = parseInt(monthStr) - 1; // 0-indexed para date-fns
  const year = parseInt(yearStr);

  const startDate = startOfMonth(new Date(year, month));
  const endDate = endOfMonth(startDate);

  const startDateStr = startOfDay(startDate).toISOString();
  const endDateStr = endOfDay(endDate).toISOString();

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
  const supabase = createAdminClient();
  const todayStr = startOfDay(new Date()).toISOString();
  const ninetyDaysAgoStr = startOfDay(addDays(new Date(), -90)).toISOString();

  // Vincendas (A vencer: data_vencimento >= hoje)
  const { data: vincendasRaw, error: err1 } = await (supabase.from('financiamento_parcelas') as any)
    .select('valor_parcela')
    .eq('store_id', storeId)
    .eq('status', 'Pendente')
    .gte('data_vencimento', todayStr);

  const vincendas = (vincendasRaw || []) as any[];
  const vincendasValor = vincendas.reduce((acc: number, p: any) => acc + Number(p.valor_parcela || 0), 0);
  const vincendasQtd = vincendas.length || 0;

  // Atrasadas (Vencidas, mas menos de 90 dias: hoje > data_vencimento >= hoje - 90 dias)
  const { data: atrasadasRaw, error: err2 } = await (supabase.from('financiamento_parcelas') as any)
    .select('valor_parcela')
    .eq('store_id', storeId)
    .eq('status', 'Pendente')
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

export async function getFinanceiroMetrics(storeId: number, monthStr: string, yearStr: string) {
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

  // Despesas (Contas a Pagar pagas)
  const { data: despesasRaw, error: err2 } = await (supabase.from('accounts_payable') as any)
    .select('amount_paid, category')
    .eq('store_id', storeId)
    .eq('status', 'Pago')
    .gte('payment_date', startDateStr)
    .lte('payment_date', endDateStr);

  let despesasTotal = 0;
  const despesasPorCategoria: Record<string, number> = {};

  const despesas = (despesasRaw || []) as any[];
  despesas.forEach((d: any) => {
    const valor = d.amount_paid || 0;
    despesasTotal += valor;
    const cat = d.category || 'Sem Categoria';
    despesasPorCategoria[cat] = (despesasPorCategoria[cat] || 0) + valor;
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
    categoriasOrdenadas
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

  const { count: posVendasFeitos, error: err2 } = await supabase
    .from('post_sales_interactions')
    .select('*', { count: 'exact', head: true });

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
    }
  });

  if (err1) {
    console.error("Erro consultando movimentos", err1);
  }

  return {
    entradasGerais,
    saidasGerais,
    sobrasEntraram,
    sobrasVendidas
  };
}

export async function getCobrancaMetrics(storeId: number, monthStr: string, yearStr: string) {
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
