-- Fluxo retrocompativel para OS enviadas a laboratorio externo.
-- OS antigas continuam usando somente dt_montado_em.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS dt_montado_no_lab TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS dt_recebido_na_loja TIMESTAMPTZ NULL;

ALTER TABLE public.nfc_tray_events
  DROP CONSTRAINT IF EXISTS nfc_tray_events_action_check;

ALTER TABLE public.nfc_tray_events
  ADD CONSTRAINT nfc_tray_events_action_check
  CHECK (
    action IN (
      'TRAY_CREATED',
      'OS_LINKED',
      'LENS_RECEIVED',
      'ASSEMBLY_COMPLETED',
      'ASSEMBLY_COMPLETED_AT_LAB',
      'RECEIVED_AT_STORE',
      'TRAY_UNLINKED'
    )
  );

CREATE OR REPLACE FUNCTION public.advance_nfc_tray(
    p_tray_id TEXT,
    p_store_id BIGINT,
    p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tray public.nfc_trays%ROWTYPE;
    v_os public.service_orders%ROWTYPE;
    v_event_action TEXT;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF p_action NOT IN ('LENTE_CHEGOU', 'MONTAGEM_CONCLUIDA', 'DESVINCULAR_BANDEJA') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Ação NFC inválida.';
    END IF;

    SELECT * INTO v_tray
      FROM public.nfc_trays
     WHERE id = p_tray_id AND store_id = p_store_id
     FOR UPDATE;

    IF NOT FOUND OR v_tray.current_service_order_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Nenhuma OS vinculada a esta bandeja.';
    END IF;
    IF v_tray.status <> 'active' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A bandeja está inativa ou perdida.';
    END IF;

    SELECT * INTO v_os
      FROM public.service_orders
     WHERE id = v_tray.current_service_order_id AND store_id = p_store_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'A OS vinculada não pertence a esta loja.';
    END IF;

    IF p_action = 'LENTE_CHEGOU' THEN
        IF v_os.dt_lente_chegou IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A chegada da lente já foi confirmada.';
        END IF;

        UPDATE public.service_orders
           SET dt_pedido_em = COALESCE(dt_pedido_em, v_now),
               dt_lente_chegou = v_now
         WHERE id = v_os.id;
        v_event_action := 'LENS_RECEIVED';

    ELSIF p_action = 'MONTAGEM_CONCLUIDA' THEN
        IF v_os.dt_lente_chegou IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Confirme primeiro a chegada da lente.';
        END IF;

        IF COALESCE(v_os.os_enviada_ao_lab, false) THEN
            IF v_os.dt_montado_no_lab IS NULL THEN
                UPDATE public.service_orders
                   SET dt_montado_no_lab = v_now
                 WHERE id = v_os.id;
                v_event_action := 'ASSEMBLY_COMPLETED_AT_LAB';
            ELSIF v_os.dt_montado_em IS NULL THEN
                UPDATE public.service_orders
                   SET dt_recebido_na_loja = COALESCE(dt_recebido_na_loja, v_now),
                       dt_montado_em = v_now
                 WHERE id = v_os.id;
                v_event_action := 'RECEIVED_AT_STORE';
            ELSE
                RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A OS já está pronta para entrega.';
            END IF;
        ELSE
            IF v_os.dt_montado_em IS NOT NULL THEN
                RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A montagem já foi confirmada.';
            END IF;

            UPDATE public.service_orders
               SET dt_pedido_em = COALESCE(dt_pedido_em, COALESCE(dt_lente_chegou, v_now)),
                   dt_lente_chegou = COALESCE(dt_lente_chegou, v_now),
                   dt_montado_em = v_now
             WHERE id = v_os.id;
            v_event_action := 'ASSEMBLY_COMPLETED';
        END IF;

    ELSE
        IF v_os.dt_montado_em IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A bandeja só pode ser esvaziada após a chegada do óculos na loja.';
        END IF;

        UPDATE public.nfc_trays
           SET current_service_order_id = NULL
         WHERE id = v_tray.id;
        v_event_action := 'TRAY_UNLINKED';
    END IF;

    INSERT INTO public.nfc_tray_events (tray_id, store_id, service_order_id, action)
    VALUES (v_tray.id, p_store_id, v_os.id, v_event_action);

    RETURN jsonb_build_object('service_order_id', v_os.id, 'action', p_action);
END;
$$;

REVOKE ALL ON FUNCTION public.advance_nfc_tray(TEXT, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_nfc_tray(TEXT, BIGINT, TEXT) TO service_role;
