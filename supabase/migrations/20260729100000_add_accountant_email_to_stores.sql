ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS contador_email text;

COMMENT ON COLUMN public.stores.contador_email IS
    'E-mail do contador responsavel pelas informacoes fiscais da loja.';
