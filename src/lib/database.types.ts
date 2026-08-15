// ARQUIVO: src/lib/database.types.ts

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

      nfc_trays: {
        Row: {
          id: string
          store_id: number
          current_service_order_id: number | null
          status: 'active' | 'inactive' | 'lost'
          created_by_user_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: number
          current_service_order_id?: number | null
          status?: 'active' | 'inactive' | 'lost'
          created_by_user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: number
          current_service_order_id?: number | null
          status?: 'active' | 'inactive' | 'lost'
          created_by_user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      nfc_tray_events: {
        Row: {
          id: number
          tray_id: string
          store_id: number
          service_order_id: number | null
          action: 'TRAY_CREATED' | 'OS_LINKED' | 'LENS_RECEIVED' | 'ASSEMBLY_COMPLETED' | 'TRAY_UNLINKED'
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: number
          tray_id: string
          store_id: number
          service_order_id?: number | null
          action: 'TRAY_CREATED' | 'OS_LINKED' | 'LENS_RECEIVED' | 'ASSEMBLY_COMPLETED' | 'TRAY_UNLINKED'
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: number
          tray_id?: string
          store_id?: number
          service_order_id?: number | null
          action?: 'TRAY_CREATED' | 'OS_LINKED' | 'LENS_RECEIVED' | 'ASSEMBLY_COMPLETED' | 'TRAY_UNLINKED'
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }

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

      tower_device_activations: {
        Row: {
          id: string
          tenant_id: string
          store_id: number
          target_asset_id: string | null
          token_hash: string
          fallback_code_hash: string
          status: 'pending' | 'consumed' | 'revoked'
          expires_at: string
          created_by: string | null
          consumed_at: string | null
          revoked_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          store_id: number
          target_asset_id?: string | null
          token_hash: string
          fallback_code_hash: string
          status?: 'pending' | 'consumed' | 'revoked'
          expires_at: string
          created_by?: string | null
          consumed_at?: string | null
          revoked_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          store_id?: number
          target_asset_id?: string | null
          token_hash?: string
          fallback_code_hash?: string
          status?: 'pending' | 'consumed' | 'revoked'
          expires_at?: string
          created_by?: string | null
          consumed_at?: string | null
          revoked_at?: string | null
          created_at?: string
        }
        Relationships: []
      }

      tower_devices: {
        Row: {
          id: string
          asset_id: string | null
          tenant_id: string
          store_id: number
          activation_id: string
          credential_hash: string
          device_label: string
          app_version: string | null
          status: 'active' | 'revoked'
          paired_at: string
          revoked_at: string | null
          last_seen_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          asset_id?: string | null
          tenant_id: string
          store_id: number
          activation_id: string
          credential_hash: string
          device_label?: string
          app_version?: string | null
          status?: 'active' | 'revoked'
          paired_at?: string
          revoked_at?: string | null
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          asset_id?: string | null
          tenant_id?: string
          store_id?: number
          activation_id?: string
          credential_hash?: string
          device_label?: string
          app_version?: string | null
          status?: 'active' | 'revoked'
          paired_at?: string
          revoked_at?: string | null
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      tower_asset_sequences: {
        Row: { sequence_year: number; last_value: number; updated_at: string }
        Insert: { sequence_year: number; last_value?: number; updated_at?: string }
        Update: { sequence_year?: number; last_value?: number; updated_at?: string }
        Relationships: []
      }

      tower_activation_rate_limits: {
        Row: {
          key_hash: string
          scope: string
          attempt_count: number
          reset_at: string
          updated_at: string
        }
        Insert: {
          key_hash: string
          scope: string
          attempt_count?: number
          reset_at: string
          updated_at?: string
        }
        Update: {
          key_hash?: string
          scope?: string
          attempt_count?: number
          reset_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      tower_asset_batches: {
        Row: {
          id: string
          batch_code: string
          batch_name: string
          sequence_year: number
          quantity: number
          status: 'generated' | 'printed' | 'closed'
          created_by: string | null
          printed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          batch_code: string
          batch_name: string
          sequence_year: number
          quantity: number
          status?: 'generated' | 'printed' | 'closed'
          created_by?: string | null
          printed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['tower_asset_batches']['Insert']>
        Relationships: []
      }

      tower_assets: {
        Row: {
          id: string
          public_code: string
          batch_id: string
          serial_number: string | null
          status: 'generated' | 'printed' | 'prepared' | 'in_stock' | 'assigned' | 'maintenance' | 'retired'
          enrollment_credential_hash: string | null
          enrolled_device_label: string | null
          enrolled_app_version: string | null
          enrolled_at: string | null
          current_store_id: number | null
          label_applied_at: string | null
          retired_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          public_code: string
          batch_id: string
          serial_number?: string | null
          status?: 'generated' | 'printed' | 'prepared' | 'in_stock' | 'assigned' | 'maintenance' | 'retired'
          enrollment_credential_hash?: string | null
          enrolled_device_label?: string | null
          enrolled_app_version?: string | null
          enrolled_at?: string | null
          current_store_id?: number | null
          label_applied_at?: string | null
          retired_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['tower_assets']['Insert']>
        Relationships: []
      }

      tower_asset_enrollments: {
        Row: {
          id: string
          asset_id: string
          token_hash: string
          fallback_code_hash: string
          status: 'pending' | 'consumed' | 'revoked'
          expires_at: string
          created_by: string | null
          consumed_at: string | null
          revoked_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          token_hash: string
          fallback_code_hash: string
          status?: 'pending' | 'consumed' | 'revoked'
          expires_at: string
          created_by?: string | null
          consumed_at?: string | null
          revoked_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['tower_asset_enrollments']['Insert']>
        Relationships: []
      }

      tower_store_admin_pins: {
        Row: {
          store_id: number
          pin_hash: string
          must_change: boolean
          failed_attempts: number
          locked_until: string | null
          last_verified_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          store_id: number
          pin_hash: string
          must_change?: boolean
          failed_attempts?: number
          locked_until?: string | null
          last_verified_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          store_id?: number
          pin_hash?: string
          must_change?: boolean
          failed_attempts?: number
          locked_until?: string | null
          last_verified_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      tower_store_full_access: {
        Row: {
          store_id: number
          admin_user_id: string | null
          admin_name: string
          admin_email: string
          status: 'pending' | 'active'
          granted_by: string | null
          granted_at: string
          invitation_sent_at: string | null
          updated_at: string
        }
        Insert: {
          store_id: number
          admin_user_id?: string | null
          admin_name: string
          admin_email: string
          status?: 'pending' | 'active'
          granted_by?: string | null
          granted_at?: string
          invitation_sent_at?: string | null
          updated_at?: string
        }
        Update: {
          store_id?: number
          admin_user_id?: string | null
          admin_name?: string
          admin_email?: string
          status?: 'pending' | 'active'
          granted_by?: string | null
          granted_at?: string
          invitation_sent_at?: string | null
          updated_at?: string
        }
        Relationships: []
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
          comm_rate_guaranteed: number | null
          comm_rate_store_credit: number | null
          comm_rate_store_total: number | null
          comm_rate_received: number | null
          comm_rate_profit: number | null
          comm_tiers_json: Json | null
        }
        Insert: {
          id?: number
          store_id: number
          full_name: string
          pin: string
          is_active?: boolean
          role?: 'vendedor' | 'gerente' | 'tecnico'
          created_at?: string
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
          certificate_thumbprint: string | null
          certificate_valid_until: string | null
          // Campos adicionais de perfil da loja
          razao_social: string | null
          cnpj: string | null
          inscricao_estadual: string | null
          whatsapp: string | null
          phone: string | null
          email: string | null
          website: string | null
          cep: string | null
          street: string | null
          number: string | null
          neighborhood: string | null
          city: string | null
          state: string | null
          nfce_serie: number | null
          nfe_serie: number | null
          codigo_municipio_ibge: string | null
          regime_tributario: string | null
          contador_email: string | null
          rt_cnpj: string | null
          rt_contato: string | null
          rt_email: string | null
          rt_fone: string | null
          csrt_id_homologation: string | null
          csrt_token_homologation: string | null
          csrt_id_production: string | null
          csrt_token_production: string | null
        }
        Insert: {
          id?: number
          name: string
          tenant_id: string
          settings?: Json | null
          certificate_thumbprint?: string | null
          certificate_valid_until?: string | null
          razao_social?: string | null
          cnpj?: string | null
          inscricao_estadual?: string | null
          whatsapp?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          cep?: string | null
          street?: string | null
          number?: string | null
          neighborhood?: string | null
          city?: string | null
          state?: string | null
          nfce_serie?: number | null
          nfe_serie?: number | null
          codigo_municipio_ibge?: string | null
          regime_tributario?: string | null
          contador_email?: string | null
          rt_cnpj?: string | null
          rt_contato?: string | null
          rt_email?: string | null
          rt_fone?: string | null
          csrt_id_homologation?: string | null
          csrt_token_homologation?: string | null
          csrt_id_production?: string | null
          csrt_token_production?: string | null
        }
        Update: {
          id?: number
          name?: string
          tenant_id?: string
          settings?: Json | null
          certificate_thumbprint?: string | null
          certificate_valid_until?: string | null
          razao_social?: string | null
          cnpj?: string | null
          inscricao_estadual?: string | null
          whatsapp?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          cep?: string | null
          street?: string | null
          number?: string | null
          neighborhood?: string | null
          city?: string | null
          state?: string | null
          nfce_serie?: number | null
          nfe_serie?: number | null
          codigo_municipio_ibge?: string | null
          regime_tributario?: string | null
          contador_email?: string | null
          rt_cnpj?: string | null
          rt_contato?: string | null
          rt_email?: string | null
          rt_fone?: string | null
          csrt_id_homologation?: string | null
          csrt_token_homologation?: string | null
          csrt_id_production?: string | null
          csrt_token_production?: string | null
        }
      }

      store_local_protocol_sequences: {
        Row: {
          store_id: number
          next_number: number
          updated_at: string
        }
        Insert: {
          store_id: number
          next_number: number
          updated_at?: string
        }
        Update: {
          store_id?: number
          next_number?: number
          updated_at?: string
        }
        Relationships: []
      }

      whatsapp_store_channels: {
        Row: {
          id: number
          tenant_id: string
          store_id: number
          provider: 'evolution'
          instance_key: string
          phone_number: string
          is_active: boolean
          connection_status: 'unknown' | 'connecting' | 'connected' | 'disconnected'
          last_connection_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          tenant_id: string
          store_id: number
          provider?: 'evolution'
          instance_key: string
          phone_number: string
          is_active?: boolean
          connection_status?: 'unknown' | 'connecting' | 'connected' | 'disconnected'
          last_connection_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          instance_key?: string
          phone_number?: string
          is_active?: boolean
          connection_status?: 'unknown' | 'connecting' | 'connected' | 'disconnected'
          last_connection_at?: string | null
          updated_at?: string
        }
      }

      whatsapp_inbound_messages: {
        Row: {
          id: number
          tenant_id: string
          store_id: number
          channel_id: number
          provider_message_id: string
          remote_phone: string
          message_text: string | null
          payload: Json | null
          status: 'received' | 'ignored' | 'processed' | 'failed'
          created_at: string
        }
        Insert: {
          id?: number
          tenant_id: string
          store_id: number
          channel_id: number
          provider_message_id: string
          remote_phone: string
          message_text?: string | null
          payload?: Json | null
          status?: 'received' | 'ignored' | 'processed' | 'failed'
          created_at?: string
        }
        Update: {
          status?: 'received' | 'ignored' | 'processed' | 'failed'
          payload?: Json | null
        }
      }

      whatsapp_ai_logs: {
        Row: {
          id: string
          store_id: number
          tenant_id: string
          inbound_message_id: number | null
          provider: string
          model_name: string
          latency_ms: number | null
          intent: string | null
          confidence: number | null
          is_success: boolean
          error_message: string | null
          raw_request: Json | null
          raw_response: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          store_id: number
          tenant_id: string
          inbound_message_id?: number | null
          provider: string
          model_name: string
          latency_ms?: number | null
          intent?: string | null
          confidence?: number | null
          is_success?: boolean
          error_message?: string | null
          raw_request?: Json | null
          raw_response?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: number
          tenant_id?: string
          inbound_message_id?: number | null
          provider?: string
          model_name?: string
          latency_ms?: number | null
          intent?: string | null
          confidence?: number | null
          is_success?: boolean
          error_message?: string | null
          raw_request?: Json | null
          raw_response?: Json | null
          created_at?: string
        }
        Relationships: []
      }

      whatsapp_outbound_messages: {
        Row: {
          id: number
          tenant_id: string
          store_id: number
          channel_id: number
          inbound_message_id: number | null
          provider_message_id: string | null
          remote_phone: string
          message_text: string
          message_type: string
          status: 'pending' | 'sent' | 'failed' | 'cancelled'
          payload: Json | null
          error_message: string | null
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: number
          tenant_id: string
          store_id: number
          channel_id: number
          inbound_message_id?: number | null
          provider_message_id?: string | null
          remote_phone: string
          message_text: string
          message_type?: string
          status?: 'pending' | 'sent' | 'failed' | 'cancelled'
          payload?: Json | null
          error_message?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Update: {
          provider_message_id?: string | null
          status?: 'pending' | 'sent' | 'failed' | 'cancelled'
          payload?: Json | null
          error_message?: string | null
          sent_at?: string | null
        }
      }

      whatsapp_status_publications: {
        Row: {
          id: number
          tenant_id: string
          store_id: number
          channel_id: number
          provider_message_id: string
          message_text: string | null
          media_kind: string | null
          payload: Json | null
          published_at: string
          expires_at: string
          created_at: string
          context_category: string | null
          context_description: string | null
          response_guidance: string | null
          auto_reply_enabled: boolean
          contextualized_at: string | null
          contextualized_by_user_id: string | null
        }
        Insert: {
          id?: number
          tenant_id: string
          store_id: number
          channel_id: number
          provider_message_id: string
          message_text?: string | null
          media_kind?: string | null
          payload?: Json | null
          published_at?: string
          expires_at?: string
          created_at?: string
          context_category?: string | null
          context_description?: string | null
          response_guidance?: string | null
          auto_reply_enabled?: boolean
          contextualized_at?: string | null
          contextualized_by_user_id?: string | null
        }
        Update: {
          message_text?: string | null
          media_kind?: string | null
          payload?: Json | null
          published_at?: string
          expires_at?: string
          context_category?: string | null
          context_description?: string | null
          response_guidance?: string | null
          auto_reply_enabled?: boolean
          contextualized_at?: string | null
          contextualized_by_user_id?: string | null
        }
      }

      fiscal_invoices: {
        Row: {
          id: number
          organization_id: string
          work_order_id: number | null
          tipo_documento: string | null
          status: string | null
          environment: string | null
          payload_json: Json | null
          nuvemfiscal_uuid: string | null
          chave_acesso: string | null
          numero: string | null
          serie: string | null
          xml_url: string | null
          pdf_url: string | null
          error_message: string | null
          created_at: string
          direction: string | null
          data_emissao: string | null
          emitente_nome: string | null
          emitente_cnpj: string | null
          destinatario_nome: string | null
          destinatario_cnpj: string | null
          motivo_rejeicao: string | null
          xml_content: string | null
          valor_total: number | null
        }
        Insert: {
          id?: number
          organization_id: string
          work_order_id?: number | null
          tipo_documento?: string | null
          status?: string | null
          environment?: string | null
          payload_json?: Json | null
          nuvemfiscal_uuid?: string | null
          chave_acesso?: string | null
          numero?: string | null
          serie?: string | null
          xml_url?: string | null
          pdf_url?: string | null
          error_message?: string | null
          created_at?: string
          direction?: string | null
          data_emissao?: string | null
          emitente_nome?: string | null
          emitente_cnpj?: string | null
          destinatario_nome?: string | null
          destinatario_cnpj?: string | null
          motivo_rejeicao?: string | null
          xml_content?: string | null
          valor_total?: number | null
        }
        Update: {
          id?: number
          organization_id?: string
          work_order_id?: number | null
          tipo_documento?: string | null
          status?: string | null
          environment?: string | null
          payload_json?: Json | null
          nuvemfiscal_uuid?: string | null
          chave_acesso?: string | null
          numero?: string | null
          serie?: string | null
          xml_url?: string | null
          pdf_url?: string | null
          error_message?: string | null
          created_at?: string
          direction?: string | null
          data_emissao?: string | null
          emitente_nome?: string | null
          emitente_cnpj?: string | null
          destinatario_nome?: string | null
          destinatario_cnpj?: string | null
          motivo_rejeicao?: string | null
          xml_content?: string | null
          valor_total?: number | null
        }
        Relationships: []
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
          telefone: string | null
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
          telefone?: string | null
          cidade?: string | null
          uf?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          nome_fantasia?: string
          [key: string]: any
        }
      }

      // --- FINANCEIRO (CONTAS A PAGAR & RECEBER) ---

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
          created_by_user_id: string | null
          created_at: string
          updated_at: string
          // Recorrência e parcelamento
          is_recurring: boolean | null
          recurring_group_id: string | null
          installment_number: number | null
          installment_total: number | null
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
          created_by_user_id?: string | null
          created_at?: string
          updated_at?: string
          is_recurring?: boolean | null
          recurring_group_id?: string | null
          installment_number?: number | null
          installment_total?: number | null
        }
        Update: {
          [key: string]: any
        }
      }

      // --- NOVA TABELA: CONTAS A RECEBER ---
      contas_a_receber: {
        Row: {
          id: number
          tenant_id: string | null
          store_id: number
          pagamento_id: number
          data_prevista: string
          valor_bruto: number
          valor_taxa: number | null
          valor_liquido: number
          status: string
        }
        Insert: {
          id?: number
          tenant_id?: string | null
          store_id: number
          pagamento_id: number
          data_prevista: string
          valor_bruto: number
          valor_taxa?: number | null
          valor_liquido: number
          status?: string
        }
        Update: {
          [key: string]: any
        }
      }

      // --- IMPORTAÇÃO ---
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
          [key: string]: any
        }
      }

      // --- CLIENTES & ASSISTÊNCIA ---

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
          codigo_municipio_ibge: string | null
          inscricao_estadual: string | null
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
          ranking: string
        }
        Insert: {
          id?: number
          store_id: number
          full_name: string
          cpf?: string | null
          codigo_municipio_ibge?: string | null
          inscricao_estadual?: string | null
          is_spc?: boolean | null
          tenant_id?: string
          [key: string]: any
          ranking?: string
        }
        Update: {
          id?: number
          full_name?: string
          [key: string]: any
          ranking?: string
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
          [key: string]: any
        }
      }

      // --- NOVAS TABELAS DE ASSISTÊNCIA ---
      tower_heatmap_sessions: {
        Row: {
          id: string
          tenant_id: string
          store_id: number
          tower_session_id: string | null
          customer_id: number | null
          optical_evaluation_id: number | null
          created_by_user_id: string | null
          status: 'created' | 'running' | 'completed' | 'cancelled' | 'failed'
          algorithm_version: string
          target_plan_version: string
          result_summary: Json | null
          target_samples: Json | null
          started_at: string | null
          completed_at: string | null
          cancelled_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          store_id: number
          tower_session_id?: string | null
          customer_id?: number | null
          optical_evaluation_id?: number | null
          created_by_user_id?: string | null
          status?: 'created' | 'running' | 'completed' | 'cancelled' | 'failed'
          algorithm_version: string
          target_plan_version: string
          result_summary?: Json | null
          target_samples?: Json | null
          started_at?: string | null
          completed_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          store_id?: number
          tower_session_id?: string | null
          customer_id?: number | null
          optical_evaluation_id?: number | null
          created_by_user_id?: string | null
          status?: 'created' | 'running' | 'completed' | 'cancelled' | 'failed'
          algorithm_version?: string
          target_plan_version?: string
          result_summary?: Json | null
          target_samples?: Json | null
          started_at?: string | null
          completed_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      tower_measurement_results: {
        Row: {
          id: string
          tenant_id: string
          store_id: number
          tower_session_id: string
          customer_id: number | null
          optical_evaluation_id: number | null
          created_by_user_id: string | null
          version: number
          lens_mode: 'multifocal' | 'bifocal'
          reference_mm: number
          front_measurements: Json
          profile_measurements: Json
          attention_codes: Json
          algorithm_version: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          store_id: number
          tower_session_id: string
          customer_id?: number | null
          optical_evaluation_id?: number | null
          created_by_user_id?: string | null
          version: number
          lens_mode: 'multifocal' | 'bifocal'
          reference_mm: number
          front_measurements: Json
          profile_measurements: Json
          attention_codes?: Json
          algorithm_version: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          store_id?: number
          tower_session_id?: string
          customer_id?: number | null
          optical_evaluation_id?: number | null
          created_by_user_id?: string | null
          version?: number
          lens_mode?: 'multifocal' | 'bifocal'
          reference_mm?: number
          front_measurements?: Json
          profile_measurements?: Json
          attention_codes?: Json
          algorithm_version?: string
          created_at?: string
        }
        Relationships: []
      }

      tower_sessions: {
        Row: {
          id: string
          tenant_id: string
          store_id: number
          customer_id: number | null
          optical_evaluation_id: number | null
          prescription_snapshot: Json | null
          created_by_user_id: string | null
          status: 'active' | 'completed' | 'discarded' | 'expired'
          current_experience: 'look' | 'visagismo' | 'campo_visual' | 'medidas' | 'thickness' | null
          started_at: string
          completed_at: string | null
          discarded_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          store_id: number
          customer_id?: number | null
          optical_evaluation_id?: number | null
          prescription_snapshot?: Json | null
          created_by_user_id?: string | null
          status?: 'active' | 'completed' | 'discarded' | 'expired'
          current_experience?: 'look' | 'visagismo' | 'campo_visual' | 'medidas' | 'thickness' | null
          started_at?: string
          completed_at?: string | null
          discarded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          store_id?: number
          customer_id?: number | null
          optical_evaluation_id?: number | null
          prescription_snapshot?: Json | null
          created_by_user_id?: string | null
          status?: 'active' | 'completed' | 'discarded' | 'expired'
          current_experience?: 'look' | 'visagismo' | 'campo_visual' | 'medidas' | 'thickness' | null
          started_at?: string
          completed_at?: string | null
          discarded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      optical_evaluations: {
        Row: {
          id: number
          created_at: string
          updated_at: string
          tenant_id: string
          store_id: number
          evaluated_customer_id: number | null
          evaluated_dependente_id: number | null
          responsible_customer_id: number | null
          imported_by_user_id: string | null
          source_system: 'manual' | 'ivision'
          status: 'rascunho' | 'concluida' | 'importada' | 'exportada'
          parse_status: 'success' | 'partial' | 'failed'
          source_document_url: string | null
          source_document_host: string | null
          source_os_number: string | null
          source_exam_type: string | null
          source_exam_datetime: string | null
          patient_name_raw: string | null
          evaluated_name_snapshot: string | null
          responsible_name_snapshot: string | null
          relationship_snapshot: string | null
          age_years: number | null
          estilo_vida_uso_computador_horas: number | null
          estilo_vida_dirigir_horas: number | null
          estilo_vida_leitura_horas: number | null
          estilo_vida_uso_celular_horas: number | null
          estilo_vida_exposicao_sol_horas: number | null
          estilo_vida_ambiente_interno_horas: number | null
          estilo_vida_ambiente_externo_horas: number | null
          estilo_vida_assistir_tv_horas: number | null
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
          recommended_lens_name: string | null
          commercial_recommendation_raw: string | null
          extracted_text: string | null
          raw_payload_json: Json | null
          parse_warning: string | null
          document_hash: string | null
          exported_service_order_id: number | null
          unlinked_at: string | null
          unlinked_by_employee_id: number | null
          employee_id: number | null
          outcome_status: 'venda_fechada' | 'cliente_pesquisa' | 'perdido_preco' | 'perdido_produto' | 'perdido_prazo' | null
          panic_reason: string | null
          recommended_items: Json | null
          exported_venda_id: number | null
        }
        Insert: {
          id?: number
          created_at?: string
          updated_at?: string
          tenant_id: string
          store_id: number
          evaluated_customer_id?: number | null
          evaluated_dependente_id?: number | null
          responsible_customer_id?: number | null
          imported_by_user_id?: string | null
          source_system?: 'manual' | 'ivision'
          status?: 'rascunho' | 'em_andamento' | 'pendente' | 'concluida' | 'importada' | 'exportada'
          parse_status?: 'success' | 'partial' | 'failed'
          outcome_status?: 'venda_fechada' | 'cliente_pesquisa' | 'perdido_preco' | 'perdido_produto' | 'perdido_prazo' | null
          panic_reason?: string | null
          recommended_items?: Json | null
          exported_venda_id?: number | null
          source_document_url?: string | null
          source_document_host?: string | null
          source_os_number?: string | null
          source_exam_type?: string | null
          source_exam_datetime?: string | null
          patient_name_raw?: string | null
          evaluated_name_snapshot?: string | null
          responsible_name_snapshot?: string | null
          relationship_snapshot?: string | null
          age_years?: number | null
          estilo_vida_uso_computador_horas?: number | null
          estilo_vida_dirigir_horas?: number | null
          estilo_vida_leitura_horas?: number | null
          estilo_vida_uso_celular_horas?: number | null
          estilo_vida_exposicao_sol_horas?: number | null
          estilo_vida_ambiente_interno_horas?: number | null
          estilo_vida_ambiente_externo_horas?: number | null
          estilo_vida_assistir_tv_horas?: number | null
          receita_longe_od_esferico?: string | null
          receita_longe_od_cilindrico?: string | null
          receita_longe_od_eixo?: string | null
          receita_longe_oe_esferico?: string | null
          receita_longe_oe_cilindrico?: string | null
          receita_longe_oe_eixo?: string | null
          receita_perto_od_esferico?: string | null
          receita_perto_od_cilindrico?: string | null
          receita_perto_od_eixo?: string | null
          receita_perto_oe_esferico?: string | null
          receita_perto_oe_cilindrico?: string | null
          receita_perto_oe_eixo?: string | null
          receita_adicao?: string | null
          medida_dnp_od?: string | null
          medida_dnp_oe?: string | null
          medida_altura_od?: string | null
          medida_altura_oe?: string | null
          recommended_lens_name?: string | null
          commercial_recommendation_raw?: string | null
          extracted_text?: string | null
          raw_payload_json?: Json | null
          parse_warning?: string | null
          document_hash?: string | null
          exported_service_order_id?: number | null
          unlinked_at?: string | null
          unlinked_by_employee_id?: number | null
          employee_id?: number | null
        }
        Update: {
          id?: number
          created_at?: string
          updated_at?: string
          tenant_id?: string
          store_id?: number
          evaluated_customer_id?: number | null
          evaluated_dependente_id?: number | null
          responsible_customer_id?: number | null
          imported_by_user_id?: string | null
          source_system?: 'manual' | 'ivision'
          status?: 'rascunho' | 'em_andamento' | 'pendente' | 'concluida' | 'importada' | 'exportada'
          parse_status?: 'success' | 'partial' | 'failed'
          outcome_status?: 'venda_fechada' | 'cliente_pesquisa' | 'perdido_preco' | 'perdido_produto' | 'perdido_prazo' | null
          panic_reason?: string | null
          recommended_items?: Json | null
          exported_venda_id?: number | null
          source_document_url?: string | null
          source_document_host?: string | null
          source_os_number?: string | null
          source_exam_type?: string | null
          source_exam_datetime?: string | null
          patient_name_raw?: string | null
          evaluated_name_snapshot?: string | null
          responsible_name_snapshot?: string | null
          relationship_snapshot?: string | null
          age_years?: number | null
          estilo_vida_uso_computador_horas?: number | null
          estilo_vida_dirigir_horas?: number | null
          estilo_vida_leitura_horas?: number | null
          estilo_vida_uso_celular_horas?: number | null
          estilo_vida_exposicao_sol_horas?: number | null
          estilo_vida_ambiente_interno_horas?: number | null
          estilo_vida_ambiente_externo_horas?: number | null
          estilo_vida_assistir_tv_horas?: number | null
          receita_longe_od_esferico?: string | null
          receita_longe_od_cilindrico?: string | null
          receita_longe_od_eixo?: string | null
          receita_longe_oe_esferico?: string | null
          receita_longe_oe_cilindrico?: string | null
          receita_longe_oe_eixo?: string | null
          receita_perto_od_esferico?: string | null
          receita_perto_od_cilindrico?: string | null
          receita_perto_od_eixo?: string | null
          receita_perto_oe_esferico?: string | null
          receita_perto_oe_cilindrico?: string | null
          receita_perto_oe_eixo?: string | null
          receita_adicao?: string | null
          medida_dnp_od?: string | null
          medida_dnp_oe?: string | null
          medida_altura_od?: string | null
          medida_altura_oe?: string | null
          recommended_lens_name?: string | null
          commercial_recommendation_raw?: string | null
          extracted_text?: string | null
          raw_payload_json?: Json | null
          parse_warning?: string | null
          document_hash?: string | null
          exported_service_order_id?: number | null
          unlinked_at?: string | null
          unlinked_by_employee_id?: number | null
          employee_id?: number | null
        }
      }

      assistance_tickets: {
        Row: {
          id: number
          tenant_id: string | null
          store_id: number
          tracking_token: string // UUID
          customer_id: number
          venda_original_id: number | null
          product_id: number | null
          product_descricao: string
          contato_usado: string | null
          modalidade: string
          status: string
          status_publico: string | null
          descricao_defeito: string | null
          fotos_urls: Json | null
          dt_abertura: string | null
          dt_solicitacao_peca: string | null
          dt_chegada_peca: string | null
          dt_troca_cliente: string | null
          dt_envio_fornecedor: string | null
          dt_conclusao: string | null
          rastreio_entrada: string | null
          rastreio_saida: string | null
          created_by_user_id: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          tenant_id?: string | null
          store_id: number
          tracking_token?: string
          customer_id: number
          venda_original_id?: number | null
          product_id?: number | null
          product_descricao: string
          contato_usado?: string | null
          modalidade: string
          status: string
          status_publico?: string | null
          descricao_defeito?: string | null
          fotos_urls?: Json | null
          created_by_user_id?: string | null
          [key: string]: any
        }
        Update: {
          [key: string]: any
        }
      }

      assistance_timeline: {
        Row: {
          id: number
          ticket_id: number
          tenant_id: string | null
          tipo: string
          mensagem: string
          usuario_id: string | null
          created_at: string
        }
        Insert: {
          id?: number
          ticket_id: number
          tenant_id?: string | null
          tipo: string
          mensagem: string
          usuario_id?: string | null
          created_at?: string
        }
        Update: {
          [key: string]: any
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
          employee_id: number | null
          venda_id: number | null
          oftalmologista_id: number | null
          type: string
          period_ref: string | null
          commission_stage: string
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
          employee_id?: number | null
          venda_id?: number | null
          oftalmologista_id?: number | null
          type?: string
          period_ref?: string | null
          commission_stage?: string
          amount: number
          percentage?: number | null
          status?: string | null
          reversal_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          venda_id?: number | null
          oftalmologista_id?: number | null
          employee_id?: number | null
          type?: string
          period_ref?: string | null
          commission_stage?: string
          status?: string | null
          reversal_reason?: string | null
          updated_at?: string
          [key: string]: any
        }
      }

      // --- CATÁLOGO ---
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
        }
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
        }
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
          related_venda_id: number | null
          related_os_id: number | null
        }
        Insert: {
          id?: number
          store_id: number
          tipo: string
          quantidade: number
          related_venda_id?: number | null
          related_os_id?: number | null
          [key: string]: any
        }
        Update: {
          [key: string]: any
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
          comissao: number | null
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
          status: 'Em Aberto' | 'Fechada' | 'Cancelada' | 'Devolvida'
          valor_total: number
          valor_desconto: number
          valor_final: number
          valor_restante: number
          financiamento_id: number | null
          obs_geral: string | null
          nf_emitida: boolean
          is_historical_import: boolean
          import_source_system: string | null
          import_source_record_key: string | null
          import_batch_id: string | null
          historical_entry_amount: number
          created_at: string
        }
        Insert: {
          id?: number
          store_id: number
          customer_id: number
          employee_id?: number | null
          status?: 'Em Aberto' | 'Fechada' | 'Cancelada' | 'Devolvida'
          valor_total?: number
          valor_desconto?: number
          valor_final?: number
          financiamento_id?: number | null
          obs_geral?: string | null
          nf_emitida?: boolean
          is_historical_import?: boolean
          import_source_system?: string | null
          import_source_record_key?: string | null
          import_batch_id?: string | null
          historical_entry_amount?: number
          tenant_id?: string
          created_by_user_id?: string
        }
        Update: {
          status?: string
          financiamento_id?: number | null
          valor_desconto?: number
          is_historical_import?: boolean
          import_source_system?: string | null
          import_source_record_key?: string | null
          import_batch_id?: string | null
          historical_entry_amount?: number
          [key: string]: any
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
          [key: string]: any
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
          parcela_id?: number | null
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
          parcela_id?: number | null
        }
        Update: {
          [key: string]: any
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
          [key: string]: any
        }
      }

      installment_receipt_operations: {
        Row: {
          id: number
          tenant_id: string
          store_id: number
          financiamento_id: number
          venda_id: number
          customer_id: number | null
          origin_installment_id: number
          received_amount: number
          interest_amount: number
          payment_method: string
          strategy: string
          received_on: string
          received_by_employee_id: number | null
          created_by_user_id: string | null
          installments_before: Json
          installments_after: Json | null
          sale_before: Json
          sale_after: Json | null
          payments_created: Json
          affected_installment_count: number
          state: string
          failure_message: string | null
          transferred_amount: number
          destination_installment_id: number | null
          idempotency_key: string | null
          reversed_at: string | null
          reversed_by_employee_id: number | null
          reversed_by_user_id: string | null
          reversal_reason: string | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          tenant_id: string
          store_id: number
          financiamento_id: number
          venda_id: number
          customer_id?: number | null
          origin_installment_id: number
          received_amount: number
          interest_amount?: number
          payment_method: string
          strategy: string
          received_on: string
          received_by_employee_id?: number | null
          created_by_user_id?: string | null
          installments_before: Json
          installments_after?: Json | null
          sale_before: Json
          sale_after?: Json | null
          payments_created?: Json
          affected_installment_count?: number
          state?: string
          transferred_amount?: number
          destination_installment_id?: number | null
          idempotency_key?: string | null
        }
        Update: {
          [key: string]: any
        }
      }

      installment_receipt_idempotency: {
        Row: {
          idempotency_key: string
          tenant_id: string
          store_id: number
          installment_id: number
          request_payload: Json
          operation_id: number | null
          result_payload: Json | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          idempotency_key: string
          tenant_id: string
          store_id: number
          installment_id: number
          request_payload: Json
          operation_id?: number | null
          result_payload?: Json | null
        }
        Update: {
          [key: string]: any
        }
      }

      financiamento_parcelas: {
        Row: {
          id: number
          tenant_id: string | null
          store_id: number
          financiamento_id: number
          numero_parcela: number
          data_vencimento: string
          valor_parcela: number
          valor_pago: number | null
          valor_transferido_entrada: number
          valor_transferido_saida: number
          valor_renegociado_saida: number
          status: string
          customer_id: number | null
          data_pagamento: string | null
          obs: string | null
        }
        Insert: {
          tenant_id?: string | null
          store_id: number
          financiamento_id: number
          numero_parcela: number
          data_vencimento: string
          valor_parcela: number
          valor_pago?: number | null
          valor_transferido_entrada?: number
          valor_transferido_saida?: number
          valor_renegociado_saida?: number
          status?: string
          customer_id?: number | null
          data_pagamento?: string | null
          obs?: string | null
        }
        Update: {
          [key: string]: any
        }
      }

      service_orders: {
        Row: {
          id: number
          tenant_id: string
          store_id: number
          customer_id: number
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
          medida_diametro_od: string | null
          medida_diametro_oe: string | null
          medida_palpebra_od: string | null
          medida_palpebra_oe: string | null
          medida_tipo_lente: string | null
          foto_medicao_url: string | null
          token_lab: string | null
          lab_nome: string | null
          lab_pedido_por_id: number | null
          dt_pedido_em: string | null
          dt_lente_chegou: string | null
          dt_montado_em: string | null
          dt_entregue_em: string | null
          dt_prometido_para: string | null
          obs_os: string | null
          protocolo_fisico: string | null
          protocol_uniqueness_enforced: boolean
          dependente_id: number | null
          oftalmologista_id: number | null
          source_optical_evaluation_id: number | null
          armacao_com_cliente: boolean
          os_enviada_ao_lab: boolean
          lab_encerrada_em: string | null
          lab_encerrada_tipo: 'cancelamento' | 'abandono' | null
          lab_encerrada_motivo: string | null
          lab_encerrada_por_id: string | null
          // NOVA TABELA ASSISTÊNCIA PODE TER RELAÇÃO, MAS NÃO ALTEROU OS AQUI
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
          [key: string]: any
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
          [key: string]: any
        }
      }

      // ... FIM TABLES
      post_sales: {
        Row: { id: number; status: string }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
      post_sales_interactions: {
        Row: { id: number; tipo_contato: string; resumo: string; created_at: string }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      renegotiate_store_financing: {
        Args: {
          p_financing_id: number
          p_sale_id: number
          p_store_id: number
          p_employee_id: number
          p_user_id: string
          p_tenant_id: string
          p_installments: Json
        }
        Returns: Json
      }
      receive_installment_payment: {
        Args: {
          p_installment_id: number
          p_sale_id: number
          p_store_id: number
          p_employee_id: number
          p_user_id: string
          p_tenant_id: string
          p_received_amount: number
          p_interest_amount: number
          p_received_on: string
          p_strategy: string
          p_receipts: Json
        }
        Returns: Json
      }
      reverse_installment_receipt_operation: {
        Args: {
          p_operation_id: number
          p_authorizing_employee_id: number
          p_user_id: string
          p_reason: string
        }
        Returns: Json
      }
      create_tower_store_onboarding: {
        Args: {
          p_existing_tenant_id: string | null
          p_new_tenant_name: string | null
          p_store_name: string
          p_store_city: string | null
          p_store_state: string | null
          p_store_address: string | null
          p_store_phone: string | null
          p_store_settings: Json
          p_token_hash: string
          p_fallback_code_hash: string
          p_admin_pin_hash: string
          p_expires_at: string
          p_created_by: string
        }
        Returns: {
          tenant_id: string
          store_id: number
          activation_id: string
        }[]
      }
      reissue_tower_store_activation: {
        Args: {
          p_store_id: number
          p_token_hash: string
          p_fallback_code_hash: string
          p_admin_pin_hash: string
          p_expires_at: string
          p_created_by: string
        }
        Returns: {
          tenant_id: string
          store_id: number
          activation_id: string
        }[]
      }
      pair_tower_device: {
        Args: {
          p_activation_method: string
          p_activation_secret_hash: string
          p_device_credential_hash: string
          p_device_label: string
          p_app_version: string | null
        }
        Returns: {
          paired_device_id: string
          paired_tenant_id: string
          paired_store_id: number
          device_paired_at: string
        }[]
      }
      create_tower_asset_batch: {
        Args: {
          p_batch_name: string
          p_quantity: number
          p_sequence_year: number
          p_created_by: string
        }
        Returns: { created_batch_id: string; created_batch_code: string; first_public_code: string; last_public_code: string }[]
      }
      issue_tower_asset_enrollment: {
        Args: {
          p_asset_id: string
          p_token_hash: string
          p_fallback_code_hash: string
          p_expires_at: string
          p_created_by: string
        }
        Returns: { enrollment_id: string; asset_public_code: string }[]
      }
      enroll_tower_asset: {
        Args: {
          p_method: string
          p_public_code: string
          p_secret_hash: string
          p_asset_credential_hash: string
          p_device_label: string
          p_app_version: string | null
        }
        Returns: { enrolled_asset_id: string; enrolled_public_code: string; asset_enrolled_at: string }[]
      }
      pair_tower_asset_device: {
        Args: {
          p_asset_credential_hash: string
          p_activation_method: string
          p_activation_secret_hash: string
          p_device_credential_hash: string
          p_device_label: string
          p_app_version: string | null
        }
        Returns: {
          paired_device_id: string
          paired_asset_id: string
          paired_asset_public_code: string
          paired_tenant_id: string
          paired_store_id: number
          device_paired_at: string
        }[]
      }
      reissue_tower_asset_activation: {
        Args: {
          p_asset_id: string
          p_store_id: number
          p_token_hash: string
          p_fallback_code_hash: string
          p_admin_pin_hash: string
          p_expires_at: string
          p_created_by: string
        }
        Returns: { tenant_id: string; store_id: number; activation_id: string }[]
      }
      set_tower_asset_lifecycle_status: {
        Args: { p_asset_id: string; p_status: string }
        Returns: undefined
      }
      mark_tower_asset_batch_printed: {
        Args: { p_batch_id: string }
        Returns: undefined
      }
      consume_tower_activation_rate_limit: {
        Args: {
          p_key_hash: string
          p_scope: string
          p_max_attempts?: number
          p_window_seconds?: number
        }
        Returns: { allowed: boolean; retry_after_seconds: number }[]
      }
      clear_tower_activation_rate_limit: {
        Args: { p_key_hash: string; p_scope: string }
        Returns: undefined
      }
      record_tower_admin_pin_attempt: {
        Args: {
          p_store_id: number
          p_expected_pin_hash: string
          p_verified: boolean
          p_new_pin_hash: string | null
        }
        Returns: {
          pin_verified: boolean
          pin_must_change: boolean
          pin_failed_attempts: number
          pin_locked_until: string | null
        }[]
      }
      create_nfc_tray: {
        Args: {
          p_tray_id: string
          p_store_id: number
          p_created_by_user_id: string
        }
        Returns: Json
      }
      link_nfc_tray_os: {
        Args: {
          p_tray_id: string
          p_store_id: number
          p_os_id: number
        }
        Returns: Json
      }
      advance_nfc_tray: {
        Args: {
          p_tray_id: string
          p_store_id: number
          p_action: string
        }
        Returns: Json
      }
      update_venda_financeiro: {
        Args: { p_venda_id: number }
        Returns: void
      }
      increment_stock: {
        Args: { p_product_id: number, p_quantity: number, p_new_cost: number | null }
        Returns: void
      }
      get_next_nfce_number: {
        Args: {
          p_environment?: string
          p_org_id: string
          p_serie: string | number
          p_store_id: number
        }
        Returns: number
      }
      reserve_next_store_local_protocol: {
        Args: {
          p_store_id: number
          p_initial_number: number
        }
        Returns: number
      }
      apply_service_order_evaluation_link_change: {
        Args: {
          p_service_order_id: number
          p_store_id: number
          p_expected_previous_evaluation_id: number | null
          p_next_evaluation_id: number | null
          p_authorizer_employee_id: number | null
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
