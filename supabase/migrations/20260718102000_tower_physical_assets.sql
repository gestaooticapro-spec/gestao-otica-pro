-- Identidade fisica permanente da Torre, separada do pareamento com uma loja.
-- O codigo publico pode ser impresso; credenciais e codigos temporarios ficam
-- somente como hash.
CREATE TABLE IF NOT EXISTS public.tower_asset_sequences (
    sequence_year INTEGER PRIMARY KEY CHECK (sequence_year BETWEEN 2020 AND 2200),
    last_value INTEGER NOT NULL DEFAULT 0 CHECK (last_value >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tower_asset_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_code TEXT NOT NULL UNIQUE,
    batch_name TEXT NOT NULL CHECK (length(BTRIM(batch_name)) BETWEEN 2 AND 120),
    sequence_year INTEGER NOT NULL CHECK (sequence_year BETWEEN 2020 AND 2200),
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
    status TEXT NOT NULL DEFAULT 'generated'
        CHECK (status IN ('generated', 'printed', 'closed')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    printed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tower_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_code TEXT NOT NULL UNIQUE
        CHECK (public_code ~ '^MBT-[0-9]{4}-[0-9]{6}$'),
    batch_id UUID NOT NULL REFERENCES public.tower_asset_batches(id) ON DELETE RESTRICT,
    serial_number TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'generated'
        CHECK (status IN (
            'generated', 'printed', 'prepared', 'in_stock',
            'assigned', 'maintenance', 'retired'
        )),
    enrollment_credential_hash TEXT UNIQUE
        CHECK (enrollment_credential_hash IS NULL OR enrollment_credential_hash ~ '^[0-9a-f]{64}$'),
    enrolled_device_label TEXT,
    enrolled_app_version TEXT,
    enrolled_at TIMESTAMPTZ,
    current_store_id BIGINT REFERENCES public.stores(id) ON DELETE SET NULL,
    label_applied_at TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((status = 'retired') = (retired_at IS NOT NULL)),
    CHECK ((status = 'assigned') = (current_store_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.tower_asset_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES public.tower_assets(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    fallback_code_hash TEXT NOT NULL UNIQUE CHECK (fallback_code_hash ~ '^[0-9a-f]{64}$'),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'consumed', 'revoked')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS tower_assets_batch_idx
    ON public.tower_assets(batch_id, public_code);
CREATE INDEX IF NOT EXISTS tower_assets_status_idx
    ON public.tower_assets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS tower_asset_enrollments_asset_idx
    ON public.tower_asset_enrollments(asset_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS tower_asset_enrollments_one_pending_key
    ON public.tower_asset_enrollments(asset_id)
    WHERE status = 'pending';

ALTER TABLE public.tower_devices
    ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES public.tower_assets(id) ON DELETE RESTRICT;
ALTER TABLE public.tower_device_activations
    ADD COLUMN IF NOT EXISTS target_asset_id UUID REFERENCES public.tower_assets(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS tower_devices_one_active_per_asset_key
    ON public.tower_devices(asset_id)
    WHERE status = 'active' AND asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tower_device_activations_target_asset_idx
    ON public.tower_device_activations(target_asset_id, status);

ALTER TABLE public.tower_asset_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tower_asset_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tower_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tower_asset_enrollments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tower_asset_sequences FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tower_asset_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tower_assets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tower_asset_enrollments FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_tower_asset_batch(
    p_batch_name TEXT,
    p_quantity INTEGER,
    p_sequence_year INTEGER,
    p_created_by UUID
)
RETURNS TABLE (
    created_batch_id UUID,
    created_batch_code TEXT,
    first_public_code TEXT,
    last_public_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    normalized_name TEXT := NULLIF(BTRIM(p_batch_name), '');
    first_sequence INTEGER;
    last_sequence INTEGER;
    batch_id UUID;
    batch_code TEXT;
BEGIN
    IF normalized_name IS NULL OR length(normalized_name) > 120
       OR p_quantity NOT BETWEEN 1 AND 1000
       OR p_sequence_year NOT BETWEEN 2020 AND 2200 THEN
        RAISE EXCEPTION 'TOWER_ASSET_BATCH_INVALID';
    END IF;

    INSERT INTO public.tower_asset_sequences(sequence_year, last_value)
    VALUES (p_sequence_year, 0)
    ON CONFLICT (sequence_year) DO NOTHING;

    SELECT sequence.last_value + 1, sequence.last_value + p_quantity
    INTO first_sequence, last_sequence
    FROM public.tower_asset_sequences AS sequence
    WHERE sequence.sequence_year = p_sequence_year
    FOR UPDATE;

    UPDATE public.tower_asset_sequences AS sequence
    SET last_value = last_sequence,
        updated_at = NOW()
    WHERE sequence.sequence_year = p_sequence_year;

    batch_code := 'LOT-' || p_sequence_year || '-' ||
        UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8));

    INSERT INTO public.tower_asset_batches(
        batch_code, batch_name, sequence_year, quantity, created_by
    )
    VALUES (batch_code, normalized_name, p_sequence_year, p_quantity, p_created_by)
    RETURNING id INTO batch_id;

    INSERT INTO public.tower_assets(public_code, batch_id)
    SELECT
        'MBT-' || p_sequence_year || '-' || LPAD(asset_number::TEXT, 6, '0'),
        batch_id
    FROM generate_series(first_sequence, last_sequence) AS asset_number;

    RETURN QUERY SELECT
        batch_id,
        batch_code,
        'MBT-' || p_sequence_year || '-' || LPAD(first_sequence::TEXT, 6, '0'),
        'MBT-' || p_sequence_year || '-' || LPAD(last_sequence::TEXT, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_tower_asset_enrollment(
    p_asset_id UUID,
    p_token_hash TEXT,
    p_fallback_code_hash TEXT,
    p_expires_at TIMESTAMPTZ,
    p_created_by UUID
)
RETURNS TABLE (enrollment_id UUID, asset_public_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    selected_asset public.tower_assets%ROWTYPE;
    created_enrollment_id UUID;
BEGIN
    IF p_token_hash !~ '^[0-9a-f]{64}$'
       OR p_fallback_code_hash !~ '^[0-9a-f]{64}$'
       OR p_expires_at <= NOW() THEN
        RAISE EXCEPTION 'TOWER_ASSET_ENROLLMENT_INVALID';
    END IF;

    SELECT asset.* INTO selected_asset
    FROM public.tower_assets AS asset
    WHERE asset.id = p_asset_id
    FOR UPDATE;

    IF selected_asset.id IS NULL OR selected_asset.status = 'retired' THEN
        RAISE EXCEPTION 'TOWER_ASSET_INVALID';
    END IF;

    UPDATE public.tower_asset_enrollments AS enrollment
    SET status = 'revoked', revoked_at = NOW()
    WHERE enrollment.asset_id = p_asset_id AND enrollment.status = 'pending';

    INSERT INTO public.tower_asset_enrollments(
        asset_id, token_hash, fallback_code_hash, expires_at, created_by
    ) VALUES (
        p_asset_id, p_token_hash, p_fallback_code_hash, p_expires_at, p_created_by
    ) RETURNING id INTO created_enrollment_id;

    RETURN QUERY SELECT created_enrollment_id, selected_asset.public_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.enroll_tower_asset(
    p_method TEXT,
    p_public_code TEXT,
    p_secret_hash TEXT,
    p_asset_credential_hash TEXT,
    p_device_label TEXT,
    p_app_version TEXT
)
RETURNS TABLE (
    enrolled_asset_id UUID,
    enrolled_public_code TEXT,
    asset_enrolled_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    selected_enrollment public.tower_asset_enrollments%ROWTYPE;
    selected_asset public.tower_assets%ROWTYPE;
    enrollment_time TIMESTAMPTZ := NOW();
    normalized_label TEXT := NULLIF(BTRIM(p_device_label), '');
BEGIN
    IF p_method NOT IN ('qr', 'code')
       OR p_public_code !~ '^MBT-[0-9]{4}-[0-9]{6}$'
       OR p_secret_hash !~ '^[0-9a-f]{64}$'
       OR p_asset_credential_hash !~ '^[0-9a-f]{64}$'
       OR normalized_label IS NULL OR length(normalized_label) > 120 THEN
        RAISE EXCEPTION 'TOWER_ASSET_ENROLLMENT_INVALID';
    END IF;

    IF p_method = 'qr' THEN
        SELECT enrollment.* INTO selected_enrollment
        FROM public.tower_asset_enrollments AS enrollment
        JOIN public.tower_assets AS asset ON asset.id = enrollment.asset_id
        WHERE enrollment.token_hash = p_secret_hash
          AND asset.public_code = p_public_code
        FOR UPDATE OF enrollment;
    ELSE
        SELECT enrollment.* INTO selected_enrollment
        FROM public.tower_asset_enrollments AS enrollment
        JOIN public.tower_assets AS asset ON asset.id = enrollment.asset_id
        WHERE enrollment.fallback_code_hash = p_secret_hash
          AND asset.public_code = p_public_code
        FOR UPDATE OF enrollment;
    END IF;

    IF selected_enrollment.id IS NULL
       OR selected_enrollment.status <> 'pending'
       OR selected_enrollment.expires_at <= NOW() THEN
        RAISE EXCEPTION 'TOWER_ASSET_ENROLLMENT_INVALID';
    END IF;

    SELECT asset.* INTO selected_asset
    FROM public.tower_assets AS asset
    WHERE asset.id = selected_enrollment.asset_id
    FOR UPDATE;

    IF selected_asset.status = 'retired' THEN
        RAISE EXCEPTION 'TOWER_ASSET_INVALID';
    END IF;

    UPDATE public.tower_assets AS asset
    SET enrollment_credential_hash = p_asset_credential_hash,
        enrolled_device_label = normalized_label,
        enrolled_app_version = NULLIF(BTRIM(p_app_version), ''),
        enrolled_at = enrollment_time,
        status = CASE WHEN asset.current_store_id IS NULL THEN 'prepared' ELSE 'assigned' END,
        updated_at = NOW()
    WHERE asset.id = selected_asset.id;

    UPDATE public.tower_asset_enrollments AS enrollment
    SET status = 'consumed', consumed_at = enrollment_time, revoked_at = NULL
    WHERE enrollment.id = selected_enrollment.id;

    RETURN QUERY SELECT selected_asset.id, selected_asset.public_code, enrollment_time;
END;
$$;

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

    SELECT asset.* INTO selected_asset
    FROM public.tower_assets AS asset
    WHERE asset.enrollment_credential_hash = p_asset_credential_hash
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
    WHERE device.store_id = selected_activation.store_id
      AND device.status = 'active'
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
        selected_asset.id, selected_activation.tenant_id,
        selected_activation.store_id, selected_activation.id,
        p_device_credential_hash,
        COALESCE(NULLIF(BTRIM(p_device_label), ''), 'Torre Windows'),
        NULLIF(BTRIM(p_app_version), ''), 'active', NOW()
    ) RETURNING id, paired_at INTO created_device_id, created_paired_at;

    UPDATE public.tower_device_activations AS activation
    SET status = 'consumed', consumed_at = NOW(), revoked_at = NULL,
        target_asset_id = selected_asset.id
    WHERE activation.id = selected_activation.id;

    UPDATE public.tower_assets AS asset
    SET status = 'assigned', current_store_id = selected_activation.store_id,
        updated_at = NOW()
    WHERE asset.id = selected_asset.id;

    RETURN QUERY SELECT
        created_device_id, selected_asset.id, selected_asset.public_code,
        selected_activation.tenant_id, selected_activation.store_id,
        created_paired_at;
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
    WHERE store.id = p_store_id
      AND store.is_active = TRUE
      AND COALESCE(store.settings->>'tower_enabled', 'false') = 'true'
    FOR UPDATE;

    IF resolved_tenant_id IS NULL THEN
        RAISE EXCEPTION 'TOWER_STORE_INVALID';
    END IF;

    -- Uma nova associacao explicita encerra o vinculo comercial anterior do
    -- mesmo equipamento, mas preserva sua identidade fisica permanente.
    UPDATE public.tower_devices AS device
    SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
    WHERE device.asset_id = p_asset_id AND device.status = 'active';

    UPDATE public.tower_assets AS asset
    SET status = 'maintenance', current_store_id = NULL, updated_at = NOW()
    WHERE asset.id = p_asset_id AND asset.status = 'assigned';

    UPDATE public.tower_device_activations AS activation
    SET status = 'revoked', revoked_at = NOW()
    WHERE activation.status = 'pending'
      AND (activation.store_id = p_store_id OR activation.target_asset_id = p_asset_id);

    INSERT INTO public.tower_store_admin_pins(
        store_id, pin_hash, must_change, failed_attempts, locked_until,
        last_verified_at, created_by, updated_at
    ) VALUES (
        p_store_id, p_admin_pin_hash, TRUE, 0, NULL, NULL, p_created_by, NOW()
    )
    ON CONFLICT ON CONSTRAINT tower_store_admin_pins_pkey DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash,
        must_change = TRUE,
        failed_attempts = 0,
        locked_until = NULL,
        last_verified_at = NULL,
        created_by = EXCLUDED.created_by,
        updated_at = NOW();

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

CREATE OR REPLACE FUNCTION public.set_tower_asset_lifecycle_status(
    p_asset_id UUID,
    p_status TEXT
)
RETURNS public.tower_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    selected_asset public.tower_assets%ROWTYPE;
    updated_asset public.tower_assets%ROWTYPE;
BEGIN
    IF p_status NOT IN ('in_stock', 'maintenance', 'retired') THEN
        RAISE EXCEPTION 'TOWER_ASSET_STATUS_INVALID';
    END IF;

    SELECT asset.* INTO selected_asset
    FROM public.tower_assets AS asset
    WHERE asset.id = p_asset_id
    FOR UPDATE;

    IF selected_asset.id IS NULL OR selected_asset.status = 'retired' THEN
        RAISE EXCEPTION 'TOWER_ASSET_INVALID';
    END IF;

    IF p_status = 'in_stock'
       AND selected_asset.status NOT IN ('prepared', 'maintenance', 'in_stock') THEN
        RAISE EXCEPTION 'TOWER_ASSET_STATUS_INVALID';
    END IF;

    IF p_status IN ('maintenance', 'retired') THEN
        UPDATE public.tower_devices AS device
        SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
        WHERE device.asset_id = p_asset_id AND device.status = 'active';
    END IF;

    UPDATE public.tower_assets AS asset
    SET status = p_status,
        current_store_id = NULL,
        enrollment_credential_hash = CASE
            WHEN p_status = 'retired' THEN NULL
            ELSE asset.enrollment_credential_hash
        END,
        retired_at = CASE WHEN p_status = 'retired' THEN NOW() ELSE NULL END,
        updated_at = NOW()
    WHERE asset.id = p_asset_id
    RETURNING asset.* INTO updated_asset;

    RETURN updated_asset;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tower_asset_batch(TEXT, INTEGER, INTEGER, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_tower_asset_enrollment(UUID, TEXT, TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enroll_tower_asset(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pair_tower_asset_device(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reissue_tower_asset_activation(UUID, BIGINT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_tower_asset_lifecycle_status(UUID, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_tower_asset_batch(TEXT, INTEGER, INTEGER, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_tower_asset_enrollment(UUID, TEXT, TEXT, TIMESTAMPTZ, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.enroll_tower_asset(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pair_tower_asset_device(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reissue_tower_asset_activation(UUID, BIGINT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_tower_asset_lifecycle_status(UUID, TEXT) TO service_role;
