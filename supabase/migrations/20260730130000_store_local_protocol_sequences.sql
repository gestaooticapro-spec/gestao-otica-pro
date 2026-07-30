-- Sequencia de protocolo operacional independente por loja.
-- O valor configurado na loja funciona como piso e nunca faz a sequencia retroceder.
CREATE TABLE IF NOT EXISTS public.store_local_protocol_sequences (
  store_id BIGINT PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  next_number BIGINT NOT NULL CHECK (next_number > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.store_local_protocol_sequences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.store_local_protocol_sequences FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.store_local_protocol_sequences TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_next_store_local_protocol(
  p_store_id BIGINT,
  p_initial_number BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_after_reservation BIGINT;
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Loja obrigatoria para gerar protocolo local.';
  END IF;

  IF p_initial_number IS NULL OR p_initial_number <= 0 THEN
    RAISE EXCEPTION 'Numeracao inicial do protocolo local deve ser maior que zero.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN
    RAISE EXCEPTION 'Loja nao encontrada para gerar protocolo local.';
  END IF;

  INSERT INTO public.store_local_protocol_sequences AS sequence_state (
    store_id,
    next_number,
    updated_at
  )
  VALUES (
    p_store_id,
    p_initial_number + 1,
    timezone('utc'::text, now())
  )
  ON CONFLICT (store_id) DO UPDATE
  SET
    next_number = GREATEST(sequence_state.next_number, p_initial_number) + 1,
    updated_at = timezone('utc'::text, now())
  RETURNING next_number INTO v_next_after_reservation;

  RETURN v_next_after_reservation - 1;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_next_store_local_protocol(BIGINT, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_next_store_local_protocol(BIGINT, BIGINT)
  TO service_role;

