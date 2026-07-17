CREATE TABLE IF NOT EXISTS public.tower_device_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    fallback_code_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'consumed', 'revoked')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_tower_device_activations_store_created
    ON public.tower_device_activations(store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tower_device_activations_pending_expiry
    ON public.tower_device_activations(expires_at)
    WHERE status = 'pending';

ALTER TABLE public.tower_device_activations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tower_device_activations FROM PUBLIC;
REVOKE ALL ON TABLE public.tower_device_activations FROM anon;
REVOKE ALL ON TABLE public.tower_device_activations FROM authenticated;

CREATE OR REPLACE FUNCTION public.create_tower_store_onboarding(
    p_existing_tenant_id UUID,
    p_new_tenant_name TEXT,
    p_store_name TEXT,
    p_store_city TEXT,
    p_store_state TEXT,
    p_store_address TEXT,
    p_store_phone TEXT,
    p_store_settings JSONB,
    p_token_hash TEXT,
    p_fallback_code_hash TEXT,
    p_expires_at TIMESTAMPTZ,
    p_created_by UUID
)
RETURNS TABLE (
    tenant_id UUID,
    store_id BIGINT,
    activation_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_tenant_id UUID;
    created_store_id BIGINT;
    created_activation_id UUID;
    normalized_tenant_name TEXT := NULLIF(BTRIM(p_new_tenant_name), '');
    normalized_store_name TEXT := NULLIF(BTRIM(p_store_name), '');
BEGIN
    IF (p_existing_tenant_id IS NULL) = (normalized_tenant_name IS NULL) THEN
        RAISE EXCEPTION 'Informe um tenant existente ou o nome de uma nova empresa.';
    END IF;

    IF normalized_store_name IS NULL THEN
        RAISE EXCEPTION 'O nome da loja e obrigatorio.';
    END IF;

    IF p_expires_at <= NOW() THEN
        RAISE EXCEPTION 'A ativacao precisa expirar no futuro.';
    END IF;

    IF p_existing_tenant_id IS NOT NULL THEN
        SELECT existing_tenant.id
        INTO resolved_tenant_id
        FROM public.tenants AS existing_tenant
        WHERE existing_tenant.id = p_existing_tenant_id;

        IF resolved_tenant_id IS NULL THEN
            RAISE EXCEPTION 'Tenant nao encontrado.';
        END IF;
    ELSE
        INSERT INTO public.tenants (name)
        VALUES (normalized_tenant_name)
        RETURNING id INTO resolved_tenant_id;
    END IF;

    INSERT INTO public.stores (
        tenant_id,
        name,
        city,
        state,
        address,
        phone,
        is_active,
        settings
    )
    VALUES (
        resolved_tenant_id,
        normalized_store_name,
        NULLIF(BTRIM(p_store_city), ''),
        NULLIF(UPPER(BTRIM(p_store_state)), ''),
        NULLIF(BTRIM(p_store_address), ''),
        NULLIF(BTRIM(p_store_phone), ''),
        TRUE,
        COALESCE(p_store_settings, '{}'::JSONB)
    )
    RETURNING id INTO created_store_id;

    INSERT INTO public.tower_device_activations (
        tenant_id,
        store_id,
        token_hash,
        fallback_code_hash,
        expires_at,
        created_by
    )
    VALUES (
        resolved_tenant_id,
        created_store_id,
        p_token_hash,
        p_fallback_code_hash,
        p_expires_at,
        p_created_by
    )
    RETURNING id INTO created_activation_id;

    RETURN QUERY
    SELECT resolved_tenant_id, created_store_id, created_activation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tower_store_onboarding(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TIMESTAMPTZ, UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_tower_store_onboarding(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TIMESTAMPTZ, UUID
) FROM anon;
REVOKE ALL ON FUNCTION public.create_tower_store_onboarding(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TIMESTAMPTZ, UUID
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_tower_store_onboarding(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TIMESTAMPTZ, UUID
) TO service_role;
