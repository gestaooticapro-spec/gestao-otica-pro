CREATE TABLE IF NOT EXISTS public.monthly_accountant_closing_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id bigint NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    year integer NOT NULL CHECK (year >= 2000),
    month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
    status text NOT NULL CHECK (status IN ('processing', 'success', 'error')),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_attempt_at timestamptz,
    sent_at timestamptz,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (store_id, year, month)
);

CREATE INDEX IF NOT EXISTS monthly_accountant_closing_logs_store_period_idx
    ON public.monthly_accountant_closing_logs (store_id, year DESC, month DESC);

ALTER TABLE public.monthly_accountant_closing_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monthly_accountant_closing_logs_tenant_read
    ON public.monthly_accountant_closing_logs;

CREATE POLICY monthly_accountant_closing_logs_tenant_read
    ON public.monthly_accountant_closing_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles AS profile
            WHERE profile.id = auth.uid()
              AND profile.tenant_id = monthly_accountant_closing_logs.tenant_id
              AND (
                  profile.role = 'admin'
                  OR profile.store_id = monthly_accountant_closing_logs.store_id
              )
        )
    );

CREATE OR REPLACE FUNCTION public.acquire_monthly_accountant_closing_lock(
    p_tenant_id uuid,
    p_store_id bigint,
    p_year integer,
    p_month integer,
    p_allow_resend boolean DEFAULT false
)
RETURNS TABLE (acquired boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    existing_status text;
BEGIN
    INSERT INTO public.monthly_accountant_closing_logs (
        tenant_id,
        store_id,
        year,
        month,
        status,
        attempt_count,
        last_attempt_at,
        error_message
    )
    VALUES (
        p_tenant_id,
        p_store_id,
        p_year,
        p_month,
        'processing',
        1,
        now(),
        NULL
    )
    ON CONFLICT (store_id, year, month) DO UPDATE
    SET
        status = 'processing',
        attempt_count = public.monthly_accountant_closing_logs.attempt_count + 1,
        last_attempt_at = now(),
        error_message = NULL,
        updated_at = now()
    WHERE
        (p_allow_resend OR public.monthly_accountant_closing_logs.status <> 'success')
        AND (
            public.monthly_accountant_closing_logs.status <> 'processing'
            OR public.monthly_accountant_closing_logs.last_attempt_at < now() - interval '15 minutes'
        );

    IF FOUND THEN
        RETURN QUERY SELECT true, 'acquired';
        RETURN;
    END IF;

    SELECT status
      INTO existing_status
      FROM public.monthly_accountant_closing_logs
     WHERE store_id = p_store_id
       AND year = p_year
       AND month = p_month;

    RETURN QUERY SELECT false, COALESCE(existing_status, 'unavailable');
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_monthly_accountant_closing_lock(uuid, bigint, integer, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acquire_monthly_accountant_closing_lock(uuid, bigint, integer, integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.acquire_monthly_accountant_closing_lock(uuid, bigint, integer, integer, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_monthly_accountant_closing_lock(uuid, bigint, integer, integer, boolean) TO service_role;
