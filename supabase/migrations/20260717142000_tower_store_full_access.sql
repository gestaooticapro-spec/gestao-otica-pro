-- A liberacao da Gestao Otica e comercial e nao altera as credenciais da
-- Torre. Esta tabela registra o responsavel humano convidado para a loja.
CREATE TABLE IF NOT EXISTS public.tower_store_full_access (
    store_id BIGINT PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    admin_name TEXT NOT NULL CHECK (length(BTRIM(admin_name)) >= 2),
    admin_email TEXT NOT NULL CHECK (length(BTRIM(admin_email)) >= 3),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active')),
    granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invitation_sent_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tower_store_full_access_admin_user_key
    ON public.tower_store_full_access(admin_user_id)
    WHERE admin_user_id IS NOT NULL;

ALTER TABLE public.tower_store_full_access ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tower_store_full_access FROM PUBLIC;
REVOKE ALL ON TABLE public.tower_store_full_access FROM anon;
REVOKE ALL ON TABLE public.tower_store_full_access FROM authenticated;
