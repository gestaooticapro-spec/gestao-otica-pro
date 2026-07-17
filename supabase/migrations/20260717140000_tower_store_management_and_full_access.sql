-- O produto nao possui mais modo MVP. Lojas com Torre iniciam com os recursos
-- completos; restricoes comerciais futuras deverao usar entitlement proprio.
UPDATE public.stores
SET settings = COALESCE(settings, '{}'::JSONB) - ARRAY[
    'app_mode',
    'module_fiscal_enabled',
    'module_installments_enabled',
    'module_post_sales_enabled',
    'module_quick_sale_enabled',
    'module_labels_enabled'
]
WHERE COALESCE(settings->>'tower_enabled', 'false') = 'true';

CREATE FUNCTION public.reissue_tower_store_activation(
    p_store_id BIGINT,
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
    created_activation_id UUID;
BEGIN
    IF NULLIF(BTRIM(p_token_hash), '') IS NULL
       OR NULLIF(BTRIM(p_fallback_code_hash), '') IS NULL
       OR NULLIF(BTRIM(p_admin_pin_hash), '') IS NULL THEN
        RAISE EXCEPTION 'As credenciais de ativacao sao obrigatorias.';
    END IF;

    IF p_expires_at <= NOW() THEN
        RAISE EXCEPTION 'A ativacao precisa expirar no futuro.';
    END IF;

    SELECT store.tenant_id
    INTO resolved_tenant_id
    FROM public.stores AS store
    WHERE store.id = p_store_id
      AND COALESCE(store.settings->>'tower_enabled', 'false') = 'true';

    IF resolved_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Loja com Torre nao encontrada.';
    END IF;

    UPDATE public.tower_device_activations
    SET status = 'revoked', revoked_at = NOW()
    WHERE store_id = p_store_id
      AND status = 'pending';

    INSERT INTO public.tower_store_admin_pins (
        store_id,
        pin_hash,
        must_change,
        failed_attempts,
        locked_until,
        last_verified_at,
        created_by,
        updated_at
    )
    VALUES (
        p_store_id,
        p_admin_pin_hash,
        TRUE,
        0,
        NULL,
        NULL,
        p_created_by,
        NOW()
    )
    ON CONFLICT (store_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash,
        must_change = TRUE,
        failed_attempts = 0,
        locked_until = NULL,
        last_verified_at = NULL,
        created_by = EXCLUDED.created_by,
        updated_at = NOW();

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
        p_store_id,
        p_token_hash,
        p_fallback_code_hash,
        p_expires_at,
        p_created_by
    )
    RETURNING id INTO created_activation_id;

    RETURN QUERY
    SELECT resolved_tenant_id, p_store_id, created_activation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reissue_tower_store_activation(
    BIGINT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reissue_tower_store_activation(
    BIGINT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) FROM anon;
REVOKE ALL ON FUNCTION public.reissue_tower_store_activation(
    BIGINT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reissue_tower_store_activation(
    BIGINT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) TO service_role;
