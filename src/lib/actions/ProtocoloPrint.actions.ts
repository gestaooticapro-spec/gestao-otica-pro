'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreLogoPublicUrl } from '@/lib/store-logo'

// Tipagem básica para facilitar o retorno (pode ajustar conforme seu projeto)
export interface DadosProtocolo {
  os_id: number
  os_numero: string | number
  data_emissao: string
  data_entrega: string
  cliente_nome: string
  cliente_fone: string
  total_venda: number
  valor_sinal: number
  valor_restante: number
  qtd_parcelas: number
  valor_primeira_parcela: number
  desc_lente: string
  valor_lente: number
  desc_armacao: string
  valor_armacao: number
  od_esf: string
  od_cil: string
  od_eixo: string
  od_dnp: string
  oe_esf: string
  oe_cil: string
  oe_eixo: string
  oe_dnp: string
  adicao: string
  altura: string
  diametro: string
  laboratorio: string
  obs_os: string
  print_type: 'pre_printed' | 'half_a4'
  store: {
    name: string
    logo_url: string
    street: string
    number: string
    neighborhood: string
    city: string
    state: string
    phone: string
    whatsapp: string
  }
}

export async function getDadosProtocolo(osId: number) {
  const supabase = createAdminClient()

  console.log(`[PRINT_DEBUG] 1. Iniciando busca PROTOCOLO para OS ID: ${osId}`)

  try {
    // ------------------------------------------------------------------
    // PASSO 1: Busca a Ordem de Serviço (OS)
    // ------------------------------------------------------------------
    const { data: osRaw, error: erroOS } = await supabase
      .from('service_orders')
      .select('*')
      .eq('id', osId)
      .single()

    if (erroOS || !osRaw) {
      throw new Error(`OS ${osId} não encontrada.`)
    }
    const os = osRaw as any

    const { data: storeRaw } = await (supabase
      .from('stores') as any)
      .select('name, settings, street, number, neighborhood, city, state, phone, whatsapp')
      .eq('id', os.store_id)
      .single()

    const storeSettings = (storeRaw?.settings || {}) as Record<string, unknown>
    const logoSetting = typeof storeSettings.logo === 'string' ? storeSettings.logo : ''
    const logoUrl = getStoreLogoPublicUrl(logoSetting) || ''

    // ------------------------------------------------------------------
    // PASSO 2: Busca o Cliente e/ou Dependente (prioridade para dependente)
    // ------------------------------------------------------------------
    let clienteNome = ''
    let clienteFone = ''

    if (os.customer_id) {
      const { data: clienteRaw } = await supabase
        .from('customers')
        .select('full_name, fone_movel, phone')
        .eq('id', os.customer_id)
        .single()

      if (clienteRaw) {
        const c = clienteRaw as any
        clienteNome = c.full_name
        // Prioriza celular, se não tiver pega o fixo
        clienteFone = c.fone_movel || c.phone || ''
      }
    }

    if (os.dependente_id) {
      const { data: depRaw } = await (supabase
        .from('dependentes')
        .select('full_name')
        .eq('id', os.dependente_id)
        .single() as any)

      if (depRaw?.full_name) {
        clienteNome = depRaw.full_name
      }
    }

    // ------------------------------------------------------------------
    // PASSO 3: Busca a Venda (Para totais)
    // ------------------------------------------------------------------
    let totalVenda = 0
    let financiamentoId = null
    let vendaId = os.venda_id

    if (vendaId) {
      const { data: vendaRaw } = await supabase
        .from('vendas')
        .select('valor_final, financiamento_id')
        .eq('id', vendaId)
        .single()

      if (vendaRaw) {
        const v = vendaRaw as any
        totalVenda = parseFloat(v.valor_final || '0')
        financiamentoId = v.financiamento_id
      }
    }

    // ------------------------------------------------------------------
    // PASSO 4: Busca Pagamentos (Sinal/Entrada)
    // ------------------------------------------------------------------
    // Lógica: Soma tudo que NÃO for 'CARNE', 'CREDIARIO', etc.
    let valorSinal = 0

    if (vendaId) {
      const { data: pagsRaw } = await supabase
        .from('pagamentos')
        .select('valor_pago, metodo')
        .eq('venda_id', vendaId)

      if (pagsRaw) {
        const pagamentos = pagsRaw as any[]
        // Filtra e soma em JS para garantir
        valorSinal = pagamentos.reduce((acc, p) => {
          const metodo = (p.metodo || '').toUpperCase()
          // Se NÃO for carnê, conta como entrada
          if (!['CARNE', 'CARNÊ', 'CREDIARIO'].includes(metodo)) {
            return acc + parseFloat(p.valor_pago || '0')
          }
          return acc
        }, 0)
      }
    }

    // Cálculo do Restante
    const valorRestante = totalVenda - valorSinal

    // ------------------------------------------------------------------
    // PASSO 5: Busca Parcelas (Carnê)
    // ------------------------------------------------------------------
    let qtdParcelas = 0
    let valorPrimeiraParcela = 0

    if (financiamentoId) {
      const { data: parcelasRaw } = await supabase
        .from('financiamento_parcelas')
        .select('valor_parcela, numero_parcela')
        .eq('financiamento_id', financiamentoId)
        .order('numero_parcela', { ascending: true }) // Ordena para pegar a 1ª

      if (parcelasRaw && parcelasRaw.length > 0) {
        const parcelas = parcelasRaw as any[]
        qtdParcelas = parcelas.length
        valorPrimeiraParcela = parseFloat(parcelas[0].valor_parcela || '0')
      }
    }

    // ------------------------------------------------------------------
    // PASSO 6: Busca Produtos (Lente e Armação) via Links
    // Usa o valor negociado na venda (venda_itens) em vez do cadastro
    // ------------------------------------------------------------------
    let descLente = ''
    let valorLente = 0
    let descArmacao = ''
    let valorArmacao = 0

    // 6.1 Busca os Links da OS
    const { data: linksRaw } = await supabase
      .from('venda_itens_os_links')
      .select('venda_item_id, uso_na_os')
      .eq('service_order_id', osId)

    if (linksRaw && linksRaw.length > 0) {
      const itemIds = linksRaw.map((l: any) => l.venda_item_id)
      const lensIds = new Set<number>()
      const armacaoIds = new Set<number>()

      linksRaw.forEach((l: any) => {
        if (l.uso_na_os === 'lente_od' || l.uso_na_os === 'lente_oe') {
          lensIds.add(l.venda_item_id)
        }
        if (l.uso_na_os === 'armacao') {
          armacaoIds.add(l.venda_item_id)
        }
      })

      // 6.2 Busca os Itens da Venda (negociados)
      const { data: itensRaw } = await supabase
        .from('venda_itens')
        .select('id, descricao, quantidade, valor_unitario, valor_total_item')
        .in('id', itemIds)

      if (itensRaw && itensRaw.length > 0) {
        const itens = itensRaw as any[]

        const calcValorItem = (item: any) => {
          const total = parseFloat(item.valor_total_item || '0')
          if (!isNaN(total) && total > 0) return total
          const unit = parseFloat(item.valor_unitario || '0')
          const qtd = parseFloat(item.quantidade || '0')
          return unit * (qtd || 1)
        }

        const lensItems = itens.filter(i => lensIds.has(i.id))
        if (lensItems.length > 0) {
          descLente = lensItems.map(i => i.descricao).filter(Boolean).join(' + ')
          const uniqueLens = new Map<number, any>()
          lensItems.forEach(i => uniqueLens.set(i.id, i))
          valorLente = Array.from(uniqueLens.values()).reduce((acc, i) => acc + calcValorItem(i), 0)
        }

        const armacaoItems = itens.filter(i => armacaoIds.has(i.id))
        if (armacaoItems.length > 0) {
          descArmacao = armacaoItems.map(i => i.descricao).filter(Boolean).join(' + ')
          const uniqueArmacao = new Map<number, any>()
          armacaoItems.forEach(i => uniqueArmacao.set(i.id, i))
          valorArmacao = Array.from(uniqueArmacao.values()).reduce((acc, i) => acc + calcValorItem(i), 0)
        }
      }
    }

    // ------------------------------------------------------------------
    // RETORNO FINAL (Mapeado para o objeto esperado)
    // ------------------------------------------------------------------
    const dadosFinais: DadosProtocolo = {
      os_id: os.id,
      os_numero: os.protocolo_fisico,
      data_emissao: os.created_at,
      data_entrega: os.dt_prometido_para,

      cliente_nome: clienteNome,
      cliente_fone: clienteFone,

      total_venda: totalVenda,
      valor_sinal: valorSinal,
      valor_restante: valorRestante < 0 ? 0 : valorRestante, // Evita negativo

      qtd_parcelas: qtdParcelas,
      valor_primeira_parcela: valorPrimeiraParcela,

      desc_lente: descLente,
      valor_lente: valorLente,
      desc_armacao: descArmacao,
      valor_armacao: valorArmacao,

      // Dados Técnicos (Receita) - Verifica nulos
      od_esf: os.receita_longe_od_esferico || '',
      od_cil: os.receita_longe_od_cilindrico || '',
      od_eixo: os.receita_longe_od_eixo || '',
      od_dnp: os.medida_dnp_od || '',

      oe_esf: os.receita_longe_oe_esferico || '',
      oe_cil: os.receita_longe_oe_cilindrico || '',
      oe_eixo: os.receita_longe_oe_eixo || '',
      oe_dnp: os.medida_dnp_oe || '',

      adicao: os.receita_adicao || '',
      altura: os.medida_altura_od || '', // Usando OD como padrão conforme conversado
      diametro: os.medida_diametro || '',
      laboratorio: os.lab_nome || '',
      obs_os: os.obs_os || '',

      print_type: storeSettings.os_print_type === 'half_a4' ? 'half_a4' : 'pre_printed',
      store: {
        name: storeRaw?.name || '',
        logo_url: logoUrl,
        street: storeRaw?.street || '',
        number: storeRaw?.number || '',
        neighborhood: storeRaw?.neighborhood || '',
        city: storeRaw?.city || '',
        state: storeRaw?.state || '',
        phone: storeRaw?.phone || '',
        whatsapp: storeRaw?.whatsapp || ''
      }
    }

    console.log(`[PRINT_DEBUG] Sucesso OS ${osId}. Cliente: ${clienteNome}`)

    return {
      success: true,
      data: dadosFinais
    }

  } catch (error: any) {
    console.error('[PRINT_DEBUG] ERRO FATAL PROTOCOLO:', error)
    return { success: false, error: error.message }
  }
}
