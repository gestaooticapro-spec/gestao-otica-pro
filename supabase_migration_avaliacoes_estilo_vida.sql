ALTER TABLE optical_evaluations
ADD COLUMN IF NOT EXISTS estilo_vida_uso_computador_horas INTEGER,
ADD COLUMN IF NOT EXISTS estilo_vida_dirigir_horas INTEGER,
ADD COLUMN IF NOT EXISTS estilo_vida_leitura_horas INTEGER,
ADD COLUMN IF NOT EXISTS estilo_vida_uso_celular_horas INTEGER,
ADD COLUMN IF NOT EXISTS estilo_vida_exposicao_sol_horas INTEGER,
ADD COLUMN IF NOT EXISTS estilo_vida_ambiente_interno_horas INTEGER,
ADD COLUMN IF NOT EXISTS estilo_vida_ambiente_externo_horas INTEGER,
ADD COLUMN IF NOT EXISTS estilo_vida_assistir_tv_horas INTEGER;

CREATE INDEX IF NOT EXISTS idx_optical_evaluations_age
ON optical_evaluations(store_id, age_years);
