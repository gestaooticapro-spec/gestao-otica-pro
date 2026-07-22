-- Persistencia atomica e idempotente das medidas enviadas pelo renderer web.
CREATE OR REPLACE FUNCTION public.save_tower_web_measurement(
    p_tenant_id UUID,
    p_store_id BIGINT,
    p_result_id UUID,
    p_tower_session_id UUID,
    p_lens_mode TEXT,
    p_reference_mm NUMERIC,
    p_front_measurements JSONB,
    p_profile_measurements JSONB,
    p_attention_codes JSONB,
    p_algorithm_version TEXT
)
RETURNS TABLE(id UUID, version INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_session public.tower_sessions%ROWTYPE;
    existing_result public.tower_measurement_results%ROWTYPE;
    next_version INTEGER;
BEGIN
    SELECT session.* INTO target_session
    FROM public.tower_sessions AS session
    WHERE session.id = p_tower_session_id
      AND session.tenant_id = p_tenant_id
      AND session.store_id = p_store_id
    FOR UPDATE;

    IF target_session.id IS NULL THEN
        RAISE EXCEPTION 'TOWER_WEB_MEASUREMENT_SESSION_NOT_FOUND';
    END IF;

    SELECT result.* INTO existing_result
    FROM public.tower_measurement_results AS result
    WHERE result.id = p_result_id;

    IF existing_result.id IS NOT NULL THEN
        IF existing_result.tenant_id <> p_tenant_id
           OR existing_result.store_id <> p_store_id
           OR existing_result.tower_session_id <> p_tower_session_id
           OR existing_result.lens_mode <> p_lens_mode
           OR existing_result.reference_mm <> p_reference_mm
           OR existing_result.front_measurements <> p_front_measurements
           OR existing_result.profile_measurements <> p_profile_measurements
           OR existing_result.attention_codes <> p_attention_codes
           OR existing_result.algorithm_version <> p_algorithm_version THEN
            RAISE EXCEPTION 'TOWER_WEB_MEASUREMENT_ID_CONFLICT';
        END IF;
        RETURN QUERY SELECT existing_result.id, existing_result.version;
        RETURN;
    END IF;

    IF target_session.status <> 'active' THEN
        RAISE EXCEPTION 'TOWER_WEB_MEASUREMENT_SESSION_INACTIVE';
    END IF;
    IF p_lens_mode NOT IN ('multifocal', 'bifocal')
       OR p_reference_mm <= 0
       OR jsonb_typeof(p_front_measurements) <> 'object'
       OR jsonb_typeof(p_profile_measurements) <> 'object'
       OR jsonb_typeof(p_attention_codes) <> 'array'
       OR NULLIF(BTRIM(p_algorithm_version), '') IS NULL THEN
        RAISE EXCEPTION 'TOWER_WEB_MEASUREMENT_INVALID';
    END IF;

    SELECT COALESCE(MAX(result.version), 0) + 1 INTO next_version
    FROM public.tower_measurement_results AS result
    WHERE result.tower_session_id = target_session.id;

    INSERT INTO public.tower_measurement_results(
        id, tenant_id, store_id, tower_session_id, customer_id,
        optical_evaluation_id, created_by_user_id, version, lens_mode,
        reference_mm, front_measurements, profile_measurements,
        attention_codes, algorithm_version
    ) VALUES (
        p_result_id, p_tenant_id, p_store_id, target_session.id,
        target_session.customer_id, target_session.optical_evaluation_id, NULL,
        next_version, p_lens_mode, p_reference_mm, p_front_measurements,
        p_profile_measurements, p_attention_codes, p_algorithm_version
    );

    RETURN QUERY SELECT p_result_id, next_version;
END;
$$;

REVOKE ALL ON FUNCTION public.save_tower_web_measurement(
    UUID, BIGINT, UUID, UUID, TEXT, NUMERIC, JSONB, JSONB, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_tower_web_measurement(
    UUID, BIGINT, UUID, UUID, TEXT, NUMERIC, JSONB, JSONB, JSONB, TEXT
) TO service_role;
