-- Resultado numerico das medidas da Torre.
-- As fotos continuam transitorias no navegador e nao sao persistidas aqui.
CREATE TABLE IF NOT EXISTS public.tower_measurement_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    tower_session_id UUID NOT NULL REFERENCES public.tower_sessions(id) ON DELETE CASCADE,
    customer_id BIGINT NULL REFERENCES public.customers(id) ON DELETE SET NULL,
    optical_evaluation_id BIGINT NULL REFERENCES public.optical_evaluations(id) ON DELETE SET NULL,
    created_by_user_id UUID NULL,
    version INTEGER NOT NULL,
    lens_mode TEXT NOT NULL,
    reference_mm NUMERIC(6,2) NOT NULL,
    front_measurements JSONB NOT NULL,
    profile_measurements JSONB NOT NULL,
    attention_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    algorithm_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT tower_measurement_results_version_check CHECK (version > 0),
    CONSTRAINT tower_measurement_results_lens_mode_check CHECK (lens_mode IN ('multifocal', 'bifocal')),
    CONSTRAINT tower_measurement_results_reference_check CHECK (reference_mm > 0),
    CONSTRAINT tower_measurement_results_session_version_key UNIQUE (tower_session_id, version)
);

CREATE INDEX IF NOT EXISTS idx_tower_measurement_results_store_created
    ON public.tower_measurement_results(store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tower_measurement_results_customer_created
    ON public.tower_measurement_results(customer_id, created_at DESC)
    WHERE customer_id IS NOT NULL;

ALTER TABLE public.tower_measurement_results ENABLE ROW LEVEL SECURITY;

-- Nesta fase, o acesso ocorre exclusivamente por server actions autenticadas.
REVOKE ALL ON TABLE public.tower_measurement_results FROM anon, authenticated;
