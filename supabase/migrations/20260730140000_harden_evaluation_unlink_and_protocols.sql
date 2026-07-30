-- Preserva duplicidades historicas, mas protege protocolos novos ou revisados.
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS protocol_uniqueness_enforced BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS service_orders_store_protocol_unique_idx
  ON public.service_orders (store_id, (btrim(protocolo_fisico)))
  WHERE protocol_uniqueness_enforced = TRUE
    AND protocolo_fisico IS NOT NULL
    AND btrim(protocolo_fisico) <> '';

CREATE OR REPLACE FUNCTION public.enforce_service_order_protocol_uniqueness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_protocol TEXT;
  v_protocol_changed BOOLEAN;
BEGIN
  v_protocol := NULLIF(btrim(NEW.protocolo_fisico), '');
  NEW.protocolo_fisico := v_protocol;

  IF v_protocol IS NULL THEN
    NEW.protocol_uniqueness_enforced := TRUE;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_protocol_changed := TRUE;
  ELSE
    v_protocol_changed :=
      v_protocol IS DISTINCT FROM NULLIF(btrim(OLD.protocolo_fisico), '');
  END IF;

  IF v_protocol_changed THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(NEW.store_id::TEXT || ':' || v_protocol, 0)
    );

    IF EXISTS (
      SELECT 1
      FROM public.service_orders existing_order
      WHERE existing_order.store_id = NEW.store_id
        AND btrim(existing_order.protocolo_fisico) = v_protocol
        AND existing_order.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'Este protocolo ja esta sendo usado por outra OS desta loja.'
        USING
          ERRCODE = '23505',
          CONSTRAINT = 'service_orders_store_protocol_unique_idx';
    END IF;

    NEW.protocol_uniqueness_enforced := TRUE;
  ELSIF NEW.protocol_uniqueness_enforced = FALSE AND NOT EXISTS (
    SELECT 1
    FROM public.service_orders existing_order
    WHERE existing_order.store_id = NEW.store_id
      AND btrim(existing_order.protocolo_fisico) = v_protocol
      AND existing_order.id <> NEW.id
  ) THEN
    NEW.protocol_uniqueness_enforced := TRUE;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_service_order_protocol_uniqueness()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_service_order_protocol_uniqueness()
  TO service_role;

DROP TRIGGER IF EXISTS service_orders_protocol_uniqueness_trigger
  ON public.service_orders;
CREATE TRIGGER service_orders_protocol_uniqueness_trigger
  BEFORE INSERT OR UPDATE OF protocolo_fisico
  ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_service_order_protocol_uniqueness();

-- Mantem a sequencia automatica acima dos protocolos numericos ja utilizados.
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
  v_candidate BIGINT;
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
  RETURNING next_number - 1 INTO v_candidate;

  WHILE EXISTS (
    SELECT 1
    FROM public.service_orders
    WHERE store_id = p_store_id
      AND protocolo_fisico = v_candidate::TEXT
  ) LOOP
    v_candidate := v_candidate + 1;

    UPDATE public.store_local_protocol_sequences
    SET
      next_number = GREATEST(next_number, v_candidate + 1),
      updated_at = timezone('utc'::text, now())
    WHERE store_id = p_store_id;
  END LOOP;

  RETURN v_candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_next_store_local_protocol(BIGINT, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_next_store_local_protocol(BIGINT, BIGINT)
  TO service_role;

-- Troca/desvinculo de avaliacao e trilha de auditoria na mesma transacao.
CREATE OR REPLACE FUNCTION public.apply_service_order_evaluation_link_change(
  p_service_order_id BIGINT,
  p_store_id BIGINT,
  p_expected_previous_evaluation_id BIGINT,
  p_next_evaluation_id BIGINT,
  p_authorizer_employee_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.service_orders%ROWTYPE;
  v_next_evaluation public.optical_evaluations%ROWTYPE;
  v_authorizer_name TEXT;
  v_unlink_note TEXT;
BEGIN
  SELECT *
  INTO v_order
  FROM public.service_orders
  WHERE id = p_service_order_id
    AND store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OS nao encontrada nesta loja.';
  END IF;

  IF v_order.source_optical_evaluation_id IS DISTINCT FROM p_expected_previous_evaluation_id THEN
    RAISE EXCEPTION 'O vinculo da avaliacao foi alterado por outro usuario. Recarregue a OS.';
  END IF;

  IF p_expected_previous_evaluation_id IS NOT DISTINCT FROM p_next_evaluation_id THEN
    RETURN;
  END IF;

  IF p_expected_previous_evaluation_id IS NOT NULL THEN
    SELECT full_name
    INTO v_authorizer_name
    FROM public.employees
    WHERE id = p_authorizer_employee_id
      AND store_id = p_store_id
      AND role = 'gerente'
      AND is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Apenas um gerente ativo pode remover ou trocar a avaliacao.';
    END IF;
  END IF;

  IF p_next_evaluation_id IS NOT NULL THEN
    SELECT *
    INTO v_next_evaluation
    FROM public.optical_evaluations
    WHERE id = p_next_evaluation_id
      AND store_id = p_store_id
      AND tenant_id = v_order.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Avaliacao vinculada nao encontrada para esta loja.';
    END IF;

    IF (
      v_order.dependente_id IS NOT NULL
      AND v_next_evaluation.evaluated_dependente_id IS DISTINCT FROM v_order.dependente_id
    ) OR (
      v_order.dependente_id IS NULL
      AND v_next_evaluation.evaluated_customer_id IS DISTINCT FROM v_order.customer_id
    ) THEN
      RAISE EXCEPTION 'A avaliacao selecionada nao pertence ao paciente desta OS.';
    END IF;

    IF v_next_evaluation.exported_service_order_id IS NOT NULL
      AND v_next_evaluation.exported_service_order_id <> p_service_order_id THEN
      RAISE EXCEPTION 'A avaliacao selecionada ja esta vinculada a outra OS.';
    END IF;
  END IF;

  IF p_expected_previous_evaluation_id IS NOT NULL THEN
    UPDATE public.optical_evaluations
    SET
      exported_service_order_id = NULL,
      unlinked_at = timezone('utc'::text, now()),
      unlinked_by_employee_id = p_authorizer_employee_id,
      updated_at = timezone('utc'::text, now())
    WHERE id = p_expected_previous_evaluation_id
      AND store_id = p_store_id
      AND tenant_id = v_order.tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A avaliacao anterior nao foi encontrada para desvinculo.';
    END IF;

    v_unlink_note := format(
      'Esta venda foi desvinculada da avaliação por %s.',
      v_authorizer_name
    );

    UPDATE public.vendas
    SET obs_geral = CASE
      WHEN NULLIF(btrim(obs_geral), '') IS NULL THEN v_unlink_note
      ELSE btrim(obs_geral) || E'\n\n' || v_unlink_note
    END
    WHERE id = v_order.venda_id
      AND store_id = p_store_id
      AND tenant_id = v_order.tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Venda da OS nao encontrada para registrar o desvinculo.';
    END IF;
  END IF;

  IF p_next_evaluation_id IS NOT NULL THEN
    UPDATE public.optical_evaluations
    SET
      exported_service_order_id = p_service_order_id,
      unlinked_at = NULL,
      unlinked_by_employee_id = NULL,
      updated_at = timezone('utc'::text, now())
    WHERE id = p_next_evaluation_id
      AND store_id = p_store_id
      AND tenant_id = v_order.tenant_id;
  END IF;

  UPDATE public.service_orders
  SET source_optical_evaluation_id = p_next_evaluation_id
  WHERE id = p_service_order_id
    AND store_id = p_store_id
    AND tenant_id = v_order.tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_service_order_evaluation_link_change(
  BIGINT,
  BIGINT,
  BIGINT,
  BIGINT,
  BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_service_order_evaluation_link_change(
  BIGINT,
  BIGINT,
  BIGINT,
  BIGINT,
  BIGINT
) TO service_role;
