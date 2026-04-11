-- =====================================================================
-- MIGRAÇÃO: CRM de Avaliação Óptica - Fase 1 (Infraestrutura de Dados)
-- =====================================================================
-- Este script adiciona campos de rastreamento CRM à tabela optical_evaluations
-- e cria um trigger automático para fechar avaliações quando a venda é concluída.
--
-- IMPORTANTE: Execute no Supabase SQL Editor na ordem apresentada.
-- Todas as operações são seguras para dados existentes (ADD COLUMN IF NOT EXISTS).
-- =====================================================================

-- =====================================================================
-- PARTE 1: NOVAS COLUNAS NA TABELA optical_evaluations
-- =====================================================================

-- 1.1 outcome_status: define o resultado final do atendimento
-- Valores permitidos:
--   NULL               = ainda sem desfecho definido
--   'venda_fechada'    = sucesso (preenchido automaticamente pelo trigger)
--   'cliente_pesquisa' = cliente saiu mas prometeu voltar
--   'perdido_preco'    = perdeu por objeção de preço
--   'perdido_produto'  = perdeu por não ter o produto desejado
--   'perdido_prazo'    = perdeu por prazo de entrega
ALTER TABLE optical_evaluations
ADD COLUMN IF NOT EXISTS outcome_status TEXT NULL;

-- 1.2 panic_reason: motivo registrado via botão de resposta rápida ("Pânico")
-- Texto livre para capturar a hesitação do cliente durante o atendimento
ALTER TABLE optical_evaluations
ADD COLUMN IF NOT EXISTS panic_reason TEXT NULL;

-- 1.3 recommended_items: snapshot JSONB dos produtos/lentes sugeridos pela IA
-- Guarda o que foi sugerido no momento do atendimento para auditoria de conversão
ALTER TABLE optical_evaluations
ADD COLUMN IF NOT EXISTS recommended_items JSONB NULL DEFAULT '[]'::jsonb;

-- 1.4 exported_venda_id: vínculo direto com a venda resultante (Token de conversão)
-- Quando o consultor clica em "Ir para Venda", este campo é preenchido
ALTER TABLE optical_evaluations
ADD COLUMN IF NOT EXISTS exported_venda_id BIGINT NULL REFERENCES vendas(id) ON DELETE SET NULL;

-- =====================================================================
-- PARTE 2: CONSTRAINT DE VALIDAÇÃO DO outcome_status
-- =====================================================================

-- Garante que apenas valores válidos sejam inseridos
-- (DROP seguro caso a constraint já exista de tentativa anterior)
ALTER TABLE optical_evaluations
DROP CONSTRAINT IF EXISTS optical_evaluations_outcome_status_check;

ALTER TABLE optical_evaluations
ADD CONSTRAINT optical_evaluations_outcome_status_check CHECK (
    outcome_status IS NULL OR outcome_status IN (
        'venda_fechada',
        'cliente_pesquisa',
        'perdido_preco',
        'perdido_produto',
        'perdido_prazo'
    )
);

-- =====================================================================
-- PARTE 3: ATUALIZAR CONSTRAINT DE STATUS PARA INCLUIR NOVOS ESTADOS
-- =====================================================================

-- Adiciona 'em_andamento' e 'pendente' conforme o spec do CRM,
-- mantendo os valores antigos para compatibilidade com registros existentes.
ALTER TABLE optical_evaluations
DROP CONSTRAINT IF EXISTS optical_evaluations_status_check;

ALTER TABLE optical_evaluations
ADD CONSTRAINT optical_evaluations_status_check CHECK (
    status IN (
        'rascunho',       -- (legado) avaliação criada mas não finalizada
        'em_andamento',   -- (novo) atendimento ativo, consultor interagindo
        'pendente',       -- (novo) cliente saiu, pode retornar
        'concluida',      -- avaliação finalizada
        'importada',      -- importada via iVision
        'exportada'       -- exportada para OS
    )
);

-- =====================================================================
-- PARTE 4: ÍNDICES PARA PERFORMANCE DO MURAL
-- =====================================================================

-- 4.1 Índice para o Mural de Retomada: busca por funcionário + status aberto
CREATE INDEX IF NOT EXISTS idx_optical_evaluations_employee_status
ON optical_evaluations(store_id, employee_id, status, created_at DESC)
WHERE employee_id IS NOT NULL;

-- 4.2 Índice para buscas de conversão (vínculo venda)
CREATE INDEX IF NOT EXISTS idx_optical_evaluations_venda
ON optical_evaluations(exported_venda_id)
WHERE exported_venda_id IS NOT NULL;

-- 4.3 Índice para relatórios gerenciais de desfecho
CREATE INDEX IF NOT EXISTS idx_optical_evaluations_outcome
ON optical_evaluations(store_id, outcome_status, created_at DESC)
WHERE outcome_status IS NOT NULL;

-- =====================================================================
-- PARTE 5: TRIGGER AUTOMÁTICO DE CONVERSÃO
-- =====================================================================
-- Quando uma venda vinculada a uma avaliação muda para 'Fechada',
-- o trigger atualiza automaticamente o outcome_status da avaliação
-- para 'venda_fechada' e o status para 'concluida'.
-- =====================================================================

-- 5.1 Função do Trigger
CREATE OR REPLACE FUNCTION fn_evaluation_auto_convert()
RETURNS TRIGGER AS $$
BEGIN
    -- Só processa se o status da venda mudou para 'Fechada'
    IF NEW.status = 'Fechada' AND (OLD.status IS NULL OR OLD.status <> 'Fechada') THEN
        UPDATE optical_evaluations
        SET
            outcome_status = 'venda_fechada',
            status = 'concluida',
            exported_venda_id = NEW.id,
            updated_at = timezone('utc'::text, now())
        WHERE exported_venda_id = NEW.id
          AND (outcome_status IS NULL OR outcome_status <> 'venda_fechada');
    END IF;

    -- Se a venda sair de 'Fechada' (ex: cancelamento), reverte o outcome
    IF OLD.status = 'Fechada' AND NEW.status <> 'Fechada' THEN
        UPDATE optical_evaluations
        SET
            outcome_status = NULL,
            status = 'pendente',
            updated_at = timezone('utc'::text, now())
        WHERE exported_venda_id = NEW.id
          AND outcome_status = 'venda_fechada';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.2 Trigger na tabela de vendas
DROP TRIGGER IF EXISTS trg_evaluation_auto_convert ON vendas;

CREATE TRIGGER trg_evaluation_auto_convert
AFTER UPDATE ON vendas
FOR EACH ROW
EXECUTE FUNCTION fn_evaluation_auto_convert();

-- =====================================================================
-- PARTE 6: TRIGGER PARA VÍNCULO VIA SERVICE_ORDER
-- =====================================================================
-- Quando uma OS é criada com source_optical_evaluation_id,
-- preenche automaticamente o exported_venda_id na avaliação.
-- Isso garante que o Token Flow funcione mesmo que o frontend
-- não atualize o campo diretamente.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_evaluation_link_via_os()
RETURNS TRIGGER AS $$
BEGIN
    -- Só processa se a OS tem vínculo com avaliação
    IF NEW.source_optical_evaluation_id IS NOT NULL THEN
        UPDATE optical_evaluations
        SET
            exported_venda_id = NEW.venda_id,
            updated_at = timezone('utc'::text, now())
        WHERE id = NEW.source_optical_evaluation_id
          AND exported_venda_id IS NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_evaluation_link_via_os ON service_orders;

CREATE TRIGGER trg_evaluation_link_via_os
AFTER INSERT OR UPDATE ON service_orders
FOR EACH ROW
EXECUTE FUNCTION fn_evaluation_link_via_os();

-- =====================================================================
-- FIM DA MIGRAÇÃO
-- =====================================================================
-- Resumo do que foi criado:
--   ✅ 4 novas colunas: outcome_status, panic_reason, recommended_items, exported_venda_id
--   ✅ 2 constraints atualizadas: outcome_status_check, status_check
--   ✅ 3 novos índices para performance
--   ✅ 2 triggers: auto-conversão via venda + link via OS
-- =====================================================================
