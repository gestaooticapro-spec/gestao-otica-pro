ALTER TABLE public.service_orders ADD COLUMN data_receita date;

CREATE TABLE public.customer_manual_prescriptions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id bigint NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id bigint NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    dependente_id bigint REFERENCES public.dependentes(id) ON DELETE CASCADE,
    oftalmologista_id bigint REFERENCES public.oftalmologistas(id) ON DELETE SET NULL,
    data_receita date NOT NULL,
    receita_longe_od_esferico text,
    receita_longe_od_cilindrico text,
    receita_longe_od_eixo text,
    receita_longe_oe_esferico text,
    receita_longe_oe_cilindrico text,
    receita_longe_oe_eixo text,
    receita_perto_od_esferico text,
    receita_perto_od_cilindrico text,
    receita_perto_od_eixo text,
    receita_perto_oe_esferico text,
    receita_perto_oe_cilindrico text,
    receita_perto_oe_eixo text,
    receita_adicao text,
    medida_dnp_od text,
    medida_dnp_oe text,
    medida_altura_od text,
    medida_altura_oe text,
    obs_os text,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    used_at timestamptz,
    used_service_order_id bigint REFERENCES public.service_orders(id) ON DELETE SET NULL,
    CHECK (num_nonnulls(receita_longe_od_esferico, receita_longe_od_cilindrico, receita_longe_od_eixo, receita_longe_oe_esferico, receita_longe_oe_cilindrico, receita_longe_oe_eixo, receita_perto_od_esferico, receita_perto_od_cilindrico, receita_perto_od_eixo, receita_perto_oe_esferico, receita_perto_oe_cilindrico, receita_perto_oe_eixo, receita_adicao) > 0)
);

CREATE INDEX customer_manual_prescriptions_available_idx
    ON public.customer_manual_prescriptions (store_id, customer_id, dependente_id, id DESC)
    WHERE used_at IS NULL;

ALTER TABLE public.customer_manual_prescriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_manual_prescriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.customer_manual_prescriptions TO service_role;
GRANT USAGE ON SEQUENCE public.customer_manual_prescriptions_id_seq TO service_role;

-- The final values in the saved order determine consumption. Equivalent
-- decimal notation compares equally, while a blank is distinct from zero.
CREATE FUNCTION public.normalize_manual_prescription_degree(p_value text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
    SELECT CASE
        WHEN clean IN ('', '-') THEN NULL
        WHEN clean ~ '^[+-]?[0-9]+(\.[0-9]+)?$'
            THEN trim_scale(clean::numeric)::text
        ELSE clean
    END
    FROM (SELECT replace(rtrim(btrim(p_value), '°º '), ',', '.') AS clean) AS normalized;
$$;

CREATE FUNCTION public.consume_manual_prescription(
    p_prescription_id bigint, p_order_id bigint, p_store_id bigint, p_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
    WITH consumed AS (
        UPDATE public.customer_manual_prescriptions AS rx
        SET used_at = now(), used_service_order_id = os.id
        FROM public.service_orders AS os
        WHERE rx.id = p_prescription_id
          AND os.id = p_order_id
          AND rx.used_at IS NULL
          AND os.tenant_id = p_tenant_id AND rx.tenant_id = p_tenant_id
          AND os.store_id = p_store_id AND rx.store_id = p_store_id
          AND rx.customer_id = os.customer_id
          AND rx.dependente_id IS NOT DISTINCT FROM os.dependente_id
          AND public.normalize_manual_prescription_degree(rx.receita_longe_od_esferico)
              IS NOT DISTINCT FROM public.normalize_manual_prescription_degree(os.receita_longe_od_esferico::text)
          AND public.normalize_manual_prescription_degree(rx.receita_longe_od_cilindrico)
              IS NOT DISTINCT FROM public.normalize_manual_prescription_degree(os.receita_longe_od_cilindrico::text)
          AND public.normalize_manual_prescription_degree(rx.receita_longe_od_eixo)
              IS NOT DISTINCT FROM public.normalize_manual_prescription_degree(os.receita_longe_od_eixo::text)
          AND public.normalize_manual_prescription_degree(rx.receita_longe_oe_esferico)
              IS NOT DISTINCT FROM public.normalize_manual_prescription_degree(os.receita_longe_oe_esferico::text)
          AND public.normalize_manual_prescription_degree(rx.receita_longe_oe_cilindrico)
              IS NOT DISTINCT FROM public.normalize_manual_prescription_degree(os.receita_longe_oe_cilindrico::text)
          AND public.normalize_manual_prescription_degree(rx.receita_longe_oe_eixo)
              IS NOT DISTINCT FROM public.normalize_manual_prescription_degree(os.receita_longe_oe_eixo::text)
          AND public.normalize_manual_prescription_degree(rx.receita_perto_od_esferico)
              IS NOT DISTINCT FROM public.normalize_manual_prescription_degree(os.receita_perto_od_esferico::text)
          AND public.normalize_manual_prescription_degree(rx.receita_perto_od_cilindrico)
              IS NOT DISTINCT FROM public.normalize_manual_prescription_degree(os.receita_perto_od_cilindrico::text)
          AND public.normalize_manual_prescription_degree(rx.receita_perto_od_eixo)
              IS NOT DISTINCT FROM public.normalize_manual_prescription_degree(os.receita_perto_od_eixo::text)
          AND public.normalize_manual_prescription_degree(rx.receita_perto_oe_esferico)
              IS NOT DISTINCT FROM public.normalize_manual_prescription_degree(os.receita_perto_oe_esferico::text)
          AND public.normalize_manual_prescription_degree(rx.receita_perto_oe_cilindrico)
              IS NOT DISTINCT FROM public.normalize_manual_prescription_degree(os.receita_perto_oe_cilindrico::text)
          AND public.normalize_manual_prescription_degree(rx.receita_perto_oe_eixo)
              IS NOT DISTINCT FROM public.normalize_manual_prescription_degree(os.receita_perto_oe_eixo::text)
          AND public.normalize_manual_prescription_degree(rx.receita_adicao)
              IS NOT DISTINCT FROM public.normalize_manual_prescription_degree(os.receita_adicao::text)
        RETURNING rx.id
    )
    SELECT EXISTS (SELECT 1 FROM consumed);
$$;

REVOKE ALL ON FUNCTION public.consume_manual_prescription(bigint, bigint, bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_manual_prescription(bigint, bigint, bigint, uuid) TO service_role;
