export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      // --- TABELAS DE CONFIGURAÇÃO & GESTÃO ---
      
      profiles: {
        Row: {
          id: string
          role: string | null
          store_id: number | null
          tenant_id: string | null
          created_at: string
        }
        Insert: {
          id: string
          role?: string | null
          store_id?: number | null
          tenant_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          role?: string | null
          store_id?: number | null
          tenant_id?: string | null
          created_at?: string
        }
      }
      
      employees: {
        Row: {
          id: number
          store_id: number
          full_name: string
          pin: string
          is_active: boolean
          role: 'vendedor' | 'gerente' | 'tecnico'
          created_at: string

          // NOVAS COLUNAS DE COMISSÃO
          comm_rate_guaranteed: number | null    // % Venda Garantida (Pix/Cartão)
          comm_rate_store_credit: number | null  // % Venda Risco (Carnê)
          comm_rate_store_total: number | null   // % Sobre Total da Loja
          comm_rate_received: number | null      // % Sobre Recebimento Caixa
          comm_rate_profit: number | null        // % Sobre Lucro
          comm_tiers_json: Json | null           // Metas (JSON)
        }
        Insert: {
          id?: number
          store_id: number
          full_name: string
          pin: string
          is_active?: boolean
          role?: 'vendedor' | 'gerente' | 'tecnico'
          created_at?: string

          // NOVAS COLUNAS (Opcionais no Insert)
          comm_rate_guaranteed?: number | null
          comm_rate_store_credit?: number | null
          comm_rate_store_total?: number | null
          comm_rate_received?: number | null
          comm_rate_profit?: number | null
          comm_tiers_json?: Json | null
        }
        Update: {
          id?: number
          store_id?: number
          full_name?: string
          pin?: string
          is_active?: boolean
          role?: 'vendedor' | 'gerente' | 'tecnico'
          created_at?: string

          // NOVAS COLUNAS (Opcionais no Update)
          comm_rate_guaranteed?: number | null
          comm_rate_store_credit?: number | null
          comm_rate_store_total?: number | null
          comm_rate_received?: number | null
          comm_rate_profit?: number | null
          comm_tiers_json?: Json | null
        }
      }

      stores: {
        Row: {
          id: number
          name: string
          tenant_id: string
          settings: Json | null
        }
        Insert: {
          id?: number
          name: string
          tenant_id: string
          settings?: Json | null
        }
        Update: {
          id?: number
          name?: string
          tenant_id?: string
          settings?: Json | null
        }
      }

      suppliers: {
        Row: {
          id: number
          store_id: number
          tenant_id: string | null
          nome_fantasia: string
          razao_social: string | null
          cnpj: string | null
          inscricao_estadual: string | null
          cidade: string | null
          uf: string | null
          created_at: string
        }
        Insert: {
          id?: number
          store_id: number
          tenant_id?: string | null
          nome_fantasia: string
          razao_social?: string | null
          cnpj?: string | null
          inscricao_estadual?: string | null
          cidade?: string | null
          uf?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          nome_fantasia?: string
          // ... demais campos opcionais
        }
      }

      // --- CONTAS A PAGAR (DESPESAS) ---
      accounts_payable: {
        Row: {
          id: number
          tenant_id: string | null
          store_id: number
          
          description: string
          amount: number
          amount_paid: number
          
          due_date: string
          payment_date: string | null
          
          status: 'Pendente' | 'Pago' | 'Cancelado'
          category: string | null
          supplier_id: number | null
          
          created_by_user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          tenant_id?: string | null
          store_id: number
          
          description: string
          amount: number
          amount_paid?: number
          
          due_date: string
          payment_date?: string | null
          
          status?: 'Pendente' | 'Pago' | 'Cancelado'
          category?: string | null
          supplier_id?: number | null
          
          created_by_user_id?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          description?: string
          amount?: number
          amount_paid?: number
          due_date?: string
          payment_date?: string | null
          status?: 'Pendente' | 'Pago' | 'Cancelado'
          category?: string | null
          supplier_id?: number | null
          updated_at?: string
          [key: string]: any
        }
      }

      // --- CONTROLE DE NOTAS FISCAIS ---
      imported_invoices: {
        Row: {
          id: number
          store_id: number
          tenant_id: string | null
          access_key: string
          nfe_number: string | null
          series: string | null
          supplier_id: number | null
          imported_at: string
        }
        Insert: {
          id?: number
          store_id: number
          tenant_id?: string | null
          access_key: string
          nfe_number?: string | null
          series?: string | null
          supplier_id?: number | null
          imported_at?: string
        }
        Update: {
          // ...
        }
      }

      // --- CLIENTES & DEPENDENTES ---

      customers: {
        Row: {
          id: number
          store_id: number
          full_name: string
          cpf: string | null
          rg: string | null
          birth_date: string | null
          phone: string | null
          fone_movel: string | null
          email: string | null
          rua: string | null
          numero: string | null
          bairro: string | null
          cidade: string | null
          uf: string | null
          cep: string | null
          complemento: string | null
          
          naturalidade: string | null
          estado_civil: string | null
          pai: string | null
          mae: string | null
          conjuge_nome: string | null
          conjuge_nascimento: string | null
          conjuge_naturalidade: string | null
          conjuge_trabalho: string | null
          conjuge_fone: string | null
          
          comercial_trabalho: string | null
          comercial_cargo: string | null
          comercial_endereco: string | null
          comercial_fone: string | null
          comercial_renda: number | null
          obs_comercial: string | null
          obs_residencial: string | null
          ref_comercio_1: string | null
          ref_comercio_2: string | null
          ref_pessoal_1: string | null
          ref_pessoal_2: string | null
          
          obs_debito: string | null
          notes: string | null
          faixa_etaria: string | null
          is_spc: boolean | null
          created_at: string
        }
        Insert: {
          id?: number
          store_id: number
          full_name: string
          cpf?: string | null
          is_spc?: boolean | null
          tenant_id?: string
          // ... demais campos opcionais
          [key: string]: any 
        }
        Update: {
          id?: number
          full_name?: string
          // ... demais campos opcionais
          [key: string]: any
        }
      }
      
      dependentes: {
        Row: {
          id: number
          store_id: number
          customer_id: number
          full_name: string
          parentesco: string | null
          birth_date: string | null
          created_at: string
        }
        Insert: {
          id?: number
          store_id: number
          customer_id: number
          full_name: string
          parentesco?: string | null
          birth_date?: string | null
          created_at?: string
          tenant_id?: string
        }
        Update: {
          id?: number
          full_name?: string
          // ...
        }
      }

      // --- CARTEIRA E COMISSÕES ---

      customer_wallets: {
        Row: {
          id: number
          tenant_id: string | null
          store_id: number
          customer_id: number
          balance: number
          updated_at: string
        }
        Insert: {
          id?: number
          tenant_id?: string | null
          store_id: number
          customer_id: number
          balance?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          updated_at?: string
          [key: string]: any
        }
      }

      wallet_transactions: {
        Row: {
          id: number
          tenant_id: string | null
          store_id: number
          wallet_id: number
          amount: number
          operation_type: string
          description: string | null
          related_venda_id: number | null
          created_by_user_id: string | null
          employee_id: number | null
          created_at: string
        }
        Insert: {
          id?: number
          tenant_id?: string | null
          store_id: number
          wallet_id: number
          amount: number
          operation_type: string
          description?: string | null
          related_venda_id?: number | null
          created_by_user_id?: string | null
          employee_id?: number | null
          created_at?: string
        }
        Update: {
          [key: string]: any
        }
      }

      commissions: {
        Row: {
          id: number
          tenant_id: string | null
          store_id: number
          employee_id: number
          venda_id: number
          amount: number
          percentage: number | null
          status: string | null
          reversal_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          tenant_id?: string | null
          store_id: number
          employee_id: number
          venda_id: number
          amount: number
          percentage?: number | null
          status?: string | null
          reversal_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: string | null
          reversal_reason?: string | null
          updated_at?: string
          [key: string]: any
        }
      }

      // --- CATÁLOGO UNIFICADO ---

products: {
  Row: {
    id: number
    store_id: number
    tenant_id: string | null
    created_at: string
    
    nome: string
    codigo_barras: string | null
    referencia: string | null
    
    tipo_produto: 'Armacao' | 'Lente' | 'LenteContato' | 'Outro' | 'Servico' | 'Tratamento'
    categoria: string | null
    marca: string | null

    preco_custo: number | null
    preco_venda: number
    margem_lucro: number | null

    estoque_atual: number
    estoque_minimo: number
    gerencia_estoque: boolean

    ncm: string | null
    cest: string | null
    cfop: string | null
    unidade_medida: string | null
    origem_mercadoria: number | null
    supplier_id: number | null

    detalhes: Json
    tem_grade: boolean
  },

  Insert: {
    id?: number
    store_id: number
    tenant_id?: string | null

    nome: string
    tipo_produto: 'Armacao' | 'Lente' | 'LenteContato' | 'Outro' | 'Servico' | 'Tratamento'
    categoria?: string | null
    marca?: string | null

    codigo_barras?: string | null
    referencia?: string | null

    preco_custo?: number | null
    preco_venda: number
    margem_lucro?: number | null

    estoque_atual?: number
    estoque_minimo?: number
    gerencia_estoque?: boolean

    ncm?: string | null
    cest?: string | null
    cfop?: string | null
    unidade_medida?: string | null
    origem_mercadoria?: number | null
    supplier_id?: number | null

    detalhes?: Json
    tem_grade?: boolean

    created_at?: string
  },

  Update: {
    id?: number
    [key: string]: any
  }
}

      product_variants: {
        Row: {
          id: number
          product_id: number
          store_id: number
          
          nome_variante: string | null
          codigo_barras_especifico: string | null
          
          esferico: number | null
          cilindrico: number | null
          eixo: number | null
          adicao: number | null
          curva_base: number | null
          
          estoque_atual: number
          localizacao: string | null

          // NOVOS CAMPOS PARA SOBRAS
          diametro: number | null
          olho: string | null
          is_sobra: boolean | null
        }
        Insert: {
          id?: number
          product_id: number
          store_id: number
          esferico?: number | null
          cilindrico?: number | null
          estoque_atual?: number
          
          // NOVOS CAMPOS PARA SOBRAS
          diametro?: number | null
          olho?: string | null
          is_sobra?: boolean | null
          
          [key: string]: any
        }
        Update: {
          id?: number
          [key: string]: any
        }
      }

      stock_movements: {
        Row: {
          id: number
          store_id: number
          tenant_id: string | null
          created_at: string
          
          product_id: number | null
          variant_id: number | null
          
          tipo: 'Entrada' | 'Saida' | 'Perda' | 'Ajuste' | 'Devolucao' | 'Brinde'
          quantidade: number
          motivo: string | null
          custo_unitario_momento: number | null
          registrado_por_id: string | null

          // NOVOS CAMPOS DE RASTREIO
          related_venda_id: number | null
          related_os_id: number | null
        }
        Insert: {
          id?: number
          store_id: number
          tipo: string
          quantidade: number
          
          // NOVOS CAMPOS
          related_venda_id?: number | null
          related_os_id?: number | null

          [key: string]: any
        }
        Update: {
          // ...
        }
      }

      oftalmologistas: {
        Row: {
          id: number
          nome_completo: string
          crm: string | null
          clinica: string | null
          telefone: string | null
          email: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }

      // --- VENDAS & FINANCEIRO ---

      vendas: {
        Row: {
          id: number
          store_id: number
          customer_id: number
          employee_id: number | null
          status: 'Em Aberto' | 'Fechada' | 'Cancelada'
          valor_total: number
          valor_desconto: number
          valor_final: number
          valor_restante: number
          financiamento_id: number | null
          created_at: string
        }
        Insert: {
          id?: number
          store_id: number
          customer_id: number
          employee_id?: number | null
          status?: 'Em Aberto' | 'Fechada' | 'Cancelada'
          valor_total?: number
          valor_desconto?: number
          valor_final?: number
          financiamento_id?: number | null
          tenant_id?: string
          created_by_user_id?: string
        }
        Update: {
          status?: string
          financiamento_id?: number | null
          valor_desconto?: number
          // ...
        }
      }

      venda_itens: {
        Row: {
          id: number
          venda_id: number
          store_id: number
          tenant_id: string | null
          
          product_id: number | null
          variant_id: number | null
          
          item_tipo: string | null 
          descricao: string | null
          
          quantidade: number
          valor_unitario: number
          valor_total_item: number
          
          detalhes_avulsos: Json | null
        }
        Insert: {
          venda_id: number
          store_id?: number
          tenant_id?: string
          product_id?: number | null
          variant_id?: number | null
          item_tipo?: string
          descricao?: string
          quantidade: number
          valor_unitario: number
          valor_total_item: number
          detalhes_avulsos?: Json | null
        }
        Update: {
          // ...
        }
      }

      pagamentos: {
        Row: {
          id: number
          venda_id: number
          valor_pago: number
          forma_pagamento: string
          parcelas: number
          data_pagamento: string
          obs: string | null
          created_at: string
          receipt_printed_at: string | null
        }
        Insert: {
          venda_id: number
          valor_pago: number
          forma_pagamento: string
          parcelas?: number
          data_pagamento?: string
          obs?: string | null
          tenant_id?: string
          store_id?: number
          created_by_user_id?: string
          receipt_printed_at?: string
        }
        Update: {
          // ...
        }
      }

      financiamento_loja: {
        Row: {
          id: number
          venda_id: number
          customer_id: number
          valor_total_financiado: number
          valor_total: number
          quantidade_parcelas: number
          data_inicio: string
          obs: string | null
          created_at: string
          receipt_printed_at?: string
        }
        Insert: {
          venda_id: number
          customer_id: number
          valor_total_financiado: number
          quantidade_parcelas: number
          data_inicio: string
          obs?: string | null
          tenant_id?: string
          store_id?: number
          employee_id?: number
          created_by_user_id?: string
        }
        Update: {
          // ...
        }
      }

      financiamento_parcelas: {
        Row: {
          id: number
          financiamento_id: number
          numero_parcela: number
          data_vencimento: string
          valor_parcela: number
          status: string
          venda_id: number
          customer_id: number
          store_id: number
          data_pagamento: string | null
        }
        Insert: {
          financiamento_id: number
          numero_parcela: number
          data_vencimento: string
          valor_parcela: number
          status?: string
          tenant_id?: string
          store_id?: number
          customer_id?: number
        }
        Update: {
          // ...
        }
      }

      service_orders: {
        Row: {
          id: number
          venda_id: number
          created_at: string
          
          receita_longe_od_esferico: string | null
          receita_longe_od_cilindrico: string | null
          receita_longe_od_eixo: string | null
          receita_longe_oe_esferico: string | null
          receita_longe_oe_cilindrico: string | null
          receita_longe_oe_eixo: string | null
          receita_perto_od_esferico: string | null
          receita_perto_od_cilindrico: string | null
          receita_perto_od_eixo: string | null
          receita_perto_oe_esferico: string | null
          receita_perto_oe_cilindrico: string | null
          receita_perto_oe_eixo: string | null
          receita_adicao: string | null
          
          medida_dnp_od: string | null
          medida_dnp_oe: string | null
          medida_altura_od: string | null
          medida_altura_oe: string | null
          medida_horizontal: string | null
          medida_vertical: string | null
          medida_diagonal: string | null
          medida_ponte: string | null
          medida_diametro: string | null

          lab_nome: string | null
          lab_pedido_por_id: number | null
          dt_pedido_em: string | null
          dt_lente_chegou: string | null
          dt_montado_em: string | null
          dt_entregue_em: string | null
          dt_prometido_para: string | null
          obs_os: string | null
          protocolo_fisico: string | null
          
          dependente_id: number | null
          oftalmologista_id: number | null
        }
        Insert: {
          store_id: number
          venda_id: number
          customer_id: number
          tenant_id?: string
          [key: string]: any 
        }
        Update: {
           [key: string]: any 
        }
      }
      
      venda_itens_os_links: {
        Row: {
            id: number
            service_order_id: number
            venda_item_id: number
            uso_na_os: string
        }
        Insert: {
            service_order_id: number
            venda_item_id: number
            uso_na_os: string
            tenant_id?: string
            store_id?: number
        }
        Update: {}
      }

      cobranca_historico: {
        Row: {
          id: number
          created_at: string
          tenant_id: string
          store_id: number
          customer_id: number
          venda_id: number | null
          tipo_contato: string
          resumo_conversa: string
          proxima_acao: string | null
          registrado_por_id: string
        }
        Insert: {
          id?: number
          created_at?: string
          tenant_id: string
          store_id: number
          customer_id: number
          venda_id?: number | null
          tipo_contato: string
          resumo_conversa: string
          proxima_acao?: string | null
          registrado_por_id: string
        }
        Update: {
          id?: number
          resumo_conversa?: string
          proxima_acao?: string | null
        }
      }

      caixa_diario: {
        Row: {
          id: number
          created_at: string
          tenant_id: string
          store_id: number
          aberto_por_id: string
          fechado_por_id: string | null
          data_abertura: string
          data_fechamento: string | null
          saldo_inicial: number
          saldo_final: number | null
          quebra_caixa: number | null
          status: 'Aberto' | 'Fechado'
          obs: string | null
        }
        Insert: {
          id?: number
          created_at?: string
          tenant_id?: string
          store_id: number
          aberto_por_id?: string
          fechado_por_id?: string | null
          data_abertura?: string
          data_fechamento?: string | null
          saldo_inicial: number
          saldo_final?: number | null
          quebra_caixa?: number | null
          status?: 'Aberto' | 'Fechado'
          obs?: string | null
        }
        Update: {
          id?: number
          saldo_final?: number | null
          data_fechamento?: string | null
          status?: 'Aberto' | 'Fechado'
          quebra_caixa?: number | null
          // ...
        }
      }

      caixa_movimentacoes: {
        Row: {
          id: number
          created_at: string
          tenant_id: string
          store_id: number
          caixa_id: number
          usuario_id: string
          tipo: 'Entrada' | 'Saida'
          valor: number
          descricao: string
          categoria: string | null
          forma_pagamento: string | null
        }
        Insert: {
          id?: number
          created_at?: string
          tenant_id?: string
          store_id: number
          caixa_id: number
          usuario_id?: string
          tipo: 'Entrada' | 'Saida'
          valor: number
          descricao: string
          categoria?: string | null
          forma_pagamento?: string | null
        }
        Update: {
          // ...
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      update_venda_financeiro: {
        Args: { p_venda_id: number }
        Returns: void
      }
      increment_stock: {
        Args: { p_product_id: number, p_quantity: number, p_new_cost: number | null }
        Returns: void
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}