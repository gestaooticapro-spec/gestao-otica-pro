BEGIN;

UPDATE public.stores
SET settings = jsonb_set(
  settings,
  '{whatsapp_automation,installment_due_reminder,template}',
  to_jsonb(
    (settings->'whatsapp_automation'->'installment_due_reminder'->>'template')
    || E'\n\nPara não receber mais lembretes de vencimento por WhatsApp, responda PARAR.'
  ),
  true
)
WHERE settings->'whatsapp_automation'->'installment_due_reminder'->>'template' IS NOT NULL
  AND settings->'whatsapp_automation'->'installment_due_reminder'->>'template' !~* '(responda|envie).*(parar|não receber|nao receber|cancelar)';

COMMIT;
