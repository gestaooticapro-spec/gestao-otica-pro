-- Cada loja possui uma Torre ativa. Uma nova instalacao para a mesma loja
-- representa substituicao do equipamento anterior, que sera revogado durante
-- o pareamento atomico.
CREATE TABLE IF NOT EXISTS public.tower_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    activation_id UUID NOT NULL UNIQUE
        REFERENCES public.tower_device_activations(id) ON DELETE RESTRICT,
    credential_hash TEXT NOT NULL UNIQUE
        CHECK (credential_hash ~ '^[0-9a-f]{64}$'),
    device_label TEXT NOT NULL DEFAULT 'Torre Windows'
        CHECK (length(BTRIM(device_label)) BETWEEN 2 AND 120),
    app_version TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'revoked')),
    paired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (status = 'active' AND revoked_at IS NULL)
        OR (status = 'revoked' AND revoked_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS tower_devices_one_active_per_store_key
    ON public.tower_devices(store_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS tower_devices_tenant_store_idx
    ON public.tower_devices(tenant_id, store_id);

ALTER TABLE public.tower_devices ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tower_devices FROM PUBLIC;
REVOKE ALL ON TABLE public.tower_devices FROM anon;
REVOKE ALL ON TABLE public.tower_devices FROM authenticated;

CREATE OR REPLACE FUNCTION public.pair_tower_device(
    p_activation_method TEXT,
    p_activation_secret_hash TEXT,
    p_device_credential_hash TEXT,
    p_device_label TEXT,
    p_app_version TEXT
)
RETURNS TABLE (
    paired_device_id UUID,
    paired_tenant_id UUID,
    paired_store_id BIGINT,
    device_paired_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    selected_activation public.tower_device_activations%ROWTYPE;
    resolved_tenant_id UUID;
    created_device_id UUID;
    created_paired_at TIMESTAMPTZ;
    normalized_label TEXT := COALESCE(NULLIF(BTRIM(p_device_label), ''), 'Torre Windows');
    normalized_version TEXT := NULLIF(BTRIM(p_app_version), '');
BEGIN
    IF p_activation_method NOT IN ('qr', 'code') THEN
        RAISE EXCEPTION 'TOWER_ACTIVATION_INVALID';
    END IF;

    IF p_activation_secret_hash !~ '^[0-9a-f]{64}$'
       OR p_device_credential_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'TOWER_CREDENTIAL_INVALID';
    END IF;

    IF length(normalized_label) NOT BETWEEN 2 AND 120
       OR (normalized_version IS NOT NULL AND length(normalized_version) > 60) THEN
        RAISE EXCEPTION 'TOWER_DEVICE_METADATA_INVALID';
    END IF;

    IF p_activation_method = 'qr' THEN
        SELECT activation.*
        INTO selected_activation
        FROM public.tower_device_activations AS activation
        WHERE activation.token_hash = p_activation_secret_hash
        FOR UPDATE;
    ELSE
        SELECT activation.*
        INTO selected_activation
        FROM public.tower_device_activations AS activation
        WHERE activation.fallback_code_hash = p_activation_secret_hash
        FOR UPDATE;
    END IF;

    IF selected_activation.id IS NULL
       OR selected_activation.status <> 'pending'
       OR selected_activation.expires_at <= NOW() THEN
        RAISE EXCEPTION 'TOWER_ACTIVATION_INVALID';
    END IF;

    -- O bloqueio da loja serializa duas ativacoes concorrentes da mesma Torre.
    SELECT store.tenant_id
    INTO resolved_tenant_id
    FROM public.stores AS store
    WHERE store.id = selected_activation.store_id
      AND store.tenant_id = selected_activation.tenant_id
      AND store.is_active = TRUE
      AND COALESCE(store.settings->>'tower_enabled', 'false') = 'true'
    FOR UPDATE;

    IF resolved_tenant_id IS NULL THEN
        RAISE EXCEPTION 'TOWER_STORE_INVALID';
    END IF;

    UPDATE public.tower_devices AS device
    SET status = 'revoked',
        revoked_at = NOW(),
        updated_at = NOW()
    WHERE device.store_id = selected_activation.store_id
      AND device.status = 'active';

    INSERT INTO public.tower_devices (
        tenant_id,
        store_id,
        activation_id,
        credential_hash,
        device_label,
        app_version,
        status,
        paired_at
    )
    VALUES (
        selected_activation.tenant_id,
        selected_activation.store_id,
        selected_activation.id,
        p_device_credential_hash,
        normalized_label,
        normalized_version,
        'active',
        NOW()
    )
    RETURNING id, paired_at
    INTO created_device_id, created_paired_at;

    UPDATE public.tower_device_activations AS activation
    SET status = 'consumed',
        consumed_at = NOW(),
        revoked_at = NULL
    WHERE activation.id = selected_activation.id;

    RETURN QUERY
    SELECT
        created_device_id,
        selected_activation.tenant_id,
        selected_activation.store_id,
        created_paired_at;
END;
$$;

REVOKE ALL ON FUNCTION public.pair_tower_device(
    TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pair_tower_device(
    TEXT, TEXT, TEXT, TEXT, TEXT
) FROM anon;
REVOKE ALL ON FUNCTION public.pair_tower_device(
    TEXT, TEXT, TEXT, TEXT, TEXT
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pair_tower_device(
    TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;
