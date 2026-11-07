CREATE TABLE IF NOT EXISTS public.customer_inactive_exclusions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  store_id BIGINT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('falecimento', 'mudou_longe', 'outro')),
  note TEXT NULL,
  excluded_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, customer_id)
);

CREATE INDEX IF NOT EXISTS customer_inactive_exclusions_store_created_idx
  ON public.customer_inactive_exclusions (store_id, created_at DESC);

ALTER TABLE public.customer_inactive_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_inactive_exclusions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_inactive_customers(
  p_store_id BIGINT,
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL,
  p_phone_filter TEXT DEFAULT 'all',
  p_spc_filter TEXT DEFAULT 'all',
  p_search TEXT DEFAULT '',
  p_show_excluded BOOLEAN DEFAULT FALSE,
  p_page_size INTEGER DEFAULT 50,
  p_page_offset INTEGER DEFAULT 0,
  p_sort TEXT DEFAULT 'last_purchase_asc'
)
RETURNS TABLE (
  customer_id BIGINT,
  full_name TEXT,
  cpf TEXT,
  birth_date DATE,
  phone TEXT,
  fone_movel TEXT,
  email TEXT,
  rua TEXT,
  numero TEXT,
  bairro TEXT,
  complemento TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  is_spc BOOLEAN,
  last_purchase DATE,
  total_spent NUMERIC,
  purchase_count BIGINT,
  exclusion_reason TEXT,
  exclusion_note TEXT,
  excluded_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH sales_summary AS (
    SELECT
      v.customer_id,
      MAX(COALESCE(v.data_fechamento::DATE, v.created_at::DATE)) AS last_purchase,
      SUM(COALESCE(v.valor_final, 0))::NUMERIC AS total_spent,
      COUNT(*)::BIGINT AS purchase_count
    FROM public.vendas v
    WHERE v.store_id = p_store_id
      AND v.customer_id IS NOT NULL
      AND COALESCE(v.status, '') <> 'Cancelada'
    GROUP BY v.customer_id
  ), filtered AS (
    SELECT
      c.id AS customer_id,
      c.full_name::TEXT,
      c.cpf::TEXT,
      c.birth_date::DATE,
      c.phone::TEXT,
      c.fone_movel::TEXT,
      c.email::TEXT,
      c.rua::TEXT,
      c.numero::TEXT,
      c.bairro::TEXT,
      c.complemento::TEXT,
      c.cidade::TEXT,
      c.uf::TEXT,
      c.cep::TEXT,
      COALESCE(c.is_spc, FALSE) AS is_spc,
      s.last_purchase,
      s.total_spent,
      s.purchase_count,
      e.reason::TEXT AS exclusion_reason,
      e.note::TEXT AS exclusion_note,
      e.created_at AS excluded_at
    FROM public.customers c
    JOIN sales_summary s ON s.customer_id = c.id
    LEFT JOIN public.customer_inactive_exclusions e
      ON e.store_id = c.store_id AND e.customer_id = c.id
    WHERE c.store_id = p_store_id
      AND (p_from IS NULL OR s.last_purchase >= p_from)
      AND (p_to IS NULL OR s.last_purchase <= p_to)
      AND (p_phone_filter = 'all'
        OR (p_phone_filter = 'has' AND (NULLIF(BTRIM(COALESCE(c.fone_movel, '')), '') IS NOT NULL OR NULLIF(BTRIM(COALESCE(c.phone, '')), '') IS NOT NULL))
        OR (p_phone_filter = 'missing' AND NULLIF(BTRIM(COALESCE(c.fone_movel, '')), '') IS NULL AND NULLIF(BTRIM(COALESCE(c.phone, '')), '') IS NULL))
      AND (p_spc_filter = 'all'
        OR (p_spc_filter = 'yes' AND COALESCE(c.is_spc, FALSE))
        OR (p_spc_filter = 'no' AND NOT COALESCE(c.is_spc, FALSE)))
      AND ((p_show_excluded AND e.id IS NOT NULL) OR (NOT p_show_excluded AND e.id IS NULL))
      AND (NULLIF(BTRIM(p_search), '') IS NULL OR CONCAT_WS(' ', c.full_name, c.phone, c.fone_movel, c.email, c.cidade, c.uf) ILIKE '%' || BTRIM(p_search) || '%')
  )
  SELECT filtered.*, COUNT(*) OVER () AS total_count
  FROM filtered
  ORDER BY
    CASE WHEN p_sort = 'name_asc' THEN full_name END ASC,
    CASE WHEN p_sort = 'name_desc' THEN full_name END DESC,
    CASE WHEN p_sort = 'last_purchase_asc' THEN last_purchase END ASC,
    CASE WHEN p_sort = 'last_purchase_desc' THEN last_purchase END DESC,
    CASE WHEN p_sort = 'city_asc' THEN NULLIF(BTRIM(cidade), '') END ASC NULLS LAST,
    CASE WHEN p_sort = 'city_desc' THEN NULLIF(BTRIM(cidade), '') END DESC NULLS LAST,
    CASE WHEN p_sort = 'total_spent_desc' THEN total_spent END DESC,
    last_purchase ASC, total_spent DESC, full_name ASC
  LIMIT LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_page_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.search_inactive_customers(BIGINT, DATE, DATE, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_inactive_customers(BIGINT, DATE, DATE, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, TEXT)
  TO service_role;
