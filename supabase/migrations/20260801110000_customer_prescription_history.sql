-- Histórico de receitas migradas ou importadas de sistemas externos.
-- Esta tabela não representa avaliação comercial nem ordem de serviço.

CREATE TABLE IF NOT EXISTS public.customer_external_references (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    source_system TEXT NOT NULL,
    source_customer_id TEXT NOT NULL,
    source_customer_name TEXT NULL,
    migration_batch_id UUID NOT NULL,
    match_method TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT customer_external_references_source_customer_check
        CHECK (length(btrim(source_customer_id)) > 0),
    CONSTRAINT customer_external_references_match_method_check
        CHECK (match_method IN ('created', 'cpf', 'name_phone', 'name_birth_date', 'name_confirmed', 'manual')),
    CONSTRAINT customer_external_references_source_unique
        UNIQUE (store_id, source_system, source_customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_external_references_customer
    ON public.customer_external_references (store_id, customer_id);

ALTER TABLE public.customer_external_references ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_external_references FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.customer_prescription_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id BIGINT NULL REFERENCES public.customers(id) ON DELETE SET NULL,

    source_system TEXT NOT NULL,
    source_snapshot_sha256 TEXT NOT NULL,
    source_record_key TEXT NOT NULL,
    source_customer_id TEXT NULL,
    source_service_order_id TEXT NULL,
    migration_batch_id UUID NOT NULL,

    prescription_date DATE NULL,
    received_at TIMESTAMPTZ NULL,

    receita_longe_od_esferico TEXT NULL,
    receita_longe_od_cilindrico TEXT NULL,
    receita_longe_od_eixo TEXT NULL,
    receita_longe_oe_esferico TEXT NULL,
    receita_longe_oe_cilindrico TEXT NULL,
    receita_longe_oe_eixo TEXT NULL,
    receita_perto_od_esferico TEXT NULL,
    receita_perto_od_cilindrico TEXT NULL,
    receita_perto_od_eixo TEXT NULL,
    receita_perto_oe_esferico TEXT NULL,
    receita_perto_oe_cilindrico TEXT NULL,
    receita_perto_oe_eixo TEXT NULL,
    receita_adicao_od TEXT NULL,
    receita_adicao_oe TEXT NULL,
    medida_dnp_od TEXT NULL,
    medida_dnp_oe TEXT NULL,
    medida_altura_od TEXT NULL,
    medida_altura_oe TEXT NULL,

    service_description TEXT NULL,
    source_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT customer_prescription_history_source_snapshot_sha_check
        CHECK (source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT customer_prescription_history_source_record_key_check
        CHECK (length(btrim(source_record_key)) > 0),
    CONSTRAINT customer_prescription_history_payload_check
        CHECK (jsonb_typeof(source_payload) = 'object'),
    CONSTRAINT customer_prescription_history_source_unique
        UNIQUE (store_id, source_system, source_snapshot_sha256, source_record_key)
);

CREATE INDEX IF NOT EXISTS idx_customer_prescription_history_customer_date
    ON public.customer_prescription_history (customer_id, prescription_date DESC, id DESC)
    WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_prescription_history_store_source_customer
    ON public.customer_prescription_history (store_id, source_system, source_customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_prescription_history_batch
    ON public.customer_prescription_history (migration_batch_id);

ALTER TABLE public.customer_prescription_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_prescription_history FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_customer_import_data_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_external_references_set_updated_at
    ON public.customer_external_references;

CREATE TRIGGER customer_external_references_set_updated_at
    BEFORE UPDATE ON public.customer_external_references
    FOR EACH ROW EXECUTE FUNCTION public.set_customer_import_data_updated_at();

DROP TRIGGER IF EXISTS customer_prescription_history_set_updated_at
    ON public.customer_prescription_history;

CREATE TRIGGER customer_prescription_history_set_updated_at
    BEFORE UPDATE ON public.customer_prescription_history
    FOR EACH ROW EXECUTE FUNCTION public.set_customer_import_data_updated_at();
