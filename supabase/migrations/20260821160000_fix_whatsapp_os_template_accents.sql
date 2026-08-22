BEGIN;

UPDATE public.stores
SET settings = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        settings,
        '{whatsapp_automation,os_on_demand,templates,lens_in_production}',
        to_jsonb('Oi, {nome}! Seu pedido{paciente} está em produção no laboratório no momento.'::text),
        true
      ),
      '{whatsapp_automation,os_on_demand,templates,lens_arrived_needs_frame}',
      to_jsonb('Oi, {nome}! Boa notícia: a lente{paciente} já chegou. Quando puder, traga a armação na loja para fazermos a montagem.'::text),
      true
    ),
    '{whatsapp_automation,os_on_demand,templates,lens_arrived_assembling}',
    to_jsonb('Oi, {nome}! A lente{paciente} já chegou e seu óculos entrou na fila de montagem.'::text),
    true
  ),
  '{whatsapp_automation,os_on_demand,templates,ready_for_pickup}',
  to_jsonb('Oi, {nome}! Seu óculos{paciente} ficou pronto e já pode ser retirado na loja.'::text),
  true
)
WHERE settings->'whatsapp_automation'->'os_on_demand'->'templates' IS NOT NULL;

COMMIT;
