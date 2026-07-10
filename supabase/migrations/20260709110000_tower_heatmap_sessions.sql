-- Sessao persistida da torre: guarda somente o resultado consolidado do mapa.
-- Video, imagens e landmarks faciais brutos nao fazem parte deste contrato.
CREATE TABLE IF NOT EXISTS public.tower_heatmap_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    optical_evaluation_id BIGINT NOT NULL REFERENCES public.optical_evaluations(id) ON DELETE RESTRICT,
    created_by_user_id UUID NULL,
    status TEXT NOT NULL DEFAULT 'created',
    algorithm_version TEXT NOT NULL,
    target_plan_version TEXT NOT NULL,
    result_summary JSONB NULL,
    target_samples JSONB NULL,
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    cancelled_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT tower_heatmap_sessions_status_check
        CHECK (status IN ('created', 'running', 'completed', 'cancelled', 'failed')),
    CONSTRAINT tower_heatmap_sessions_completed_payload_check
        CHECK (
            status <> 'completed'
            OR (completed_at IS NOT NULL AND result_summary IS NOT NULL AND target_samples IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS idx_tower_heatmap_sessions_store_customer_completed
    ON public.tower_heatmap_sessions(store_id, customer_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_tower_heatmap_sessions_evaluation_created
    ON public.tower_heatmap_sessions(optical_evaluation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tower_heatmap_sessions_store_status
    ON public.tower_heatmap_sessions(store_id, status, created_at DESC);

ALTER TABLE public.tower_heatmap_sessions ENABLE ROW LEVEL SECURITY;

-- A tabela e acessada somente por server actions autenticadas nesta fase.
-- A torre futura recebera uma politica propria de dispositivo pareado.
REVOKE ALL ON TABLE public.tower_heatmap_sessions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_tower_heatmap_sessions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tower_heatmap_sessions_set_updated_at ON public.tower_heatmap_sessions;
CREATE TRIGGER tower_heatmap_sessions_set_updated_at
    BEFORE UPDATE ON public.tower_heatmap_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_tower_heatmap_sessions_updated_at();
