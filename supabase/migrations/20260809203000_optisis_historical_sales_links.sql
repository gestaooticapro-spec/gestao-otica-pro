-- Liga compras historicas importadas aos seus produtos de origem e, quando
-- houver, ao registro de grau ja preservado no historico do cliente.

CREATE TABLE IF NOT EXISTS public.product_external_references (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    source_system TEXT NOT NULL,
    source_product_type TEXT NOT NULL,
    source_product_id TEXT NOT NULL,
    source_product_name TEXT NULL,
    normalized_name TEXT NULL,
    migration_batch_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT product_external_references_source_product_check
        CHECK (length(btrim(source_product_id)) > 0),
    CONSTRAINT product_external_references_source_unique
        UNIQUE (store_id, source_system, source_product_type, source_product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_external_references_product
    ON public.product_external_references (store_id, product_id);

ALTER TABLE public.product_external_references ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_external_references FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS product_external_references_set_updated_at
    ON public.product_external_references;

CREATE TRIGGER product_external_references_set_updated_at
    BEFORE UPDATE ON public.product_external_references
    FOR EACH ROW EXECUTE FUNCTION public.set_customer_import_data_updated_at();

ALTER TABLE public.customer_prescription_history
    ADD COLUMN IF NOT EXISTS historical_sale_id BIGINT NULL
    REFERENCES public.vendas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_prescription_history_historical_sale
    ON public.customer_prescription_history (historical_sale_id)
    WHERE historical_sale_id IS NOT NULL;

COMMENT ON TABLE public.product_external_references IS
    'Identidade de catalogos externos; permite que codigos legados distintos apontem para o mesmo produto MB Optical.';
COMMENT ON COLUMN public.customer_prescription_history.historical_sale_id IS
    'Venda historica correspondente quando o grau foi extraido de uma compra do sistema anterior.';
