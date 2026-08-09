-- Vendas trazidas de sistemas anteriores: preservam historico e cobranca,
-- mas nao devem produzir os efeitos de uma venda operacional atual.

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS is_historical_import BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS import_source_system TEXT NULL,
  ADD COLUMN IF NOT EXISTS import_source_record_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS import_batch_id UUID NULL,
  ADD COLUMN IF NOT EXISTS historical_entry_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.vendas
  DROP CONSTRAINT IF EXISTS vendas_historical_entry_amount_nonnegative;

ALTER TABLE public.vendas
  ADD CONSTRAINT vendas_historical_entry_amount_nonnegative
  CHECK (historical_entry_amount >= 0);

ALTER TABLE public.vendas
  DROP CONSTRAINT IF EXISTS vendas_historical_import_source_check;

ALTER TABLE public.vendas
  ADD CONSTRAINT vendas_historical_import_source_check
  CHECK (
    NOT is_historical_import
    OR (
      NULLIF(BTRIM(import_source_system), '') IS NOT NULL
      AND NULLIF(BTRIM(import_source_record_key), '') IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS vendas_historical_import_source_record_unique
  ON public.vendas (store_id, import_source_system, import_source_record_key)
  WHERE is_historical_import;

COMMENT ON COLUMN public.vendas.is_historical_import IS
  'Venda trazida de sistema externo: pode ter historico e cobranca, sem efeitos operacionais.';
COMMENT ON COLUMN public.vendas.historical_entry_amount IS
  'Valor ja pago antes da migracao; informativo, sem movimentacao no caixa atual.';
