-- Passo 9: sincronizacao idempotente do SQLite local da Torre.
-- O dispositivo envia eventos sem credenciais de usuario; tenant e loja sao
-- sempre derivados do pareamento ativo no servidor.

ALTER TABLE public.tower_sessions
    ADD COLUMN IF NOT EXISTS source_device_id UUID NULL
    REFERENCES public.tower_devices(id) ON DELETE SET NULL;

ALTER TABLE public.tower_sessions
    ADD COLUMN IF NOT EXISTS device_updated_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS public.tower_device_sync_events (
    event_id UUID PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES public.tower_devices(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('tower_session.upsert', 'tower_measurement.created')),
    entity_id UUID NOT NULL,
    payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tower_device_sync_events_device_processed
    ON public.tower_device_sync_events(device_id, processed_at DESC);

ALTER TABLE public.tower_device_sync_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tower_device_sync_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_tower_device_sync_event(
    p_device_id UUID,
    p_event_id UUID,
    p_event_type TEXT,
    p_entity_id UUID,
    p_payload_hash TEXT,
    p_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_tenant_id UUID;
    resolved_store_id BIGINT;
    existing_event public.tower_device_sync_events%ROWTYPE;
    event_updated_at TIMESTAMPTZ;
    event_started_at TIMESTAMPTZ;
    event_created_at TIMESTAMPTZ;
    event_status TEXT;
    event_experience TEXT;
    measurement_session public.tower_sessions%ROWTYPE;
    measurement_version INTEGER;
BEGIN
    IF p_device_id IS NULL OR p_event_id IS NULL OR p_entity_id IS NULL
       OR p_event_type NOT IN ('tower_session.upsert', 'tower_measurement.created')
       OR p_payload_hash !~ '^[0-9a-f]{64}$'
       OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
       OR p_payload->>'id' IS DISTINCT FROM p_entity_id::TEXT THEN
        RAISE EXCEPTION 'TOWER_SYNC_EVENT_INVALID';
    END IF;

    SELECT device.tenant_id, device.store_id
    INTO resolved_tenant_id, resolved_store_id
    FROM public.tower_devices AS device
    WHERE device.id = p_device_id AND device.status = 'active'
    FOR UPDATE;

    IF resolved_tenant_id IS NULL OR resolved_store_id IS NULL THEN
        RAISE EXCEPTION 'TOWER_DEVICE_INVALID';
    END IF;

    SELECT event.* INTO existing_event
    FROM public.tower_device_sync_events AS event
    WHERE event.event_id = p_event_id;

    IF existing_event.event_id IS NOT NULL THEN
        IF existing_event.device_id <> p_device_id
           OR existing_event.event_type <> p_event_type
           OR existing_event.entity_id <> p_entity_id
           OR existing_event.payload_hash <> p_payload_hash THEN
            RAISE EXCEPTION 'TOWER_SYNC_EVENT_CONFLICT';
        END IF;
        RETURN;
    END IF;

    IF p_event_type = 'tower_session.upsert' THEN
        event_status := p_payload->>'status';
        event_experience := NULLIF(p_payload->>'currentExperience', '');
        event_started_at := (p_payload->>'startedAt')::TIMESTAMPTZ;
        event_updated_at := (p_payload->>'clientUpdatedAt')::TIMESTAMPTZ;

        IF event_status NOT IN ('active', 'completed', 'discarded', 'expired')
           OR (event_experience IS NOT NULL AND event_experience NOT IN (
                'look', 'visagismo', 'campo_visual', 'medidas', 'thickness'
           ))
           OR event_started_at IS NULL OR event_updated_at IS NULL
           OR event_started_at > NOW() + INTERVAL '5 minutes'
           OR event_updated_at > NOW() + INTERVAL '5 minutes'
           OR (p_payload->>'customerId') IS NOT NULL
           OR (p_payload->>'opticalEvaluationId') IS NOT NULL THEN
            RAISE EXCEPTION 'TOWER_SYNC_SESSION_INVALID';
        END IF;

        INSERT INTO public.tower_sessions(
            id, tenant_id, store_id, source_device_id, status,
            current_experience, started_at, completed_at, discarded_at,
            prescription_snapshot, device_updated_at
        ) VALUES (
            p_entity_id, resolved_tenant_id, resolved_store_id, p_device_id,
            event_status, event_experience, event_started_at,
            CASE WHEN event_status = 'completed' THEN (p_payload->>'completedAt')::TIMESTAMPTZ ELSE NULL END,
            CASE WHEN event_status = 'discarded' THEN (p_payload->>'discardedAt')::TIMESTAMPTZ ELSE NULL END,
            NULLIF(p_payload->'prescriptionSnapshot', 'null'::JSONB), event_updated_at
        )
        ON CONFLICT (id) DO UPDATE
        SET status = CASE
                WHEN tower_sessions.status = 'active' THEN EXCLUDED.status
                ELSE tower_sessions.status
            END,
            current_experience = CASE
                WHEN tower_sessions.status = 'active' THEN EXCLUDED.current_experience
                ELSE tower_sessions.current_experience
            END,
            completed_at = COALESCE(tower_sessions.completed_at, EXCLUDED.completed_at),
            discarded_at = COALESCE(tower_sessions.discarded_at, EXCLUDED.discarded_at),
            prescription_snapshot = COALESCE(EXCLUDED.prescription_snapshot, tower_sessions.prescription_snapshot),
            source_device_id = EXCLUDED.source_device_id,
            device_updated_at = EXCLUDED.device_updated_at
        WHERE tower_sessions.tenant_id = resolved_tenant_id
          AND tower_sessions.store_id = resolved_store_id
          AND COALESCE(tower_sessions.device_updated_at, '-infinity'::TIMESTAMPTZ) <= EXCLUDED.device_updated_at;

        IF NOT EXISTS (
            SELECT 1 FROM public.tower_sessions AS session
            WHERE session.id = p_entity_id
              AND session.tenant_id = resolved_tenant_id
              AND session.store_id = resolved_store_id
        ) THEN
            RAISE EXCEPTION 'TOWER_SYNC_SESSION_SCOPE_INVALID';
        END IF;
    ELSE
        SELECT session.* INTO measurement_session
        FROM public.tower_sessions AS session
        WHERE session.id = (p_payload->>'towerSessionId')::UUID
          AND session.tenant_id = resolved_tenant_id
          AND session.store_id = resolved_store_id
        FOR UPDATE;

        event_created_at := (p_payload->>'createdAt')::TIMESTAMPTZ;
        IF measurement_session.id IS NULL
           OR p_payload->>'lensMode' NOT IN ('multifocal', 'bifocal')
           OR (p_payload->>'referenceMm')::NUMERIC <= 0
           OR jsonb_typeof(p_payload->'frontMeasurements') <> 'object'
           OR jsonb_typeof(p_payload->'profileMeasurements') <> 'object'
           OR jsonb_typeof(p_payload->'attentionCodes') <> 'array'
           OR NULLIF(BTRIM(p_payload->>'algorithmVersion'), '') IS NULL
           OR event_created_at IS NULL
           OR event_created_at > NOW() + INTERVAL '5 minutes' THEN
            RAISE EXCEPTION 'TOWER_SYNC_MEASUREMENT_INVALID';
        END IF;

        SELECT COALESCE(MAX(result.version), 0) + 1
        INTO measurement_version
        FROM public.tower_measurement_results AS result
        WHERE result.tower_session_id = measurement_session.id;

        INSERT INTO public.tower_measurement_results(
            id, tenant_id, store_id, tower_session_id, customer_id,
            optical_evaluation_id, created_by_user_id, version, lens_mode,
            reference_mm, front_measurements, profile_measurements,
            attention_codes, algorithm_version, created_at
        ) VALUES (
            p_entity_id, resolved_tenant_id, resolved_store_id,
            measurement_session.id, measurement_session.customer_id,
            measurement_session.optical_evaluation_id, NULL,
            measurement_version, p_payload->>'lensMode',
            (p_payload->>'referenceMm')::NUMERIC,
            p_payload->'frontMeasurements', p_payload->'profileMeasurements',
            p_payload->'attentionCodes', p_payload->>'algorithmVersion',
            event_created_at
        ) ON CONFLICT (id) DO NOTHING;
    END IF;

    INSERT INTO public.tower_device_sync_events(
        event_id, device_id, tenant_id, store_id, event_type, entity_id, payload_hash
    ) VALUES (
        p_event_id, p_device_id, resolved_tenant_id, resolved_store_id,
        p_event_type, p_entity_id, p_payload_hash
    );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_tower_device_sync_event(UUID, UUID, TEXT, UUID, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tower_device_sync_event(UUID, UUID, TEXT, UUID, TEXT, JSONB)
    TO service_role;
