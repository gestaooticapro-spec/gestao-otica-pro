-- Endurecimento posterior a identidade fisica da Torre.
-- Mantem credenciais e registros existentes e corrige atomicidade, concorrencia
-- e rate limit compartilhado entre instancias do backend.

ALTER TABLE public.tower_assets
    DROP CONSTRAINT IF EXISTS tower_assets_current_store_id_fkey;
ALTER TABLE public.tower_assets
    ADD CONSTRAINT tower_assets_current_store_id_fkey
    FOREIGN KEY (current_store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.tower_activation_rate_limits (
    key_hash TEXT NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
    scope TEXT NOT NULL CHECK (length(scope) BETWEEN 2 AND 60),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    reset_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (key_hash, scope)
);

ALTER TABLE public.tower_activation_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tower_activation_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_tower_activation_rate_limit(
    p_key_hash TEXT,
    p_scope TEXT,
    p_max_attempts INTEGER DEFAULT 8,
    p_window_seconds INTEGER DEFAULT 600
)
RETURNS TABLE (allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result_count INTEGER;
    result_reset_at TIMESTAMPTZ;
BEGIN
    IF p_key_hash !~ '^[0-9a-f]{64}$'
       OR NULLIF(BTRIM(p_scope), '') IS NULL
       OR length(p_scope) > 60
       OR p_max_attempts NOT BETWEEN 1 AND 100
       OR p_window_seconds NOT BETWEEN 10 AND 86400 THEN
        RAISE EXCEPTION 'TOWER_RATE_LIMIT_INVALID';
    END IF;

    DELETE FROM public.tower_activation_rate_limits
    WHERE reset_at < NOW() - INTERVAL '1 day';

    INSERT INTO public.tower_activation_rate_limits(
        key_hash, scope, attempt_count, reset_at, updated_at
    ) VALUES (
        p_key_hash, p_scope, 1, NOW() + make_interval(secs => p_window_seconds), NOW()
    )
    ON CONFLICT (key_hash, scope) DO UPDATE
    SET attempt_count = CASE
            WHEN tower_activation_rate_limits.reset_at <= NOW() THEN 1
            ELSE tower_activation_rate_limits.attempt_count + 1
        END,
        reset_at = CASE
            WHEN tower_activation_rate_limits.reset_at <= NOW()
                THEN NOW() + make_interval(secs => p_window_seconds)
            ELSE tower_activation_rate_limits.reset_at
        END,
        updated_at = NOW()
    RETURNING attempt_count, reset_at
    INTO result_count, result_reset_at;

    RETURN QUERY SELECT
        result_count <= p_max_attempts,
        CASE
            WHEN result_count <= p_max_attempts THEN 0
            ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (result_reset_at - NOW())))::INTEGER)
        END;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_tower_activation_rate_limit(
    p_key_hash TEXT,
    p_scope TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_key_hash !~ '^[0-9a-f]{64}$'
       OR NULLIF(BTRIM(p_scope), '') IS NULL
       OR length(p_scope) > 60 THEN
        RAISE EXCEPTION 'TOWER_RATE_LIMIT_INVALID';
    END IF;

    DELETE FROM public.tower_activation_rate_limits
    WHERE key_hash = p_key_hash AND scope = p_scope;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_tower_asset_batch_printed(p_batch_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.tower_asset_batches AS batch
    SET status = 'printed', printed_at = COALESCE(batch.printed_at, NOW()), updated_at = NOW()
    WHERE batch.id = p_batch_id AND batch.status IN ('generated', 'printed');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TOWER_ASSET_BATCH_INVALID';
    END IF;

    UPDATE public.tower_assets AS asset
    SET status = 'printed', label_applied_at = COALESCE(asset.label_applied_at, NOW()), updated_at = NOW()
    WHERE asset.batch_id = p_batch_id AND asset.status = 'generated';
END;
$$;

-- As duas operacoes concorrentes adquirem os mesmos advisory locks na ordem
-- identidade fisica -> loja antes de bloquear linhas, evitando ciclos de lock.
CREATE OR REPLACE FUNCTION public.pair_tower_asset_device(
    p_asset_credential_hash TEXT,
    p_activation_method TEXT,
    p_activation_secret_hash TEXT,
    p_device_credential_hash TEXT,
    p_device_label TEXT,
    p_app_version TEXT
)
RETURNS TABLE (
    paired_device_id UUID,
    paired_asset_id UUID,
    paired_asset_public_code TEXT,
    paired_tenant_id UUID,
    paired_store_id BIGINT,
    device_paired_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    candidate_asset_id UUID;
    candidate_store_id BIGINT;
    selected_asset public.tower_assets%ROWTYPE;
    selected_activation public.tower_device_activations%ROWTYPE;
    existing_store_device public.tower_devices%ROWTYPE;
    created_device_id UUID;
    created_paired_at TIMESTAMPTZ;
BEGIN
    IF p_asset_credential_hash !~ '^[0-9a-f]{64}$'
       OR p_activation_method NOT IN ('qr', 'code')
       OR p_activation_secret_hash !~ '^[0-9a-f]{64}$'
       OR p_device_credential_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'TOWER_CREDENTIAL_INVALID';
    END IF;

    SELECT asset.id INTO candidate_asset_id
    FROM public.tower_assets AS asset
    WHERE asset.enrollment_credential_hash = p_asset_credential_hash;

    IF p_activation_method = 'qr' THEN
        SELECT activation.store_id INTO candidate_store_id
        FROM public.tower_device_activations AS activation
        WHERE activation.token_hash = p_activation_secret_hash;
    ELSE
        SELECT activation.store_id INTO candidate_store_id
        FROM public.tower_device_activations AS activation
        WHERE activation.fallback_code_hash = p_activation_secret_hash;
    END IF;

    IF candidate_asset_id IS NULL THEN RAISE EXCEPTION 'TOWER_ASSET_IDENTITY_INVALID'; END IF;
    IF candidate_store_id IS NULL THEN RAISE EXCEPTION 'TOWER_ACTIVATION_INVALID'; END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('tower-asset:' || candidate_asset_id::TEXT, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended('tower-store:' || candidate_store_id::TEXT, 0));

    SELECT asset.* INTO selected_asset
    FROM public.tower_assets AS asset
    WHERE asset.id = candidate_asset_id
      AND asset.enrollment_credential_hash = p_asset_credential_hash
    FOR UPDATE;

    IF selected_asset.id IS NULL OR selected_asset.status = 'retired' THEN
        RAISE EXCEPTION 'TOWER_ASSET_IDENTITY_INVALID';
    END IF;

    IF p_activation_method = 'qr' THEN
        SELECT activation.* INTO selected_activation
        FROM public.tower_device_activations AS activation
        WHERE activation.token_hash = p_activation_secret_hash
        FOR UPDATE;
    ELSE
        SELECT activation.* INTO selected_activation
        FROM public.tower_device_activations AS activation
        WHERE activation.fallback_code_hash = p_activation_secret_hash
        FOR UPDATE;
    END IF;

    IF selected_activation.id IS NULL
       OR selected_activation.status <> 'pending'
       OR selected_activation.expires_at <= NOW()
       OR selected_activation.store_id <> candidate_store_id
       OR (selected_activation.target_asset_id IS NOT NULL
           AND selected_activation.target_asset_id <> selected_asset.id) THEN
        RAISE EXCEPTION 'TOWER_ACTIVATION_INVALID';
    END IF;

    PERFORM 1 FROM public.stores AS store
    WHERE store.id = selected_activation.store_id
      AND store.tenant_id = selected_activation.tenant_id
      AND store.is_active = TRUE
      AND COALESCE(store.settings->>'tower_enabled', 'false') = 'true'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TOWER_STORE_INVALID'; END IF;

    SELECT device.* INTO existing_store_device
    FROM public.tower_devices AS device
    WHERE device.store_id = selected_activation.store_id AND device.status = 'active'
    FOR UPDATE;

    UPDATE public.tower_devices AS device
    SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
    WHERE device.status = 'active'
      AND (device.store_id = selected_activation.store_id OR device.asset_id = selected_asset.id);

    IF existing_store_device.asset_id IS NOT NULL
       AND existing_store_device.asset_id <> selected_asset.id THEN
        UPDATE public.tower_assets AS asset
        SET status = 'maintenance', current_store_id = NULL, updated_at = NOW()
        WHERE asset.id = existing_store_device.asset_id;
    END IF;

    INSERT INTO public.tower_devices(
        asset_id, tenant_id, store_id, activation_id, credential_hash,
        device_label, app_version, status, paired_at
    ) VALUES (
        selected_asset.id, selected_activation.tenant_id, selected_activation.store_id,
        selected_activation.id, p_device_credential_hash,
        COALESCE(NULLIF(BTRIM(p_device_label), ''), 'Torre Windows'),
        NULLIF(BTRIM(p_app_version), ''), 'active', NOW()
    ) RETURNING id, paired_at INTO created_device_id, created_paired_at;

    UPDATE public.tower_device_activations
    SET status = 'consumed', consumed_at = NOW(), revoked_at = NULL,
        target_asset_id = selected_asset.id
    WHERE id = selected_activation.id;

    UPDATE public.tower_assets
    SET status = 'assigned', current_store_id = selected_activation.store_id, updated_at = NOW()
    WHERE id = selected_asset.id;

    RETURN QUERY SELECT created_device_id, selected_asset.id, selected_asset.public_code,
        selected_activation.tenant_id, selected_activation.store_id, created_paired_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.reissue_tower_asset_activation(
    p_asset_id UUID,
    p_store_id BIGINT,
    p_token_hash TEXT,
    p_fallback_code_hash TEXT,
    p_admin_pin_hash TEXT,
    p_expires_at TIMESTAMPTZ,
    p_created_by UUID
)
RETURNS TABLE (tenant_id UUID, store_id BIGINT, activation_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    selected_asset public.tower_assets%ROWTYPE;
    resolved_tenant_id UUID;
    created_activation_id UUID;
BEGIN
    IF p_token_hash !~ '^[0-9a-f]{64}$'
       OR p_fallback_code_hash !~ '^[0-9a-f]{64}$'
       OR NULLIF(BTRIM(p_admin_pin_hash), '') IS NULL
       OR p_expires_at <= NOW() THEN
        RAISE EXCEPTION 'TOWER_ACTIVATION_INVALID';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('tower-asset:' || p_asset_id::TEXT, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended('tower-store:' || p_store_id::TEXT, 0));

    SELECT asset.* INTO selected_asset
    FROM public.tower_assets AS asset
    WHERE asset.id = p_asset_id
    FOR UPDATE;

    IF selected_asset.id IS NULL
       OR selected_asset.status NOT IN ('prepared', 'in_stock', 'assigned', 'maintenance')
       OR selected_asset.enrollment_credential_hash IS NULL THEN
        RAISE EXCEPTION 'TOWER_ASSET_NOT_PREPARED';
    END IF;

    SELECT store.tenant_id INTO resolved_tenant_id
    FROM public.stores AS store
    WHERE store.id = p_store_id AND store.is_active = TRUE
      AND COALESCE(store.settings->>'tower_enabled', 'false') = 'true'
    FOR UPDATE;

    IF resolved_tenant_id IS NULL THEN RAISE EXCEPTION 'TOWER_STORE_INVALID'; END IF;

    UPDATE public.tower_devices
    SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
    WHERE asset_id = p_asset_id AND status = 'active';

    UPDATE public.tower_assets
    SET status = 'maintenance', current_store_id = NULL, updated_at = NOW()
    WHERE id = p_asset_id AND status = 'assigned';

    UPDATE public.tower_device_activations
    SET status = 'revoked', revoked_at = NOW()
    WHERE status = 'pending'
      AND (store_id = p_store_id OR target_asset_id = p_asset_id);

    INSERT INTO public.tower_store_admin_pins(
        store_id, pin_hash, must_change, failed_attempts, locked_until,
        last_verified_at, created_by, updated_at
    ) VALUES (
        p_store_id, p_admin_pin_hash, TRUE, 0, NULL, NULL, p_created_by, NOW()
    ) ON CONFLICT ON CONSTRAINT tower_store_admin_pins_pkey DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash, must_change = TRUE, failed_attempts = 0,
        locked_until = NULL, last_verified_at = NULL,
        created_by = EXCLUDED.created_by, updated_at = NOW();

    INSERT INTO public.tower_device_activations(
        tenant_id, store_id, target_asset_id, token_hash,
        fallback_code_hash, expires_at, created_by
    ) VALUES (
        resolved_tenant_id, p_store_id, p_asset_id, p_token_hash,
        p_fallback_code_hash, p_expires_at, p_created_by
    ) RETURNING id INTO created_activation_id;

    RETURN QUERY SELECT resolved_tenant_id, p_store_id, created_activation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_tower_activation_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_tower_activation_rate_limit(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_tower_asset_batch_printed(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pair_tower_asset_device(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reissue_tower_asset_activation(UUID, BIGINT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_tower_activation_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_tower_activation_rate_limit(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_tower_asset_batch_printed(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.pair_tower_asset_device(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reissue_tower_asset_activation(UUID, BIGINT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) TO service_role;
