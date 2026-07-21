-- Evita colisao entre a variavel PL/pgSQL e a coluna local_customer_id.
CREATE OR REPLACE FUNCTION public.apply_tower_device_sync_event_v2(
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
    resolved_customer_id BIGINT;
    mapped_customer_id BIGINT;
    existing_customer_id BIGINT;
    existing_customer_name TEXT;
    existing_event public.tower_device_sync_events%ROWTYPE;
    normalized_name TEXT;
    normalized_phone TEXT;
    payload_local_customer_id UUID;
BEGIN
    IF p_device_id IS NULL OR p_event_id IS NULL OR p_entity_id IS NULL
       OR p_event_type NOT IN ('tower_customer.upsert', 'tower_session.upsert', 'tower_measurement.created')
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

        SELECT mapping.customer_id INTO mapped_customer_id
        FROM public.tower_device_customer_mappings AS mapping
        WHERE mapping.device_id = p_device_id
          AND mapping.local_customer_id = p_entity_id;
        RETURN mapped_customer_id;
    END IF;

    IF p_event_type = 'tower_customer.upsert' THEN
        normalized_name := BTRIM(p_payload->>'fullName');
        normalized_phone := regexp_replace(COALESCE(p_payload->>'mobilePhone', ''), '\D', '', 'g');

        IF length(normalized_name) NOT BETWEEN 3 AND 160
           OR length(normalized_phone) NOT BETWEEN 8 AND 20
           OR (p_payload->>'createdAt')::TIMESTAMPTZ > NOW() + INTERVAL '5 minutes' THEN
            RAISE EXCEPTION 'TOWER_SYNC_CUSTOMER_INVALID';
        END IF;

        PERFORM pg_advisory_xact_lock(hashtextextended(
            'tower-customer:' || resolved_store_id::TEXT || ':' || lower(normalized_name), 0
        ));

        SELECT mapping.customer_id INTO resolved_customer_id
        FROM public.tower_device_customer_mappings AS mapping
        WHERE mapping.device_id = p_device_id
          AND mapping.local_customer_id = p_entity_id;

        IF resolved_customer_id IS NULL THEN
            SELECT customer.id, customer.full_name
            INTO existing_customer_id, existing_customer_name
            FROM public.customers AS customer
            WHERE customer.store_id = resolved_store_id
              AND customer.tenant_id = resolved_tenant_id
              AND regexp_replace(COALESCE(customer.fone_movel, ''), '\D', '', 'g') = normalized_phone
            ORDER BY customer.id
            LIMIT 1
            FOR UPDATE;

            IF existing_customer_id IS NOT NULL
               AND lower(BTRIM(existing_customer_name)) <> lower(normalized_name) THEN
                RAISE EXCEPTION 'TOWER_SYNC_CUSTOMER_PHONE_CONFLICT';
            END IF;

            IF existing_customer_id IS NULL AND EXISTS (
                SELECT 1 FROM public.customers AS customer
                WHERE customer.store_id = resolved_store_id
                  AND customer.tenant_id = resolved_tenant_id
                  AND lower(BTRIM(customer.full_name)) = lower(normalized_name)
            ) THEN
                RAISE EXCEPTION 'TOWER_SYNC_CUSTOMER_NAME_CONFLICT';
            END IF;

            IF existing_customer_id IS NULL THEN
                INSERT INTO public.customers(tenant_id, store_id, full_name, fone_movel, created_at)
                VALUES (
                    resolved_tenant_id, resolved_store_id, normalized_name, normalized_phone,
                    (p_payload->>'createdAt')::TIMESTAMPTZ
                ) RETURNING id INTO resolved_customer_id;
            ELSE
                resolved_customer_id := existing_customer_id;
            END IF;

            INSERT INTO public.tower_device_customer_mappings(
                device_id, local_customer_id, tenant_id, store_id, customer_id
            ) VALUES (
                p_device_id, p_entity_id, resolved_tenant_id, resolved_store_id, resolved_customer_id
            ) ON CONFLICT (device_id, local_customer_id) DO UPDATE
            SET customer_id = EXCLUDED.customer_id, updated_at = NOW();
        END IF;

        INSERT INTO public.tower_device_sync_events(
            event_id, device_id, tenant_id, store_id, event_type, entity_id, payload_hash
        ) VALUES (
            p_event_id, p_device_id, resolved_tenant_id, resolved_store_id,
            p_event_type, p_entity_id, p_payload_hash
        );

        RETURN resolved_customer_id;
    END IF;

    IF p_event_type = 'tower_session.upsert' THEN
        payload_local_customer_id := NULLIF(p_payload->>'localCustomerId', '')::UUID;
        IF payload_local_customer_id IS NOT NULL THEN
            SELECT mapping.customer_id INTO resolved_customer_id
            FROM public.tower_device_customer_mappings AS mapping
            WHERE mapping.device_id = p_device_id
              AND mapping.local_customer_id = payload_local_customer_id
              AND mapping.tenant_id = resolved_tenant_id
              AND mapping.store_id = resolved_store_id;

            IF resolved_customer_id IS NULL THEN
                RAISE EXCEPTION 'TOWER_SYNC_CUSTOMER_DEPENDENCY_PENDING';
            END IF;
        END IF;
    END IF;

    PERFORM public.apply_tower_device_sync_event(
        p_device_id, p_event_id, p_event_type, p_entity_id, p_payload_hash, p_payload
    );

    IF p_event_type = 'tower_session.upsert' AND resolved_customer_id IS NOT NULL THEN
        UPDATE public.tower_sessions AS session
        SET customer_id = resolved_customer_id
        WHERE session.id = p_entity_id
          AND session.tenant_id = resolved_tenant_id
          AND session.store_id = resolved_store_id;
    END IF;

    RETURN resolved_customer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_tower_device_sync_event_v2(UUID, UUID, TEXT, UUID, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tower_device_sync_event_v2(UUID, UUID, TEXT, UUID, TEXT, JSONB)
    TO service_role;
