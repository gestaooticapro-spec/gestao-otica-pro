-- Um modelo reutilizavel do Campo Visual para demonstracoes e testes da Torre.
-- Ele guarda apenas o resultado consolidado, nunca video ou landmarks faciais.
CREATE TABLE IF NOT EXISTS public.tower_heatmap_demo_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
    source_heatmap_session_id UUID NULL REFERENCES public.tower_heatmap_sessions(id) ON DELETE SET NULL,
    created_by_user_id UUID NULL,
    algorithm_version TEXT NOT NULL,
    target_plan_version TEXT NOT NULL,
    result_summary JSONB NOT NULL,
    target_samples JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.tower_heatmap_demo_templates ENABLE ROW LEVEL SECURITY;

-- Nesta fase, o acesso ocorre somente por server actions autenticadas.
REVOKE ALL ON TABLE public.tower_heatmap_demo_templates FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_tower_heatmap_demo_templates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tower_heatmap_demo_templates_set_updated_at ON public.tower_heatmap_demo_templates;
CREATE TRIGGER tower_heatmap_demo_templates_set_updated_at
    BEFORE UPDATE ON public.tower_heatmap_demo_templates
    FOR EACH ROW
    EXECUTE FUNCTION public.set_tower_heatmap_demo_templates_updated_at();
