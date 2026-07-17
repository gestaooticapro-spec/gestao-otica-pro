-- A constraint antiga ja restringe os papeis validos de profiles. Em vez de
-- reconstruir uma lista manual e correr o risco de remover um papel existente,
-- preservamos sua expressao atual e acrescentamos somente platform_admin.
DO $$
DECLARE
    current_constraint_definition TEXT;
    current_check_expression TEXT;
BEGIN
    SELECT pg_get_constraintdef(constraint_row.oid)
    INTO current_constraint_definition
    FROM pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.profiles'::regclass
      AND constraint_row.conname = 'profiles_role_check';

    IF current_constraint_definition IS NULL THEN
        RAISE EXCEPTION 'Constraint public.profiles.profiles_role_check nao encontrada.';
    END IF;

    -- pg_get_constraintdef retorna CHECK (<expressao>).
    current_check_expression := substring(
        current_constraint_definition
        FROM 8
        FOR length(current_constraint_definition) - 8
    );

    ALTER TABLE public.profiles
        DROP CONSTRAINT profiles_role_check;

    EXECUTE format(
        'ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK ((%s) OR role = %L)',
        current_check_expression,
        'platform_admin'
    );
END;
$$;
