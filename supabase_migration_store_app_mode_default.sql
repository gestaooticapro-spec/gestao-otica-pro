-- Modo padrao para novas lojas: MVP.
-- Lojas existentes sem settings.app_mode continuam como Full pelo fallback da aplicacao.
alter table public.stores
    alter column settings set default '{"app_mode":"mvp"}';
