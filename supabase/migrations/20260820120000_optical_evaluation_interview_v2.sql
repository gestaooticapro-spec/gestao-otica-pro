-- Snapshot versionado da entrevista e da decisao do motor da otica.
-- Aditivo: preserva raw_payload_json e todos os contratos iVision/Torre existentes.
ALTER TABLE public.optical_evaluations
  ADD COLUMN IF NOT EXISTS interview_snapshot JSONB NULL,
  ADD COLUMN IF NOT EXISTS recommendation_input JSONB NULL,
  ADD COLUMN IF NOT EXISTS selected_recommendation JSONB NULL;

COMMENT ON COLUMN public.optical_evaluations.interview_snapshot IS
  'Entrevista da otica, incluindo schemaVersion; ausencias permanecem neutras.';
COMMENT ON COLUMN public.optical_evaluations.recommendation_input IS
  'Entrada normalizada usada pelo motor, incluindo engineVersion.';
COMMENT ON COLUMN public.optical_evaluations.selected_recommendation IS
  'Opcao escolhida pelo vendedor e instante da escolha; recommended_items preserva as opcoes originais.';
