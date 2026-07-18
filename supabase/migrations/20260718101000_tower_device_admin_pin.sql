-- Registra a verificacao do PIN de forma atomica. A comparacao scrypt acontece
-- no backend; a funcao bloqueia a linha e garante que o hash comparado ainda e
-- o hash atual antes de alterar tentativas, bloqueio ou o proprio PIN.
CREATE OR REPLACE FUNCTION public.record_tower_admin_pin_attempt(
    p_store_id BIGINT,
    p_expected_pin_hash TEXT,
    p_verified BOOLEAN,
    p_new_pin_hash TEXT DEFAULT NULL
)
RETURNS TABLE (
    pin_verified BOOLEAN,
    pin_must_change BOOLEAN,
    pin_failed_attempts INTEGER,
    pin_locked_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    selected_pin public.tower_store_admin_pins%ROWTYPE;
    next_failed_attempts INTEGER;
    next_locked_until TIMESTAMPTZ;
    result_must_change BOOLEAN;
BEGIN
    SELECT pin.*
    INTO selected_pin
    FROM public.tower_store_admin_pins AS pin
    WHERE pin.store_id = p_store_id
    FOR UPDATE;

    IF selected_pin.store_id IS NULL THEN
        RAISE EXCEPTION 'TOWER_ADMIN_PIN_NOT_FOUND';
    END IF;

    IF selected_pin.pin_hash <> p_expected_pin_hash THEN
        RAISE EXCEPTION 'TOWER_ADMIN_PIN_STATE_CHANGED';
    END IF;

    IF selected_pin.locked_until IS NOT NULL
       AND selected_pin.locked_until > NOW() THEN
        RETURN QUERY SELECT
            FALSE,
            selected_pin.must_change,
            selected_pin.failed_attempts,
            selected_pin.locked_until;
        RETURN;
    END IF;

    IF NOT p_verified THEN
        next_failed_attempts := selected_pin.failed_attempts + 1;
        next_locked_until := CASE
            WHEN next_failed_attempts >= 5 THEN NOW() + INTERVAL '15 minutes'
            ELSE NULL
        END;

        UPDATE public.tower_store_admin_pins AS pin
        SET failed_attempts = next_failed_attempts,
            locked_until = next_locked_until,
            updated_at = NOW()
        WHERE pin.store_id = p_store_id;

        RETURN QUERY SELECT
            FALSE,
            selected_pin.must_change,
            next_failed_attempts,
            next_locked_until;
        RETURN;
    END IF;

    IF p_new_pin_hash IS NOT NULL
       AND NULLIF(BTRIM(p_new_pin_hash), '') IS NULL THEN
        RAISE EXCEPTION 'TOWER_ADMIN_PIN_HASH_INVALID';
    END IF;

    UPDATE public.tower_store_admin_pins AS pin
    SET pin_hash = COALESCE(p_new_pin_hash, pin.pin_hash),
        must_change = CASE WHEN p_new_pin_hash IS NULL THEN pin.must_change ELSE FALSE END,
        failed_attempts = 0,
        locked_until = NULL,
        last_verified_at = NOW(),
        updated_at = NOW()
    WHERE pin.store_id = p_store_id
    RETURNING pin.must_change
    INTO result_must_change;

    RETURN QUERY SELECT TRUE, result_must_change, 0, NULL::TIMESTAMPTZ;
END;
$$;

REVOKE ALL ON FUNCTION public.record_tower_admin_pin_attempt(
    BIGINT, TEXT, BOOLEAN, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_tower_admin_pin_attempt(
    BIGINT, TEXT, BOOLEAN, TEXT
) FROM anon;
REVOKE ALL ON FUNCTION public.record_tower_admin_pin_attempt(
    BIGINT, TEXT, BOOLEAN, TEXT
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_tower_admin_pin_attempt(
    BIGINT, TEXT, BOOLEAN, TEXT
) TO service_role;
