-- O PIN administrativo e local a Torre. Ele nao e uma credencial de usuario
-- do sistema e jamais e guardado em texto puro ou dentro de stores.settings.
CREATE TABLE IF NOT EXISTS public.tower_store_admin_pins (
    store_id BIGINT PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    pin_hash TEXT NOT NULL CHECK (length(pin_hash) > 0),
    must_change BOOLEAN NOT NULL DEFAULT TRUE,
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until TIMESTAMPTZ,
    last_verified_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tower_store_admin_pins ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tower_store_admin_pins FROM PUBLIC;
REVOKE ALL ON TABLE public.tower_store_admin_pins FROM anon;
REVOKE ALL ON TABLE public.tower_store_admin_pins FROM authenticated;

-- A assinatura anterior nao recebe o hash do PIN. Removemos apenas essa
-- versao para que a criacao de loja, ativacao e PIN continue atomica.
DROP FUNCTION IF EXISTS public.create_tower_store_onboarding(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TIMESTAMPTZ, UUID
);

CREATE FUNCTION public.create_tower_store_onboarding(
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
    p_admin_pin_hash TEXT,
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

    IF NULLIF(BTRIM(p_admin_pin_hash), '') IS NULL THEN
        RAISE EXCEPTION 'O PIN administrativo e obrigatorio.';
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

    INSERT INTO public.tower_store_admin_pins (
        store_id,
        pin_hash,
        must_change,
        created_by
    )
    VALUES (
        created_store_id,
        p_admin_pin_hash,
        TRUE,
        p_created_by
    );

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
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_tower_store_onboarding(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) FROM anon;
REVOKE ALL ON FUNCTION public.create_tower_store_onboarding(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_tower_store_onboarding(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) TO service_role;
