-- O trigger participa da mesma transacao de entrega em qualquer entrada da OS.
create or replace function public.release_delivered_order_nfc_trays()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_tray public.nfc_trays%rowtype;
begin
  for v_tray in select * from public.nfc_trays
    where current_service_order_id=new.id order by id for update
  loop
    if v_tray.store_id is distinct from new.store_id then
      raise exception 'Envelope vinculado a outra loja. Revise o vinculo antes de entregar.';
    end if;
    update public.nfc_trays set current_service_order_id=null
      where id=v_tray.id and current_service_order_id=new.id;
    insert into public.nfc_tray_events(tray_id,store_id,service_order_id,action,metadata)
      values(v_tray.id,new.store_id,new.id,'TRAY_UNLINKED',jsonb_build_object(
        'reason','delivered_to_customer','delivered_at',new.dt_entregue_em));
  end loop;
  return new;
end;
$$;
revoke all on function public.release_delivered_order_nfc_trays() from public,anon,authenticated;
drop trigger if exists release_delivered_order_nfc_trays on public.service_orders;
create trigger release_delivered_order_nfc_trays after insert or update of dt_entregue_em on public.service_orders
for each row when (new.dt_entregue_em is not null)
execute function public.release_delivered_order_nfc_trays();
