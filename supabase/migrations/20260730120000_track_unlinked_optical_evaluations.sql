-- Mantém o histórico de uma avaliação removida manualmente de uma OS,
-- sem incluí-la nos indicadores de avaliação da equipe.
ALTER TABLE public.optical_evaluations
  ADD COLUMN IF NOT EXISTS unlinked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS unlinked_by_employee_id BIGINT NULL
    REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_optical_evaluations_store_unlinked_created_at
  ON public.optical_evaluations (store_id, unlinked_at, created_at DESC);
