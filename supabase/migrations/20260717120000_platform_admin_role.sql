-- Administradores de plataforma criam tenants e lojas, mas nao pertencem a
-- nenhum tenant. O isolamento abaixo impede que esse papel seja usado como
-- atalho para acessar dados operacionais de uma loja.
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_platform_admin_scope_check;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_platform_admin_scope_check
    CHECK (
        role IS DISTINCT FROM 'platform_admin'
        OR (tenant_id IS NULL AND store_id IS NULL)
    );

COMMENT ON CONSTRAINT profiles_platform_admin_scope_check ON public.profiles IS
    'platform_admin e um papel da plataforma e nao pode pertencer a tenant ou loja.';

CREATE OR REPLACE FUNCTION public.protect_platform_admin_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF (NEW.role = 'platform_admin' OR OLD.role = 'platform_admin')
       AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
        RAISE EXCEPTION 'platform_admin so pode ser atribuido por um administrador da plataforma.';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_platform_admin_assignment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_platform_admin_assignment() FROM anon;
REVOKE ALL ON FUNCTION public.protect_platform_admin_assignment() FROM authenticated;

DROP TRIGGER IF EXISTS protect_platform_admin_assignment ON public.profiles;

CREATE TRIGGER protect_platform_admin_assignment
    BEFORE INSERT OR UPDATE OF role, tenant_id, store_id
    ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_platform_admin_assignment();
