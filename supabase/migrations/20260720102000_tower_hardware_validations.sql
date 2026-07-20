-- Aprovações de hardware pertencem ao ativo físico da Torre. A loja e o
-- dispositivo que executaram o teste são preservados como contexto de auditoria.

CREATE TABLE IF NOT EXISTS public.tower_hardware_validations (
    id UUID PRIMARY KEY,
    tower_asset_id UUID NOT NULL REFERENCES public.tower_assets(id) ON DELETE CASCADE,
    tower_device_id UUID NOT NULL REFERENCES public.tower_devices(id) ON DELETE RESTRICT,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    hardware_fingerprint TEXT NOT NULL CHECK (hardware_fingerprint ~ '^[0-9a-f]{64}$'),
    hardware_snapshot JSONB NOT NULL,
    camera_approved_at TIMESTAMPTZ,
    touch_approved_at TIMESTAMPTZ,
    display_approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tower_asset_id, hardware_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_tower_hardware_validations_asset_updated
    ON public.tower_hardware_validations(tower_asset_id, updated_at DESC);

ALTER TABLE public.tower_hardware_validations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tower_hardware_validations FROM PUBLIC, anon, authenticated;

ALTER TABLE public.tower_device_sync_events
    DROP CONSTRAINT IF EXISTS tower_device_sync_events_event_type_check;
ALTER TABLE public.tower_device_sync_events
    ADD CONSTRAINT tower_device_sync_events_event_type_check
    CHECK (event_type IN (
        'tower_customer.upsert', 'tower_session.upsert', 'tower_measurement.created',
        'tower_hardware_validation.upsert'
    ));

CREATE OR REPLACE FUNCTION public.apply_tower_device_sync_event_v3(
    p_device_id UUID,
    p_event_id UUID,
    p_event_type TEXT,
    p_entity_id UUID,
    p_payload_hash TEXT,
    p_payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_tenant_id UUID;
    resolved_store_id BIGINT;
    resolved_asset_id UUID;
    existing_event public.tower_device_sync_events%ROWTYPE;
    resolved_validation_id UUID;
BEGIN
    IF p_event_type <> 'tower_hardware_validation.upsert' THEN
        RETURN public.apply_tower_device_sync_event_v2(
            p_device_id, p_event_id, p_event_type, p_entity_id, p_payload_hash, p_payload
        );
    END IF;

    IF p_payload->>'id' IS DISTINCT FROM p_entity_id::TEXT
        OR COALESCE(p_payload->>'hardwareFingerprint', '') !~ '^[0-9a-f]{64}$'
        OR jsonb_typeof(p_payload->'hardwareSnapshot') <> 'object' THEN
        RAISE EXCEPTION 'TOWER_SYNC_INVALID_HARDWARE_VALIDATION';
    END IF;

    SELECT device.tenant_id, device.store_id, device.asset_id
    INTO resolved_tenant_id, resolved_store_id, resolved_asset_id
    FROM public.tower_devices AS device
    WHERE device.id = p_device_id
      AND device.status = 'active';

    IF resolved_tenant_id IS NULL OR resolved_store_id IS NULL OR resolved_asset_id IS NULL THEN
        RAISE EXCEPTION 'TOWER_SYNC_DEVICE_NOT_ACTIVE';
    END IF;

    SELECT event.* INTO existing_event
    FROM public.tower_device_sync_events AS event
    WHERE event.event_id = p_event_id;

    IF existing_event.event_id IS NOT NULL THEN
        IF existing_event.device_id <> p_device_id
            OR existing_event.event_type <> p_event_type
            OR existing_event.entity_id <> p_entity_id
            OR existing_event.payload_hash <> p_payload_hash THEN
            RAISE EXCEPTION 'TOWER_SYNC_EVENT_REPLAY_CONFLICT';
        END IF;
        RETURN NULL;
    END IF;

    INSERT INTO public.tower_hardware_validations(
        id, tower_asset_id, tower_device_id, tenant_id, store_id,
        hardware_fingerprint, hardware_snapshot,
        camera_approved_at, touch_approved_at, display_approved_at, updated_at
    ) VALUES (
        p_entity_id, resolved_asset_id, p_device_id, resolved_tenant_id, resolved_store_id,
        p_payload->>'hardwareFingerprint', p_payload->'hardwareSnapshot',
        NULLIF(p_payload->>'cameraApprovedAt', '')::TIMESTAMPTZ,
        NULLIF(p_payload->>'touchApprovedAt', '')::TIMESTAMPTZ,
        NULLIF(p_payload->>'displayApprovedAt', '')::TIMESTAMPTZ,
        (p_payload->>'updatedAt')::TIMESTAMPTZ
    ) ON CONFLICT (tower_asset_id, hardware_fingerprint) DO UPDATE
    SET tower_device_id = EXCLUDED.tower_device_id,
        tenant_id = EXCLUDED.tenant_id,
        store_id = EXCLUDED.store_id,
        hardware_snapshot = EXCLUDED.hardware_snapshot,
        camera_approved_at = COALESCE(EXCLUDED.camera_approved_at, tower_hardware_validations.camera_approved_at),
        touch_approved_at = COALESCE(EXCLUDED.touch_approved_at, tower_hardware_validations.touch_approved_at),
        display_approved_at = COALESCE(EXCLUDED.display_approved_at, tower_hardware_validations.display_approved_at),
        updated_at = GREATEST(tower_hardware_validations.updated_at, EXCLUDED.updated_at)
    RETURNING id INTO resolved_validation_id;

    INSERT INTO public.tower_device_sync_events(
        event_id, device_id, tenant_id, store_id, event_type, entity_id, payload_hash
    ) VALUES (
        p_event_id, p_device_id, resolved_tenant_id, resolved_store_id,
        p_event_type, p_entity_id, p_payload_hash
    );

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_tower_device_sync_event_v3(UUID, UUID, TEXT, UUID, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tower_device_sync_event_v3(UUID, UUID, TEXT, UUID, TEXT, JSONB)
    TO service_role;
