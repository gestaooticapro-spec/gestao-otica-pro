-- A normalizacao impede que diferencas de espaco ou maiusculas criem outra
-- rede/loja por engano. Os indices tambem cobrem requisicoes simultaneas.
CREATE UNIQUE INDEX IF NOT EXISTS tenants_normalized_name_key
    ON public.tenants ((LOWER(BTRIM(name))));

CREATE UNIQUE INDEX IF NOT EXISTS stores_tenant_normalized_name_key
    ON public.stores (tenant_id, (LOWER(BTRIM(name))));

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
        RAISE EXCEPTION 'Informe uma rede existente ou o nome de uma nova rede.';
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
            RAISE EXCEPTION 'Rede nao encontrada.';
        END IF;
    ELSE
        SELECT existing_tenant.id
        INTO resolved_tenant_id
        FROM public.tenants AS existing_tenant
        WHERE LOWER(BTRIM(existing_tenant.name)) = LOWER(normalized_tenant_name);

        IF resolved_tenant_id IS NOT NULL THEN
            RAISE EXCEPTION 'Esta rede ja existe. Selecione-a na opcao de rede existente.';
        END IF;

        INSERT INTO public.tenants (name)
        VALUES (normalized_tenant_name)
        RETURNING id INTO resolved_tenant_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.stores AS existing_store
        WHERE existing_store.tenant_id = resolved_tenant_id
          AND LOWER(BTRIM(existing_store.name)) = LOWER(normalized_store_name)
    ) THEN
        RAISE EXCEPTION 'Ja existe uma loja com este nome nesta rede.';
    END IF;

    INSERT INTO public.stores (
        tenant_id, name, city, state, address, phone, is_active, settings
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

    INSERT INTO public.tower_store_admin_pins (store_id, pin_hash, must_change, created_by)
    VALUES (created_store_id, p_admin_pin_hash, TRUE, p_created_by);

    INSERT INTO public.tower_device_activations (
        tenant_id, store_id, token_hash, fallback_code_hash, expires_at, created_by
    )
    VALUES (
        resolved_tenant_id, created_store_id, p_token_hash, p_fallback_code_hash, p_expires_at, p_created_by
    )
    RETURNING id INTO created_activation_id;

    RETURN QUERY SELECT resolved_tenant_id, created_store_id, created_activation_id;
END;
$$;
