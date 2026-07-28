CREATE TABLE IF NOT EXISTS public.tower_admin_pin_recoveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    fallback_code_hash TEXT NOT NULL UNIQUE CHECK (fallback_code_hash ~ '^[0-9a-f]{64}$'),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'consumed', 'revoked')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    consumed_by_device_id UUID REFERENCES public.tower_devices(id) ON DELETE SET NULL,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS tower_admin_pin_recoveries_store_created_idx
    ON public.tower_admin_pin_recoveries(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tower_admin_pin_recoveries_pending_expiry_idx
    ON public.tower_admin_pin_recoveries(expires_at)
    WHERE status = 'pending';

ALTER TABLE public.tower_admin_pin_recoveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tower_admin_pin_recoveries FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.issue_tower_admin_pin_recovery(
    p_store_id BIGINT,
    p_token_hash TEXT,
    p_fallback_code_hash TEXT,
    p_expires_at TIMESTAMPTZ,
    p_created_by UUID
)
RETURNS TABLE (
    tenant_id UUID,
    store_id BIGINT,
    recovery_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_tenant_id UUID;
    created_recovery_id UUID;
BEGIN
    IF p_token_hash !~ '^[0-9a-f]{64}$'
       OR p_fallback_code_hash !~ '^[0-9a-f]{64}$'
       OR p_expires_at <= NOW() THEN
        RAISE EXCEPTION 'TOWER_PIN_RECOVERY_INVALID';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('tower-pin-recovery:' || p_store_id::TEXT, 0));

    SELECT store.tenant_id
    INTO resolved_tenant_id
    FROM public.stores AS store
    WHERE store.id = p_store_id
      AND store.is_active = TRUE
      AND COALESCE(store.settings->>'tower_enabled', 'false') = 'true'
    FOR UPDATE;

    IF resolved_tenant_id IS NULL THEN
        RAISE EXCEPTION 'TOWER_STORE_INVALID';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.tower_devices AS device
        WHERE device.store_id = p_store_id
          AND device.status = 'active'
    ) THEN
        RAISE EXCEPTION 'TOWER_DEVICE_NOT_ACTIVE';
    END IF;

    UPDATE public.tower_admin_pin_recoveries AS recovery
    SET status = 'revoked', revoked_at = NOW()
    WHERE recovery.store_id = p_store_id
      AND recovery.status = 'pending';

    INSERT INTO public.tower_admin_pin_recoveries(
        tenant_id, store_id, token_hash, fallback_code_hash,
        expires_at, created_by
    ) VALUES (
        resolved_tenant_id, p_store_id, p_token_hash, p_fallback_code_hash,
        p_expires_at, p_created_by
    )
    RETURNING id INTO created_recovery_id;

    RETURN QUERY SELECT resolved_tenant_id, p_store_id, created_recovery_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_tower_admin_pin_recovery(
    p_device_id UUID,
    p_store_id BIGINT,
    p_recovery_secret_hash TEXT,
    p_new_pin_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    selected_recovery public.tower_admin_pin_recoveries%ROWTYPE;
BEGIN
    IF p_recovery_secret_hash !~ '^[0-9a-f]{64}$'
       OR NULLIF(BTRIM(p_new_pin_hash), '') IS NULL THEN
        RETURN FALSE;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('tower-pin-recovery:' || p_store_id::TEXT, 0));

    IF NOT EXISTS (
        SELECT 1
        FROM public.tower_devices AS device
        WHERE device.id = p_device_id
          AND device.store_id = p_store_id
          AND device.status = 'active'
    ) THEN
        RETURN FALSE;
    END IF;

    SELECT recovery.*
    INTO selected_recovery
    FROM public.tower_admin_pin_recoveries AS recovery
    WHERE recovery.store_id = p_store_id
      AND recovery.status = 'pending'
      AND recovery.expires_at > NOW()
      AND (
          recovery.token_hash = p_recovery_secret_hash
          OR recovery.fallback_code_hash = p_recovery_secret_hash
      )
    FOR UPDATE;

    IF selected_recovery.id IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE public.tower_admin_pin_recoveries AS recovery
    SET status = 'consumed',
        consumed_by_device_id = p_device_id,
        consumed_at = NOW()
    WHERE recovery.id = selected_recovery.id;

    INSERT INTO public.tower_store_admin_pins(
        store_id, pin_hash, must_change, failed_attempts, locked_until,
        last_verified_at, updated_at
    ) VALUES (
        p_store_id, p_new_pin_hash, FALSE, 0, NULL, NOW(), NOW()
    )
    ON CONFLICT ON CONSTRAINT tower_store_admin_pins_pkey DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash,
        must_change = FALSE,
        failed_attempts = 0,
        locked_until = NULL,
        last_verified_at = NOW(),
        updated_at = NOW();

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_tower_admin_pin_recovery(
    BIGINT, TEXT, TEXT, TIMESTAMPTZ, UUID
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_tower_admin_pin_recovery(
    UUID, BIGINT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.issue_tower_admin_pin_recovery(
    BIGINT, TEXT, TEXT, TIMESTAMPTZ, UUID
) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_tower_admin_pin_recovery(
    UUID, BIGINT, TEXT, TEXT
) TO service_role;
