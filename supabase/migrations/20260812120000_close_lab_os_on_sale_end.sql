ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS lab_encerrada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lab_encerrada_tipo TEXT,
  ADD COLUMN IF NOT EXISTS lab_encerrada_motivo TEXT,
  ADD COLUMN IF NOT EXISTS lab_encerrada_por_id UUID;

ALTER TABLE public.service_orders
  DROP CONSTRAINT IF EXISTS service_orders_lab_encerrada_tipo_check;

ALTER TABLE public.service_orders
  ADD CONSTRAINT service_orders_lab_encerrada_tipo_check
  CHECK (lab_encerrada_tipo IS NULL OR lab_encerrada_tipo IN ('cancelamento', 'abandono'));

CREATE INDEX IF NOT EXISTS service_orders_active_lab_idx
  ON public.service_orders (store_id, created_at)
  WHERE dt_entregue_em IS NULL AND lab_encerrada_em IS NULL;
