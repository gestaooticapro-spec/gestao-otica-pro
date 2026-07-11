-- Sessao principal da Torre. Pode iniciar sem cliente e ser vinculada depois.
-- Resultados de cada experiencia continuam em seus contratos proprios.
CREATE TABLE IF NOT EXISTS public.tower_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id BIGINT NULL REFERENCES public.customers(id) ON DELETE SET NULL,
    optical_evaluation_id BIGINT NULL REFERENCES public.optical_evaluations(id) ON DELETE SET NULL,
    created_by_user_id UUID NULL,
    status TEXT NOT NULL DEFAULT 'active',
    current_experience TEXT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    completed_at TIMESTAMPTZ NULL,
    discarded_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT tower_sessions_status_check
        CHECK (status IN ('active', 'completed', 'discarded', 'expired')),
    CONSTRAINT tower_sessions_experience_check
        CHECK (current_experience IS NULL OR current_experience IN ('look', 'visagismo', 'campo_visual', 'medidas')),
    CONSTRAINT tower_sessions_completed_at_check
        CHECK (status <> 'completed' OR completed_at IS NOT NULL),
    CONSTRAINT tower_sessions_discarded_at_check
        CHECK (status <> 'discarded' OR discarded_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_tower_sessions_store_status_started
    ON public.tower_sessions(store_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_tower_sessions_store_customer_started
    ON public.tower_sessions(store_id, customer_id, started_at DESC)
    WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tower_sessions_evaluation
    ON public.tower_sessions(optical_evaluation_id, started_at DESC)
    WHERE optical_evaluation_id IS NOT NULL;

ALTER TABLE public.tower_sessions ENABLE ROW LEVEL SECURITY;

-- Nesta fase, o acesso ocorre exclusivamente por server actions autenticadas.
REVOKE ALL ON TABLE public.tower_sessions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_tower_sessions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tower_sessions_set_updated_at ON public.tower_sessions;
CREATE TRIGGER tower_sessions_set_updated_at
    BEFORE UPDATE ON public.tower_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_tower_sessions_updated_at();

-- O mapa visual atual continua com seu proprio contrato obrigatório de
-- cliente + avaliação. A coluna cria o elo para a futura execução pela Torre.
ALTER TABLE public.tower_heatmap_sessions
    ADD COLUMN IF NOT EXISTS tower_session_id UUID NULL
    REFERENCES public.tower_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tower_heatmap_sessions_tower_session
    ON public.tower_heatmap_sessions(tower_session_id)
    WHERE tower_session_id IS NOT NULL;
