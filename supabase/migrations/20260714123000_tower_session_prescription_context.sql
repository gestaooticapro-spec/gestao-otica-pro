-- Contexto clinico minimo compartilhado entre as experiencias da Torre.
-- E um snapshot operacional da receita informada na sessao, sem substituir a
-- avaliacao optica oficial quando ela existir.
ALTER TABLE public.tower_sessions
    ADD COLUMN IF NOT EXISTS prescription_snapshot JSONB NULL;

ALTER TABLE public.tower_sessions
    DROP CONSTRAINT IF EXISTS tower_sessions_experience_check;

ALTER TABLE public.tower_sessions
    ADD CONSTRAINT tower_sessions_experience_check
        CHECK (current_experience IS NULL OR current_experience IN (
            'look', 'visagismo', 'campo_visual', 'medidas', 'thickness'
        ));
