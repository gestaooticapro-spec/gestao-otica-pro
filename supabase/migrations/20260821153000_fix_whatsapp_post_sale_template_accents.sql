BEGIN;

UPDATE public.stores
SET settings = jsonb_set(
  settings,
  '{whatsapp_automation,post_sale_followup,template}',
  to_jsonb('Olá, {nome}! Aqui é da ótica.\n\nJá faz {dias} dias que {paciente} foi retirado e queríamos saber como está a adaptação.'::text),
  true
)
WHERE settings->'whatsapp_automation'->'post_sale_followup'->>'template' =
  'Ola, {nome}! Aqui e da otica.\n\nJa faz {dias} dias que {paciente} foi retirado e queriamos saber como esta a adaptacao.';

COMMIT;
