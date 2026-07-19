-- Configuracao comercial remota da Torre sem conta do sistema.
-- O link identifica uma loja, o PIN comercial abre uma sessao curta e todos
-- os segredos permanecem em hash. O merge preserva atomicamente os demais
-- campos de stores.settings.

CREATE TABLE IF NOT EXISTS public.tower_remote_config_access (
    store_id BIGINT PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    public_code TEXT NOT NULL UNIQUE CHECK (public_code ~ '^[A-Za-z0-9_-]{32}$'),
    pin_hash TEXT NOT NULL CHECK (length(pin_hash) > 0),
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until TIMESTAMPTZ,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tower_remote_config_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tower_remote_config_access FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rotate_tower_remote_config_access(
    p_store_id BIGINT,
    p_public_code TEXT,
    p_pin_hash TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_store_id IS NULL OR p_store_id <= 0
       OR p_public_code !~ '^[A-Za-z0-9_-]{32}$'
       OR NULLIF(BTRIM(p_pin_hash), '') IS NULL THEN
        RAISE EXCEPTION 'TOWER_REMOTE_ACCESS_INVALID';
    END IF;

    PERFORM 1
    FROM public.stores AS store
    WHERE store.id = p_store_id
      AND store.is_active = TRUE
      AND COALESCE(store.settings->>'tower_enabled', 'false') = 'true'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TOWER_STORE_INVALID'; END IF;

    INSERT INTO public.tower_remote_config_access(
        store_id, public_code, pin_hash, failed_attempts, locked_until,
        last_verified_at, created_at, updated_at
    ) VALUES (
        p_store_id, p_public_code, p_pin_hash, 0, NULL, NULL, NOW(), NOW()
    ) ON CONFLICT ON CONSTRAINT tower_remote_config_access_pkey DO UPDATE
    SET public_code = EXCLUDED.public_code,
        pin_hash = EXCLUDED.pin_hash,
        failed_attempts = 0,
        locked_until = NULL,
        last_verified_at = NULL,
        updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.record_tower_remote_config_pin_attempt(
    p_public_code TEXT,
    p_expected_pin_hash TEXT,
    p_verified BOOLEAN
)
RETURNS TABLE (
    pin_verified BOOLEAN,
    pin_store_id BIGINT,
    pin_failed_attempts INTEGER,
    pin_locked_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    selected_access public.tower_remote_config_access%ROWTYPE;
    next_failed_attempts INTEGER;
    next_locked_until TIMESTAMPTZ;
BEGIN
    SELECT access.* INTO selected_access
    FROM public.tower_remote_config_access AS access
    WHERE access.public_code = p_public_code
    FOR UPDATE;

    IF selected_access.store_id IS NULL
       OR selected_access.pin_hash <> p_expected_pin_hash THEN
        RAISE EXCEPTION 'TOWER_REMOTE_ACCESS_STATE_CHANGED';
    END IF;

    IF selected_access.locked_until IS NOT NULL
       AND selected_access.locked_until > NOW() THEN
        RETURN QUERY SELECT FALSE, selected_access.store_id,
            selected_access.failed_attempts, selected_access.locked_until;
        RETURN;
    END IF;

    IF NOT p_verified THEN
        next_failed_attempts := selected_access.failed_attempts + 1;
        next_locked_until := CASE
            WHEN next_failed_attempts >= 5 THEN NOW() + INTERVAL '15 minutes'
            ELSE NULL
        END;

        UPDATE public.tower_remote_config_access AS access
        SET failed_attempts = next_failed_attempts,
            locked_until = next_locked_until,
            updated_at = NOW()
        WHERE access.store_id = selected_access.store_id;

        RETURN QUERY SELECT FALSE, selected_access.store_id,
            next_failed_attempts, next_locked_until;
        RETURN;
    END IF;

    UPDATE public.tower_remote_config_access AS access
    SET failed_attempts = 0, locked_until = NULL,
        last_verified_at = NOW(), updated_at = NOW()
    WHERE access.store_id = selected_access.store_id;

    RETURN QUERY SELECT TRUE, selected_access.store_id, 0, NULL::TIMESTAMPTZ;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tower_remote_config(
    p_store_id BIGINT,
    p_config JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_store_id IS NULL
       OR p_store_id <= 0
       OR p_config IS NULL
       OR jsonb_typeof(p_config) <> 'object'
       OR p_config->>'version' <> '1'
       OR jsonb_typeof(p_config->'experiences') <> 'object' THEN
        RAISE EXCEPTION 'TOWER_REMOTE_CONFIG_INVALID';
    END IF;

    UPDATE public.stores AS store
    SET settings = COALESCE(store.settings, '{}'::JSONB) || jsonb_build_object(
        'tower_remote_config', p_config,
        'tower_experiences', jsonb_build_object(
            'visagismo', COALESCE((p_config#>>'{experiences,visagismo}')::BOOLEAN, TRUE),
            'campo_visual', COALESCE((p_config#>>'{experiences,campoVisual}')::BOOLEAN, TRUE),
            'medidas', COALESCE((p_config#>>'{experiences,medidas}')::BOOLEAN, TRUE),
            'informacoes_uteis', COALESCE((p_config#>>'{experiences,informacoesUteis}')::BOOLEAN, TRUE)
        )
    )
    WHERE store.id = p_store_id
      AND COALESCE(store.settings->>'tower_enabled', 'false') = 'true';

    IF NOT FOUND THEN RAISE EXCEPTION 'TOWER_STORE_INVALID'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_tower_remote_config_access(BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_tower_remote_config_pin_attempt(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_tower_remote_config(BIGINT, JSONB) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rotate_tower_remote_config_access(BIGINT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_tower_remote_config_pin_attempt(TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_tower_remote_config(BIGINT, JSONB) TO service_role;
