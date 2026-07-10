-- Corrige consistência entre o fluxo NFC e o quadro do laboratório.
-- Quando a lente chega via NFC, a OS precisa sair de "Falta Pedir".
-- Para isso, garantimos o preenchimento progressivo dos marcos anteriores.

BEGIN;

UPDATE public.service_orders
   SET dt_pedido_em = COALESCE(dt_lente_chegou, dt_montado_em)
 WHERE dt_pedido_em IS NULL
   AND (dt_lente_chegou IS NOT NULL OR dt_montado_em IS NOT NULL);

UPDATE public.service_orders
   SET dt_lente_chegou = dt_montado_em
 WHERE dt_lente_chegou IS NULL
   AND dt_montado_em IS NOT NULL;

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

    SELECT *
      INTO v_tray
      FROM public.nfc_trays
     WHERE id = p_tray_id
       AND store_id = p_store_id
     FOR UPDATE;

    IF NOT FOUND OR v_tray.current_service_order_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Nenhuma OS vinculada a esta bandeja.';
    END IF;

    IF v_tray.status <> 'active' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A bandeja está inativa ou perdida.';
    END IF;

    SELECT *
      INTO v_os
      FROM public.service_orders
     WHERE id = v_tray.current_service_order_id
       AND store_id = p_store_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'A OS vinculada não pertence a esta loja.';
    END IF;

    IF p_action = 'LENTE_CHEGOU' THEN
        IF v_os.dt_montado_em IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A OS já está marcada como montada.';
        END IF;
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
        IF v_os.dt_montado_em IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A montagem já foi confirmada.';
        END IF;

        UPDATE public.service_orders
           SET dt_pedido_em = COALESCE(dt_pedido_em, COALESCE(dt_lente_chegou, v_now)),
               dt_lente_chegou = COALESCE(dt_lente_chegou, v_now),
               dt_montado_em = v_now
         WHERE id = v_os.id;
        v_event_action := 'ASSEMBLY_COMPLETED';
    ELSE
        IF v_os.dt_montado_em IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A bandeja só pode ser esvaziada após a montagem.';
        END IF;

        UPDATE public.nfc_trays
           SET current_service_order_id = NULL
         WHERE id = v_tray.id;
        v_event_action := 'TRAY_UNLINKED';
    END IF;

    INSERT INTO public.nfc_tray_events (
        tray_id, store_id, service_order_id, action
    ) VALUES (
        v_tray.id, p_store_id, v_os.id, v_event_action
    );

    RETURN jsonb_build_object(
        'service_order_id', v_os.id,
        'action', p_action
    );
END;
$$;

REVOKE ALL ON FUNCTION public.advance_nfc_tray(TEXT, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_nfc_tray(TEXT, BIGINT, TEXT) TO service_role;

COMMIT;
