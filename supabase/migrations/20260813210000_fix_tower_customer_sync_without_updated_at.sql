-- A tabela legada public.customers nao possui updated_at. A funcao v4 tentou
-- escrever essa coluna ao vincular um cliente baixado no snapshot, causando
-- PostgreSQL 42703 e bloqueando a fila da Torre.
--
-- Esta migracao nao altera clientes. Ela preserva a definicao instalada da RPC
-- e remove somente a atribuicao incompatível, inclusive em ambientes onde a
-- funcao recebeu correcoes posteriores.
DO $$
DECLARE
    function_definition TEXT;
    corrected_definition TEXT;
BEGIN
    SELECT pg_get_functiondef(
        'public.apply_tower_device_sync_event_v4(uuid,uuid,text,uuid,text,jsonb)'::REGPROCEDURE
    )
    INTO function_definition;

    IF function_definition !~* E'fone_movel\\s*=\\s*normalized_phone\\s*,\\s*updated_at\\s*=\\s*now\\s*\\(\\s*\\)' THEN
        RAISE NOTICE 'apply_tower_device_sync_event_v4 ja esta compativel com public.customers.';
        RETURN;
    END IF;

    corrected_definition := REGEXP_REPLACE(
        function_definition,
        E'(?i)fone_movel\\s*=\\s*normalized_phone\\s*,\\s*updated_at\\s*=\\s*now\\s*\\(\\s*\\)',
        'fone_movel = normalized_phone'
    );
    EXECUTE corrected_definition;
END;
$$;
