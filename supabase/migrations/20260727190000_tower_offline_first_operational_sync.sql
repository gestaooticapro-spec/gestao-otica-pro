-- Completa o contrato offline-first da Torre. Campo Visual e avaliacao usam
-- UUID local; a avaliacao recebe um mapeamento para o BIGINT do banco central.

CREATE TABLE IF NOT EXISTS public.tower_device_evaluation_mappings (
    device_id UUID NOT NULL REFERENCES public.tower_devices(id) ON DELETE CASCADE,
    local_evaluation_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    optical_evaluation_id BIGINT NOT NULL REFERENCES public.optical_evaluations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (device_id, local_evaluation_id),
    UNIQUE (device_id, optical_evaluation_id)
);

CREATE INDEX IF NOT EXISTS idx_tower_device_evaluation_mappings_remote
    ON public.tower_device_evaluation_mappings(optical_evaluation_id);

ALTER TABLE public.tower_device_evaluation_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tower_device_evaluation_mappings FROM PUBLIC, anon, authenticated;

ALTER TABLE public.tower_device_sync_events
    DROP CONSTRAINT IF EXISTS tower_device_sync_events_event_type_check;
ALTER TABLE public.tower_device_sync_events
    ADD CONSTRAINT tower_device_sync_events_event_type_check
    CHECK (event_type IN (
        'tower_customer.upsert',
        'tower_session.upsert',
        'tower_heatmap.upsert',
        'tower_evaluation.upsert',
        'tower_measurement.created',
        'tower_hardware_validation.upsert'
    ));

CREATE OR REPLACE FUNCTION public.apply_tower_device_sync_event_v4(
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
    existing_event public.tower_device_sync_events%ROWTYPE;
    resolved_session public.tower_sessions%ROWTYPE;
    resolved_customer_id BIGINT;
    resolved_customer_name TEXT;
    resolved_evaluation_id BIGINT;
    mapped_evaluation_id BIGINT;
    requested_remote_customer_id BIGINT;
    normalized_name TEXT;
    normalized_phone TEXT;
    conflicting_customer_id BIGINT;
    evaluation_payload JSONB;
    recommendation_payload JSONB;
BEGIN
    IF p_event_type NOT IN (
        'tower_customer.upsert',
        'tower_heatmap.upsert',
        'tower_evaluation.upsert'
    ) THEN
        RETURN public.apply_tower_device_sync_event_v3(
            p_device_id, p_event_id, p_event_type, p_entity_id, p_payload_hash, p_payload
        );
    END IF;

    IF p_device_id IS NULL OR p_event_id IS NULL OR p_entity_id IS NULL
       OR p_payload_hash !~ '^[0-9a-f]{64}$'
       OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
       OR p_payload->>'id' IS DISTINCT FROM p_entity_id::TEXT THEN
        RAISE EXCEPTION 'TOWER_SYNC_EVENT_INVALID';
    END IF;

    SELECT device.tenant_id, device.store_id
    INTO resolved_tenant_id, resolved_store_id
    FROM public.tower_devices AS device
    WHERE device.id = p_device_id
      AND device.status = 'active'
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
        IF p_event_type = 'tower_evaluation.upsert' THEN
            SELECT mapping.optical_evaluation_id
            INTO mapped_evaluation_id
            FROM public.tower_device_evaluation_mappings AS mapping
            WHERE mapping.device_id = p_device_id
              AND mapping.local_evaluation_id = p_entity_id;
            RETURN mapped_evaluation_id;
        END IF;
        IF p_event_type = 'tower_customer.upsert' THEN
            SELECT mapping.customer_id
            INTO resolved_customer_id
            FROM public.tower_device_customer_mappings AS mapping
            WHERE mapping.device_id = p_device_id
              AND mapping.local_customer_id = p_entity_id;
            RETURN resolved_customer_id;
        END IF;
        RETURN NULL;
    END IF;

    IF p_event_type = 'tower_customer.upsert' THEN
        normalized_name := BTRIM(p_payload->>'fullName');
        normalized_phone := regexp_replace(COALESCE(p_payload->>'mobilePhone', ''), '\D', '', 'g');

        IF length(normalized_name) NOT BETWEEN 3 AND 160
           OR length(normalized_phone) NOT BETWEEN 8 AND 20
           OR (p_payload->>'createdAt')::TIMESTAMPTZ > NOW() + INTERVAL '5 minutes'
           OR (
                p_payload ? 'remoteCustomerId'
                AND p_payload->'remoteCustomerId' <> 'null'::JSONB
                AND (p_payload->>'remoteCustomerId') !~ '^[1-9][0-9]*$'
           ) THEN
            RAISE EXCEPTION 'TOWER_SYNC_CUSTOMER_INVALID';
        END IF;

        requested_remote_customer_id :=
            NULLIF(p_payload->>'remoteCustomerId', '')::BIGINT;

        SELECT mapping.customer_id
        INTO resolved_customer_id
        FROM public.tower_device_customer_mappings AS mapping
        WHERE mapping.device_id = p_device_id
          AND mapping.local_customer_id = p_entity_id
          AND mapping.tenant_id = resolved_tenant_id
          AND mapping.store_id = resolved_store_id;

        -- Clientes baixados no snapshot ja possuem o BIGINT central, mas ainda
        -- nao possuem mapeamento UUID neste dispositivo. O ID so e aceito
        -- depois de novamente validado no tenant e na loja derivados da Torre.
        IF resolved_customer_id IS NULL AND requested_remote_customer_id IS NOT NULL THEN
            SELECT customer.id
            INTO resolved_customer_id
            FROM public.customers AS customer
            WHERE customer.id = requested_remote_customer_id
              AND customer.tenant_id = resolved_tenant_id
              AND customer.store_id = resolved_store_id
            FOR UPDATE;

            IF resolved_customer_id IS NULL THEN
                RAISE EXCEPTION 'TOWER_SYNC_CUSTOMER_SCOPE_INVALID';
            END IF;

            INSERT INTO public.tower_device_customer_mappings(
                device_id, local_customer_id, tenant_id, store_id, customer_id
            ) VALUES (
                p_device_id, p_entity_id, resolved_tenant_id, resolved_store_id, resolved_customer_id
            )
            ON CONFLICT (device_id, local_customer_id) DO UPDATE
            SET customer_id = EXCLUDED.customer_id,
                tenant_id = EXCLUDED.tenant_id,
                store_id = EXCLUDED.store_id,
                updated_at = NOW();
        END IF;

        -- A primeira sincronizacao de um cliente criado offline continua usando
        -- o fluxo v3, que resolve duplicidade e cria o mapeamento atomicamente.
        IF resolved_customer_id IS NULL THEN
            RETURN public.apply_tower_device_sync_event_v3(
                p_device_id, p_event_id, p_event_type, p_entity_id, p_payload_hash, p_payload
            );
        END IF;

        PERFORM pg_advisory_xact_lock(hashtextextended(
            'tower-customer:' || resolved_store_id::TEXT || ':' || lower(normalized_name), 0
        ));

        SELECT customer.id
        INTO conflicting_customer_id
        FROM public.customers AS customer
        WHERE customer.tenant_id = resolved_tenant_id
          AND customer.store_id = resolved_store_id
          AND customer.id <> resolved_customer_id
          AND regexp_replace(COALESCE(customer.fone_movel, ''), '\D', '', 'g') = normalized_phone
        ORDER BY customer.id
        LIMIT 1
        FOR UPDATE;
        IF conflicting_customer_id IS NOT NULL THEN
            RAISE EXCEPTION 'TOWER_SYNC_CUSTOMER_PHONE_CONFLICT';
        END IF;

        conflicting_customer_id := NULL;
        SELECT customer.id
        INTO conflicting_customer_id
        FROM public.customers AS customer
        WHERE customer.tenant_id = resolved_tenant_id
          AND customer.store_id = resolved_store_id
          AND customer.id <> resolved_customer_id
          AND lower(BTRIM(customer.full_name)) = lower(normalized_name)
        ORDER BY customer.id
        LIMIT 1
        FOR UPDATE;
        IF conflicting_customer_id IS NOT NULL THEN
            RAISE EXCEPTION 'TOWER_SYNC_CUSTOMER_NAME_CONFLICT';
        END IF;

        UPDATE public.customers AS customer
        SET full_name = normalized_name,
            fone_movel = normalized_phone,
            updated_at = NOW()
        WHERE customer.id = resolved_customer_id
          AND customer.tenant_id = resolved_tenant_id
          AND customer.store_id = resolved_store_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'TOWER_SYNC_CUSTOMER_SCOPE_INVALID';
        END IF;

        INSERT INTO public.tower_device_sync_events(
            event_id, device_id, tenant_id, store_id, event_type, entity_id, payload_hash
        ) VALUES (
            p_event_id, p_device_id, resolved_tenant_id, resolved_store_id,
            p_event_type, p_entity_id, p_payload_hash
        );
        RETURN resolved_customer_id;
    END IF;

    SELECT session.* INTO resolved_session
    FROM public.tower_sessions AS session
    WHERE session.id = NULLIF(p_payload->>'towerSessionId', '')::UUID
      AND session.tenant_id = resolved_tenant_id
      AND session.store_id = resolved_store_id
    FOR UPDATE;

    IF resolved_session.id IS NULL THEN
        RAISE EXCEPTION 'TOWER_SYNC_SESSION_DEPENDENCY_PENDING';
    END IF;

    IF p_event_type = 'tower_heatmap.upsert' THEN
        IF p_payload->>'status' NOT IN ('created', 'running', 'completed', 'cancelled', 'failed')
           OR NULLIF(BTRIM(p_payload->>'algorithmVersion'), '') IS NULL
           OR NULLIF(BTRIM(p_payload->>'targetPlanVersion'), '') IS NULL
           OR (p_payload->>'clientUpdatedAt')::TIMESTAMPTZ > NOW() + INTERVAL '5 minutes'
           OR (
                p_payload->>'status' = 'completed'
                AND (
                    jsonb_typeof(p_payload->'resultSummary') <> 'object'
                    OR jsonb_typeof(p_payload->'targetSamples') <> 'array'
                    OR NULLIF(p_payload->>'completedAt', '') IS NULL
                )
           ) THEN
            RAISE EXCEPTION 'TOWER_SYNC_HEATMAP_INVALID';
        END IF;

        INSERT INTO public.tower_heatmap_sessions(
            id, tenant_id, store_id, tower_session_id, customer_id,
            optical_evaluation_id, created_by_user_id, status,
            algorithm_version, target_plan_version, result_summary,
            target_samples, started_at, completed_at, cancelled_at
        ) VALUES (
            p_entity_id, resolved_tenant_id, resolved_store_id, resolved_session.id,
            resolved_session.customer_id, resolved_session.optical_evaluation_id, NULL,
            p_payload->>'status', p_payload->>'algorithmVersion',
            p_payload->>'targetPlanVersion',
            NULLIF(p_payload->'resultSummary', 'null'::JSONB),
            NULLIF(p_payload->'targetSamples', 'null'::JSONB),
            NULLIF(p_payload->>'startedAt', '')::TIMESTAMPTZ,
            NULLIF(p_payload->>'completedAt', '')::TIMESTAMPTZ,
            NULLIF(p_payload->>'cancelledAt', '')::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE
        SET tower_session_id = EXCLUDED.tower_session_id,
            customer_id = COALESCE(EXCLUDED.customer_id, tower_heatmap_sessions.customer_id),
            optical_evaluation_id = COALESCE(EXCLUDED.optical_evaluation_id, tower_heatmap_sessions.optical_evaluation_id),
            status = EXCLUDED.status,
            algorithm_version = EXCLUDED.algorithm_version,
            target_plan_version = EXCLUDED.target_plan_version,
            result_summary = EXCLUDED.result_summary,
            target_samples = EXCLUDED.target_samples,
            started_at = EXCLUDED.started_at,
            completed_at = EXCLUDED.completed_at,
            cancelled_at = EXCLUDED.cancelled_at
        WHERE tower_heatmap_sessions.tenant_id = resolved_tenant_id
          AND tower_heatmap_sessions.store_id = resolved_store_id;

        IF NOT EXISTS (
            SELECT 1 FROM public.tower_heatmap_sessions AS heatmap
            WHERE heatmap.id = p_entity_id
              AND heatmap.tenant_id = resolved_tenant_id
              AND heatmap.store_id = resolved_store_id
        ) THEN
            RAISE EXCEPTION 'TOWER_SYNC_HEATMAP_SCOPE_INVALID';
        END IF;
    ELSE
        evaluation_payload := p_payload->'evaluation';
        recommendation_payload := NULLIF(p_payload->'recommendations', 'null'::JSONB);
        IF jsonb_typeof(evaluation_payload) <> 'object'
           OR (
                recommendation_payload IS NOT NULL
                AND jsonb_typeof(recommendation_payload) <> 'array'
           )
           OR (p_payload->>'clientUpdatedAt')::TIMESTAMPTZ > NOW() + INTERVAL '5 minutes' THEN
            RAISE EXCEPTION 'TOWER_SYNC_EVALUATION_INVALID';
        END IF;

        SELECT mapping.customer_id, customer.full_name
        INTO resolved_customer_id, resolved_customer_name
        FROM public.tower_device_customer_mappings AS mapping
        JOIN public.customers AS customer
          ON customer.id = mapping.customer_id
         AND customer.tenant_id = mapping.tenant_id
         AND customer.store_id = mapping.store_id
        WHERE mapping.device_id = p_device_id
          AND mapping.local_customer_id = NULLIF(p_payload->>'localCustomerId', '')::UUID
          AND mapping.tenant_id = resolved_tenant_id
          AND mapping.store_id = resolved_store_id;

        IF resolved_customer_id IS NULL THEN
            RAISE EXCEPTION 'TOWER_SYNC_CUSTOMER_DEPENDENCY_PENDING';
        END IF;

        SELECT mapping.optical_evaluation_id INTO resolved_evaluation_id
        FROM public.tower_device_evaluation_mappings AS mapping
        WHERE mapping.device_id = p_device_id
          AND mapping.local_evaluation_id = p_entity_id;

        IF resolved_evaluation_id IS NULL THEN
            INSERT INTO public.optical_evaluations(
                tenant_id, store_id, evaluated_customer_id, responsible_customer_id,
                source_system, status, parse_status, evaluated_name_snapshot,
                responsible_name_snapshot, relationship_snapshot, age_years,
                estilo_vida_uso_computador_horas, estilo_vida_dirigir_horas,
                estilo_vida_leitura_horas, estilo_vida_uso_celular_horas,
                estilo_vida_exposicao_sol_horas, estilo_vida_ambiente_interno_horas,
                estilo_vida_ambiente_externo_horas, estilo_vida_assistir_tv_horas,
                receita_longe_od_esferico, receita_longe_od_cilindrico,
                receita_longe_od_eixo, receita_longe_oe_esferico,
                receita_longe_oe_cilindrico, receita_longe_oe_eixo,
                receita_adicao, raw_payload_json, recommended_items,
                recommended_lens_name, updated_at
            ) VALUES (
                resolved_tenant_id, resolved_store_id, resolved_customer_id, resolved_customer_id,
                'manual', 'em_andamento', 'success',
                COALESCE(NULLIF(BTRIM(evaluation_payload->>'evaluatedNameSnapshot'), ''), resolved_customer_name),
                COALESCE(NULLIF(BTRIM(evaluation_payload->>'responsibleNameSnapshot'), ''), resolved_customer_name),
                COALESCE(NULLIF(BTRIM(evaluation_payload->>'relationshipSnapshot'), ''), 'Titular'),
                NULLIF(evaluation_payload->>'ageYears', '')::INTEGER,
                NULLIF(evaluation_payload->>'estiloVidaUsoComputadorHoras', '')::NUMERIC,
                NULLIF(evaluation_payload->>'estiloVidaDirigirHoras', '')::NUMERIC,
                NULLIF(evaluation_payload->>'estiloVidaLeituraHoras', '')::NUMERIC,
                NULLIF(evaluation_payload->>'estiloVidaUsoCelularHoras', '')::NUMERIC,
                NULLIF(evaluation_payload->>'estiloVidaExposicaoSolHoras', '')::NUMERIC,
                NULLIF(evaluation_payload->>'estiloVidaAmbienteInternoHoras', '')::NUMERIC,
                NULLIF(evaluation_payload->>'estiloVidaAmbienteExternoHoras', '')::NUMERIC,
                NULLIF(evaluation_payload->>'estiloVidaAssistirTvHoras', '')::NUMERIC,
                NULLIF(BTRIM(evaluation_payload->>'receitaLongeOdEsferico'), ''),
                NULLIF(BTRIM(evaluation_payload->>'receitaLongeOdCilindrico'), ''),
                NULLIF(BTRIM(evaluation_payload->>'receitaLongeOdEixo'), ''),
                NULLIF(BTRIM(evaluation_payload->>'receitaLongeOeEsferico'), ''),
                NULLIF(BTRIM(evaluation_payload->>'receitaLongeOeCilindrico'), ''),
                NULLIF(BTRIM(evaluation_payload->>'receitaLongeOeEixo'), ''),
                NULLIF(BTRIM(evaluation_payload->>'receitaAdicao'), ''),
                COALESCE(evaluation_payload->'rawPayloadJson', '{}'::JSONB),
                recommendation_payload,
                NULLIF(recommendation_payload->0->>'familyName', ''),
                (p_payload->>'clientUpdatedAt')::TIMESTAMPTZ
            )
            RETURNING id INTO resolved_evaluation_id;

            INSERT INTO public.tower_device_evaluation_mappings(
                device_id, local_evaluation_id, tenant_id, store_id, optical_evaluation_id
            ) VALUES (
                p_device_id, p_entity_id, resolved_tenant_id, resolved_store_id, resolved_evaluation_id
            );
        ELSE
            UPDATE public.optical_evaluations AS evaluation
            SET evaluated_customer_id = resolved_customer_id,
                responsible_customer_id = resolved_customer_id,
                evaluated_name_snapshot = COALESCE(NULLIF(BTRIM(evaluation_payload->>'evaluatedNameSnapshot'), ''), evaluation.evaluated_name_snapshot),
                responsible_name_snapshot = COALESCE(NULLIF(BTRIM(evaluation_payload->>'responsibleNameSnapshot'), ''), evaluation.responsible_name_snapshot),
                relationship_snapshot = COALESCE(NULLIF(BTRIM(evaluation_payload->>'relationshipSnapshot'), ''), evaluation.relationship_snapshot, 'Titular'),
                age_years = NULLIF(evaluation_payload->>'ageYears', '')::INTEGER,
                estilo_vida_uso_computador_horas = NULLIF(evaluation_payload->>'estiloVidaUsoComputadorHoras', '')::NUMERIC,
                estilo_vida_dirigir_horas = NULLIF(evaluation_payload->>'estiloVidaDirigirHoras', '')::NUMERIC,
                estilo_vida_leitura_horas = NULLIF(evaluation_payload->>'estiloVidaLeituraHoras', '')::NUMERIC,
                estilo_vida_uso_celular_horas = NULLIF(evaluation_payload->>'estiloVidaUsoCelularHoras', '')::NUMERIC,
                estilo_vida_exposicao_sol_horas = NULLIF(evaluation_payload->>'estiloVidaExposicaoSolHoras', '')::NUMERIC,
                estilo_vida_ambiente_interno_horas = NULLIF(evaluation_payload->>'estiloVidaAmbienteInternoHoras', '')::NUMERIC,
                estilo_vida_ambiente_externo_horas = NULLIF(evaluation_payload->>'estiloVidaAmbienteExternoHoras', '')::NUMERIC,
                estilo_vida_assistir_tv_horas = NULLIF(evaluation_payload->>'estiloVidaAssistirTvHoras', '')::NUMERIC,
                receita_longe_od_esferico = NULLIF(BTRIM(evaluation_payload->>'receitaLongeOdEsferico'), ''),
                receita_longe_od_cilindrico = NULLIF(BTRIM(evaluation_payload->>'receitaLongeOdCilindrico'), ''),
                receita_longe_od_eixo = NULLIF(BTRIM(evaluation_payload->>'receitaLongeOdEixo'), ''),
                receita_longe_oe_esferico = NULLIF(BTRIM(evaluation_payload->>'receitaLongeOeEsferico'), ''),
                receita_longe_oe_cilindrico = NULLIF(BTRIM(evaluation_payload->>'receitaLongeOeCilindrico'), ''),
                receita_longe_oe_eixo = NULLIF(BTRIM(evaluation_payload->>'receitaLongeOeEixo'), ''),
                receita_adicao = NULLIF(BTRIM(evaluation_payload->>'receitaAdicao'), ''),
                raw_payload_json = COALESCE(evaluation_payload->'rawPayloadJson', '{}'::JSONB),
                recommended_items = recommendation_payload,
                recommended_lens_name = NULLIF(recommendation_payload->0->>'familyName', ''),
                updated_at = (p_payload->>'clientUpdatedAt')::TIMESTAMPTZ
            WHERE evaluation.id = resolved_evaluation_id
              AND evaluation.tenant_id = resolved_tenant_id
              AND evaluation.store_id = resolved_store_id;
        END IF;

        UPDATE public.tower_sessions AS session
        SET customer_id = resolved_customer_id,
            optical_evaluation_id = resolved_evaluation_id
        WHERE session.id = resolved_session.id
          AND session.tenant_id = resolved_tenant_id
          AND session.store_id = resolved_store_id;

        UPDATE public.tower_heatmap_sessions AS heatmap
        SET customer_id = resolved_customer_id,
            optical_evaluation_id = resolved_evaluation_id
        WHERE heatmap.tower_session_id = resolved_session.id
          AND heatmap.tenant_id = resolved_tenant_id
          AND heatmap.store_id = resolved_store_id;
    END IF;

    INSERT INTO public.tower_device_sync_events(
        event_id, device_id, tenant_id, store_id, event_type, entity_id, payload_hash
    ) VALUES (
        p_event_id, p_device_id, resolved_tenant_id, resolved_store_id,
        p_event_type, p_entity_id, p_payload_hash
    );

    RETURN CASE WHEN p_event_type = 'tower_evaluation.upsert'
        THEN resolved_evaluation_id ELSE NULL END;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_tower_device_sync_event_v4(UUID, UUID, TEXT, UUID, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tower_device_sync_event_v4(UUID, UUID, TEXT, UUID, TEXT, JSONB)
    TO service_role;
