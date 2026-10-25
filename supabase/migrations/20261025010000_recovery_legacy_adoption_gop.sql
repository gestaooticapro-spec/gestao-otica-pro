-- PREPARE ONLY. Explicit adoption of an existing authorized invoice, no number allocation.
begin;
create table fiscal_recovery_gop.legacy_associations(
  invoice_id bigint primary key references public.fiscal_invoices(id),
  request_id uuid not null unique,
  client_id text not null,
  legacy_id text not null unique,
  origin_id text not null,
  source_sha256 text not null,
  created_by uuid not null,
  associated_at timestamptz
);
alter table fiscal_recovery_gop.legacy_associations enable row level security;
revoke all on fiscal_recovery_gop.legacy_associations from public,anon,authenticated,service_role;

create function public.gop_recovery_legacy_reserve_v1(p_invoice bigint,p_request uuid,p_actor uuid,p_client text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare i public.fiscal_invoices;l fiscal_recovery_gop.legacy_associations;o text;
begin
  select * into i from public.fiscal_invoices where id=p_invoice for update;
  if i.id is null or i.organization_id is distinct from '40b34e90-4c9d-4446-b775-770a3e77d6c0'::uuid or
    i.store_id is distinct from 1 or i.environment is distinct from 'production' or
    coalesce(i.tipo_documento,'') not in ('NFe','NFCe') or i.serie is distinct from '2' or
    regexp_replace(coalesce(i.emitente_cnpj,''),'\D','','g')<>'01997929000108' or
    p_request is null or coalesce(length(p_client),0)<6 or
    not exists(select 1 from public.profiles p where p.id=p_actor and p.tenant_id=i.organization_id and
      (p.store_id=i.store_id or p.role='admin')) then raise exception 'RECOVERY_LEGACY_ACCESS_DENIED';end if;
  select * into l from fiscal_recovery_gop.legacy_associations where invoice_id=i.id;
  if l.invoice_id is not null then
    if l.client_id<>p_client then raise exception 'RECOVERY_LEGACY_CLIENT_MISMATCH';end if;
    return jsonb_build_object('requestId',l.request_id,'legacyId',l.legacy_id,'originId',l.origin_id,'associated',l.associated_at is not null);
  end if;
  if i.status<>'authorized' or coalesce(i.nuvemfiscal_uuid,'')='' or i.nuvemfiscal_uuid like 'rv1_%' or
    i.recovery_request_id is not null or coalesce(i.chave_acesso,'') !~ '^[0-9]{44}$' or
    coalesce(i.numero,'') !~ '^[1-9][0-9]*$' then raise exception 'RECOVERY_LEGACY_INELIGIBLE';end if;
  o:='legacy-invoice:'||i.id::text;
  if i.tipo_documento='NFCe' and i.work_order_id is not null and exists(select 1 from public.vendas
    where id=i.work_order_id and tenant_id=i.organization_id and store_id=i.store_id) then o:='sale:'||i.work_order_id::text;end if;
  insert into fiscal_recovery_gop.legacy_associations(invoice_id,request_id,client_id,legacy_id,origin_id,source_sha256,created_by)
    values(i.id,p_request,p_client,i.nuvemfiscal_uuid,o,encode(sha256(convert_to(to_jsonb(i)::text,'UTF8')),'hex'),p_actor) returning * into l;
  return jsonb_build_object('requestId',l.request_id,'legacyId',l.legacy_id,'originId',l.origin_id,'associated',false);
end $$;

create function public.gop_recovery_legacy_finish_v1(p_invoice bigint,p_request uuid,p_actor uuid,p_client text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare i public.fiscal_invoices;l fiscal_recovery_gop.legacy_associations;a fiscal_recovery_gop.attempts;
  previous_writer text:=current_setting('fiscal_recovery_gop.writer',true);r jsonb:=p_result->'recovery';
begin
  select * into i from public.fiscal_invoices where id=p_invoice for update;
  select * into l from fiscal_recovery_gop.legacy_associations where invoice_id=p_invoice for update;
  if i.id is null or l.invoice_id is null or l.request_id is distinct from p_request or l.client_id is distinct from p_client or
    not exists(select 1 from public.profiles where id=p_actor and tenant_id=i.organization_id and (store_id=i.store_id or role='admin')) then
    raise exception 'RECOVERY_LEGACY_ACCESS_DENIED';end if;
  if l.associated_at is not null then
    select * into strict a from fiscal_recovery_gop.attempts where request_id=p_request;
    return fiscal_recovery_gop.attempt_json(a);
  end if;
  if i.status<>'authorized' or encode(sha256(convert_to(to_jsonb(i)::text,'UTF8')),'hex')<>l.source_sha256 then
    raise exception 'RECOVERY_LEGACY_SOURCE_CHANGED';end if;
  if p_result->>'id' is distinct from 'rv1_'||p_request::text or p_result->>'status' is distinct from 'autorizado' or
    p_result->>'chave' is distinct from i.chave_acesso or (p_result->>'numero')::integer is distinct from i.numero::integer or
    (p_result->>'serie')::integer is distinct from i.serie::integer or coalesce(p_result->>'protocolo','') !~ '^[0-9]{15}$' or
    r->>'schema' is distinct from 'recovery-v1' or r->>'requestId' is distinct from p_request::text or
    r->>'originId' is distinct from l.origin_id or r->>'clientId' is distinct from l.client_id or
    r->>'organizationId' is distinct from i.organization_id::text or (r->>'storeId')::bigint is distinct from i.store_id or
    r->>'phase' is distinct from 'authorized' or r->>'sendState' is distinct from 'possibly_sent' or
    coalesce((r->>'version')::bigint,0)<1 then raise exception 'RECOVERY_LEGACY_RESULT_INVALID';end if;
  perform pg_advisory_xact_lock(hashtextextended(i.organization_id::text||':'||i.store_id||':'||l.origin_id,0));
  insert into fiscal_recovery_gop.attempts(request_id,organization_id,store_id,cnpj,client_id,model,series,number,
    origin_id,invoice_id,local_state,send_state,created_by,next_at,code,origin)
    values(p_request,i.organization_id,i.store_id,'01997929000108',l.client_id,i.tipo_documento,i.serie::integer,i.numero::integer,
      l.origin_id,i.id,'authorized','possibly_sent',l.created_by,null,'RECOVERY_LEGACY_ASSOCIATED','central') returning * into a;
  -- No post_started_at is fabricated. Authorized state and null payload block
  -- first submission. The canonical result/artifacts are applied by the caller.
  perform set_config('fiscal_recovery_gop.writer','recovery-v1',true);
  update public.fiscal_invoices set nuvemfiscal_uuid='rv1_'||p_request::text,recovery_request_id=p_request,
    recovery_phase='authorized',recovery_version=0 where id=i.id;
  perform set_config('fiscal_recovery_gop.writer',coalesce(previous_writer,''),true);
  update fiscal_recovery_gop.legacy_associations set associated_at=clock_timestamp() where invoice_id=i.id;
  return fiscal_recovery_gop.attempt_json(a);
end $$;
revoke all on function public.gop_recovery_legacy_reserve_v1(bigint,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.gop_recovery_legacy_finish_v1(bigint,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.gop_recovery_legacy_reserve_v1(bigint,uuid,uuid,text) to service_role;
grant execute on function public.gop_recovery_legacy_finish_v1(bigint,uuid,uuid,text,jsonb) to service_role;
commit;
