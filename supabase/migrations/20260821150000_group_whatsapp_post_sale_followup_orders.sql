BEGIN;

ALTER TABLE public.whatsapp_post_sale_followups
  ADD COLUMN IF NOT EXISTS covered_service_order_ids BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[];

UPDATE public.whatsapp_post_sale_followups
SET covered_service_order_ids = ARRAY[service_order_id]
WHERE cardinality(covered_service_order_ids) = 0;

ALTER TABLE public.whatsapp_post_sale_followups
  ADD CONSTRAINT whatsapp_post_sale_followups_covered_orders_not_empty
  CHECK (cardinality(covered_service_order_ids) > 0) NOT VALID;

ALTER TABLE public.whatsapp_post_sale_followups
  VALIDATE CONSTRAINT whatsapp_post_sale_followups_covered_orders_not_empty;

CREATE INDEX IF NOT EXISTS idx_whatsapp_post_sale_followups_covered_orders
  ON public.whatsapp_post_sale_followups USING GIN (covered_service_order_ids);

COMMENT ON COLUMN public.whatsapp_post_sale_followups.covered_service_order_ids IS
  'Todas as OSs cobertas por este unico follow-up, incluindo a OS representante.';

COMMIT;
