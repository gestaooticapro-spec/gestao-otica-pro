-- Compartilhamentos temporarios e explicitamente publicados pela Neosmart.
-- Este recurso e isolado do sync operacional da Torre: nenhuma tabela ou RPC
-- existente e alterada.

CREATE TABLE IF NOT EXISTS public.tower_customer_report_shares (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    tower_session_id UUID NOT NULL REFERENCES public.tower_sessions(id) ON DELETE CASCADE,
    customer_id BIGINT NULL REFERENCES public.customers(id) ON DELETE SET NULL,
    source_device_id UUID NOT NULL REFERENCES public.tower_devices(id) ON DELETE RESTRICT,
    audience TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    snapshot JSONB NOT NULL,
    snapshot_hash TEXT NOT NULL,
    asset_manifest JSONB NOT NULL DEFAULT '[]'::JSONB,
    public_token_hash TEXT NULL,
    status TEXT NOT NULL DEFAULT 'preparing',
    expires_at TIMESTAMPTZ NULL,
    published_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tower_customer_report_shares_audience_check
        CHECK (audience IN ('customer', 'retailer_export')),
    CONSTRAINT tower_customer_report_shares_schema_check CHECK (schema_version = 1),
    CONSTRAINT tower_customer_report_shares_snapshot_check CHECK (jsonb_typeof(snapshot) = 'object'),
    CONSTRAINT tower_customer_report_shares_asset_manifest_check CHECK (jsonb_typeof(asset_manifest) = 'array'),
    CONSTRAINT tower_customer_report_shares_snapshot_hash_check CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT tower_customer_report_shares_token_hash_check
        CHECK (public_token_hash IS NULL OR public_token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT tower_customer_report_shares_status_check
        CHECK (status IN ('preparing', 'published', 'expired', 'revoked', 'failed')),
    CONSTRAINT tower_customer_report_shares_publication_check CHECK (
        (status = 'published' AND public_token_hash IS NOT NULL AND published_at IS NOT NULL AND expires_at IS NOT NULL)
        OR status <> 'published'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tower_customer_report_shares_public_token
    ON public.tower_customer_report_shares(public_token_hash)
    WHERE public_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tower_customer_report_shares_session
    ON public.tower_customer_report_shares(tower_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tower_customer_report_shares_expiration
    ON public.tower_customer_report_shares(expires_at)
    WHERE status = 'published';

CREATE TABLE IF NOT EXISTS public.tower_customer_report_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.tower_customer_report_shares(id) ON DELETE CASCADE,
    source_asset_id UUID NOT NULL,
    kind TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'expected',
    captured_at TIMESTAMPTZ NOT NULL,
    uploaded_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tower_customer_report_assets_kind_check
        CHECK (kind IN ('visagismo', 'measurement_front', 'measurement_profile')),
    CONSTRAINT tower_customer_report_assets_mime_check
        CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    CONSTRAINT tower_customer_report_assets_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT tower_customer_report_assets_size_check CHECK (byte_size BETWEEN 1 AND 4194304),
    CONSTRAINT tower_customer_report_assets_path_check
        CHECK (storage_path ~ '^[0-9a-f-]{36}/[0-9]+/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
    CONSTRAINT tower_customer_report_assets_status_check CHECK (status IN ('expected', 'uploaded')),
    UNIQUE (report_id, source_asset_id),
    UNIQUE (report_id, kind, content_hash),
    UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_tower_customer_report_assets_report
    ON public.tower_customer_report_assets(report_id);

ALTER TABLE public.tower_customer_report_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tower_customer_report_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tower_customer_report_shares FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tower_customer_report_assets FROM PUBLIC, anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'tower-customer-reports',
    'tower-customer-reports',
    FALSE,
    4194304,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.set_tower_customer_report_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tower_customer_report_shares_set_updated_at
    ON public.tower_customer_report_shares;
CREATE TRIGGER tower_customer_report_shares_set_updated_at
    BEFORE UPDATE ON public.tower_customer_report_shares
    FOR EACH ROW EXECUTE FUNCTION public.set_tower_customer_report_updated_at();
