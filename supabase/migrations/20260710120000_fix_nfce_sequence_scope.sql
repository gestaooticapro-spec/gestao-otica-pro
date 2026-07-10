-- NFC-e: a numeracao precisa ser isolada por loja, serie e ambiente.
-- A sequencia anterior usava somente organization_id + serie, misturando lojas
-- e homologacao com producao. Linhas antigas sao preservadas como historico e
-- usadas como piso para que nenhum numero ja reservado seja reutilizado.

ALTER TABLE public.nfce_sequences
    ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES public.stores(id),
    ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production';

ALTER TABLE public.nfce_sequences
    DROP CONSTRAINT IF EXISTS nfce_sequences_environment_check;

ALTER TABLE public.nfce_sequences
    ADD CONSTRAINT nfce_sequences_environment_check
    CHECK (environment IN ('production', 'homologation'));

ALTER TABLE public.nfce_sequences
    DROP CONSTRAINT IF EXISTS nfce_sequences_organization_id_serie_key;

DROP INDEX IF EXISTS public.nfce_sequences_organization_id_serie_key;

CREATE UNIQUE INDEX IF NOT EXISTS nfce_sequences_org_store_serie_env_key
    ON public.nfce_sequences (organization_id, store_id, serie, environment)
    WHERE store_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.get_next_nfce_number(UUID, INTEGER);

CREATE FUNCTION public.get_next_nfce_number(
    p_org_id UUID,
    p_store_id BIGINT,
    p_serie INTEGER,
    p_environment TEXT DEFAULT 'production'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_next INTEGER;
BEGIN
    IF p_store_id IS NULL THEN
        RAISE EXCEPTION 'store_id e obrigatorio para a numeracao da NFC-e';
    END IF;

    IF p_environment NOT IN ('production', 'homologation') THEN
        RAISE EXCEPTION 'ambiente NFC-e invalido: %', p_environment;
    END IF;

    INSERT INTO public.nfce_sequences (
        organization_id,
        store_id,
        serie,
        environment,
        last_number
    )
    VALUES (
        p_org_id,
        p_store_id,
        p_serie,
        p_environment,
        GREATEST(
            -- Piso da sequencia antiga, que nao possuia loja/ambiente.
            COALESCE((
                SELECT MAX(legacy.last_number)
                FROM public.nfce_sequences AS legacy
                WHERE legacy.organization_id = p_org_id
                  AND legacy.serie = p_serie
                  AND legacy.store_id IS NULL
            ), 0),
            -- Piso das notas que ja foram registradas para este escopo.
            COALESCE((
                SELECT MAX(invoice.numero::INTEGER)
                FROM public.fiscal_invoices AS invoice
                WHERE invoice.organization_id = p_org_id
                  AND invoice.store_id = p_store_id
                  AND invoice.tipo_documento = 'NFCe'
                  AND invoice.direction = 'output'
                  AND COALESCE(invoice.environment, 'production') = p_environment
                  AND COALESCE(invoice.serie, '') ~ '^[0-9]+$'
                  AND COALESCE(invoice.numero, '') ~ '^[0-9]+$'
                  AND invoice.serie::INTEGER = p_serie
            ), 0)
        ) + 1
    )
    ON CONFLICT (organization_id, store_id, serie, environment)
    WHERE store_id IS NOT NULL
    DO UPDATE SET
        last_number = public.nfce_sequences.last_number + 1,
        updated_at = timezone('utc'::text, now())
    RETURNING last_number INTO v_next;

    RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_nfce_number(UUID, BIGINT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_next_nfce_number(UUID, BIGINT, INTEGER, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_nfce_number(UUID, BIGINT, INTEGER, TEXT) TO service_role;
