-- A observacao pertence a cada acordo; nao substitui a observacao original do carne.
alter table public.installment_renegotiations add column if not exists note text;
alter table public.installment_renegotiations
  drop constraint if exists installment_renegotiations_note_length,
  add constraint installment_renegotiations_note_length check (char_length(note)<=2000);

-- Reutiliza a rotina financeira existente dentro da mesma transacao.
-- Se a gravacao da observacao falhar, a renegociacao inteira e desfeita.
create or replace function public.renegotiate_store_financing_with_note(
  p_financing_id bigint,p_sale_id bigint,p_store_id bigint,p_employee_id bigint,
  p_user_id uuid,p_tenant_id uuid,p_installments jsonb,p_note text
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_result jsonb;
  v_note text := nullif(btrim(p_note),'');
begin
  if char_length(v_note)>2000 then raise exception 'Observacao deve ter no maximo 2000 caracteres.'; end if;
  if p_user_id is null or p_tenant_id is null or not exists(
    select 1 from public.profiles p join public.stores s on s.id=p_store_id and s.tenant_id=p.tenant_id
    where p.id=p_user_id and p.tenant_id=p_tenant_id and (p.role='admin' or p.store_id=p_store_id)
  ) then raise exception 'Usuario sem acesso a esta loja.'; end if;
  if not exists(select 1 from public.employees where id=p_employee_id and store_id=p_store_id
    and tenant_id=p_tenant_id and is_active=true) then raise exception 'Funcionario nao autorizado nesta loja.'; end if;
  v_result := public.renegotiate_store_financing(p_financing_id,p_sale_id,p_store_id,
    p_employee_id,p_user_id,p_tenant_id,p_installments);
  update public.installment_renegotiations set note=v_note
    where id=(v_result->>'renegotiation_id')::bigint and financiamento_id=p_financing_id
      and venda_id=p_sale_id and store_id=p_store_id and tenant_id=p_tenant_id
      and authorized_by_user_id=p_user_id and authorized_by_employee_id=p_employee_id;
  if not found then raise exception 'Historico da renegociacao nao encontrado para registrar a observacao.'; end if;
  return v_result;
end;
$$;
revoke all on function public.renegotiate_store_financing_with_note(bigint,bigint,bigint,bigint,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.renegotiate_store_financing_with_note(bigint,bigint,bigint,bigint,uuid,uuid,jsonb,text) to service_role;
