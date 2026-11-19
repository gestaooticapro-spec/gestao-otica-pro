CREATE FUNCTION public.delete_available_manual_prescription(
    p_prescription_id bigint, p_store_id bigint, p_tenant_id uuid, p_customer_id bigint
)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
    WITH deleted AS (
        DELETE FROM public.customer_manual_prescriptions
        WHERE id = p_prescription_id
          AND store_id = p_store_id
          AND tenant_id = p_tenant_id
          AND customer_id = p_customer_id
          AND used_at IS NULL
        RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM deleted);
$$;

REVOKE ALL ON FUNCTION public.delete_available_manual_prescription(bigint, bigint, uuid, bigint)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_available_manual_prescription(bigint, bigint, uuid, bigint)
    TO service_role;
