-- PREPARE ONLY: local pilot integration. Not applied to the hosted database.
-- Review installed schema/functions, backup and rollout before applying.
begin;
alter table public.fiscal_invoices add column recovery_request_id uuid,
  add column recovery_phase text,add column recovery_version bigint,
  add column error_origin text,add column external_status_code text,add column cancellation_xml_content text;
create schema fiscal_recovery_gop;
revoke all on schema fiscal_recovery_gop from public,anon,authenticated,service_role;
create table fiscal_recovery_gop.attempts (
  request_id uuid primary key,
  organization_id uuid not null,
  store_id bigint not null references public.stores(id),
  cnpj text not null check(cnpj ~ '^[0-9]{14}$'),
  client_id text not null,
  model text not null check(model in ('NFe','NFCe')),
  series integer not null check(series between 1 and 999),
  number integer not null check(number>0),
  origin_id text not null check(length(origin_id) between 1 and 200),
  invoice_id bigint not null unique references public.fiscal_invoices(id),
  reserved boolean not null default true,
  local_state text not null default 'prepared',
  server_version bigint not null default 0,
  version bigint not null default 1,
  post_started_at timestamptz,
  payload jsonb,
  code text not null default 'LOCAL_PREPARED',
  origin text not null default 'consumer',
  send_state text not null default 'not_started_proven',
  resume_local boolean not null default false,
  next_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(organization_id,store_id,model,series,number)
);
create unique index gop_recovery_origin_reserved on fiscal_recovery_gop.attempts(organization_id,store_id,origin_id) where reserved;
create index gop_recovery_due on fiscal_recovery_gop.attempts(next_at) where next_at is not null;
create table fiscal_recovery_gop.inbox (
  event_id text primary key,
  request_id uuid not null references fiscal_recovery_gop.attempts(request_id),
  body_hash text not null,
  received_at timestamptz not null default clock_timestamp(),
  applied_at timestamptz
);
create table fiscal_recovery_gop.effects (
  request_id uuid not null references fiscal_recovery_gop.attempts(request_id),
  effect text not null,
  server_version bigint not null,
  applied_at timestamptz not null default clock_timestamp(),
  primary key(request_id,effect,server_version)
);
alter table fiscal_recovery_gop.attempts enable row level security;
alter table fiscal_recovery_gop.inbox enable row level security;
alter table fiscal_recovery_gop.effects enable row level security;
revoke all on all tables in schema fiscal_recovery_gop from public,anon,authenticated,service_role;

create function fiscal_recovery_gop.notify_work() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin perform pg_notify('fiscal_recovery_v1','wake');return new;end $$;
create trigger gop_recovery_wake after insert or update of next_at on fiscal_recovery_gop.attempts
  for each row execute function fiscal_recovery_gop.notify_work();

create function fiscal_recovery_gop.guard_invoice() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if exists(select 1 from fiscal_recovery_gop.attempts where invoice_id=old.id) and
    current_setting('fiscal_recovery_gop.writer',true) is distinct from 'recovery-v1' then
    raise exception 'RECOVERY_INVOICE_OWNED';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger gop_recovery_invoice_barrier before update or delete on public.fiscal_invoices
  for each row execute function fiscal_recovery_gop.guard_invoice();

create function fiscal_recovery_gop.attempt_json(a fiscal_recovery_gop.attempts) returns jsonb
language sql stable set search_path=pg_catalog as $$
  select jsonb_build_object('requestId',a.request_id,'organizationId',a.organization_id,'storeId',a.store_id,
    'cnpj',a.cnpj,'clientId',a.client_id,'model',a.model,'series',a.series,'number',a.number,'originId',a.origin_id,'invoiceId',a.invoice_id,
    'version',a.version,'serverVersion',a.server_version,'state',a.local_state,'postStartedAt',a.post_started_at,
    'code',a.code,'origin',a.origin,'payload',a.payload,'resumeLocal',a.resume_local)
$$;

create function public.gop_recovery_reserve_v1(p_request uuid,p_org uuid,p_store bigint,p_cnpj text,p_model text,
  p_series integer,p_origin text,p_work_order bigint,p_actor uuid,p_client text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a fiscal_recovery_gop.attempts; invoice bigint; n integer;
begin
  -- Pilot must not broaden by CNPJ alone or by a client-provided store selector.
  if p_request is null or p_org is distinct from '40b34e90-4c9d-4446-b775-770a3e77d6c0'::uuid or
    p_store is distinct from 1 or p_cnpj is distinct from '01997929000108' or p_series is distinct from 2 or
    coalesce(p_model,'') not in ('NFe','NFCe') or coalesce(length(p_client),0)<6 or coalesce(length(p_origin),0) not between 1 and 200 or
    not exists(select 1 from public.stores s where s.id=p_store and s.tenant_id=p_org and
      regexp_replace(s.cnpj,'\D','','g')=p_cnpj and
      case when p_model='NFCe' then s.nfce_serie else s.nfe_serie end=p_series) or
    not exists(select 1 from public.profiles p where p.id=p_actor and p.tenant_id=p_org and
      (p.store_id=p_store or p.role='admin')) then raise exception 'RECOVERY_PILOT_ACCESS_DENIED'; end if;
  if p_work_order is not null then
    perform pg_advisory_xact_lock(hashtextextended('fiscal-origin:'||p_org::text||':'||p_store::text||':'||p_work_order::text,0));
    if p_origin like 'sale:%' and (p_origin is distinct from 'sale:'||p_work_order::text or
      not exists(select 1 from public.vendas where id=p_work_order and tenant_id=p_org and store_id=p_store)) then
      raise exception 'RECOVERY_SALE_ORIGIN_INVALID';end if;
  elsif p_origin like 'sale:%' then raise exception 'RECOVERY_SALE_ORIGIN_INVALID';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_store||':'||p_origin,0));
  select * into a from fiscal_recovery_gop.attempts where organization_id=p_org and store_id=p_store and origin_id=p_origin and reserved for update;
  if a.request_id is not null then
    if a.model<>p_model or a.series<>p_series or a.client_id<>p_client then raise exception 'RECOVERY_ORIGIN_ALREADY_RESERVED'; end if;
    return jsonb_build_object('created',false,'attempt',fiscal_recovery_gop.attempt_json(a));
  end if;
  if p_work_order is not null and exists(select 1 from public.fiscal_invoices i where i.organization_id=p_org and
    i.store_id=p_store and i.work_order_id=p_work_order and i.environment='production' and i.direction='output' and
    i.status in ('draft','processing','authorized') and
    (i.tipo_documento=p_model or (p_origin like 'sale:%' and i.tipo_documento in ('NFe','NFCe')))) then
    raise exception 'RECOVERY_LEGACY_ORIGIN_RESERVED'; end if;
  -- Counter allocation and invoice insertion are in this same short transaction.
  -- No HTTP or SEFAZ call can run while these locks are held.
  if p_model='NFCe' then n:=public.get_next_nfce_number(p_org,p_store,p_series,'production');
  else n:=public.get_next_nfe_number(p_org,p_store,p_series,'production');end if;
  if n is null or n<1 then raise exception 'RECOVERY_NUMBER_UNAVAILABLE';end if;
  insert into public.fiscal_invoices(organization_id,store_id,work_order_id,tipo_documento,status,environment,direction,
    numero,serie,emitente_cnpj,nuvemfiscal_uuid,recovery_request_id,recovery_phase,recovery_version,error_origin)
    values(p_org,p_store,p_work_order,p_model,'processing','production','output',n::text,p_series::text,p_cnpj,'rv1_'||p_request::text,
      p_request,'prepared',0,'consumer')
    returning id into invoice;
  insert into fiscal_recovery_gop.attempts(request_id,organization_id,store_id,cnpj,client_id,model,series,number,origin_id,invoice_id,created_by)
    values(p_request,p_org,p_store,p_cnpj,p_client,p_model,p_series,n,p_origin,invoice,p_actor) returning * into a;
  return jsonb_build_object('created',true,'attempt',fiscal_recovery_gop.attempt_json(a));
end $$;

create function public.gop_recovery_get_v1(p_request uuid default null,p_invoice bigint default null) returns jsonb
language sql security definer set search_path=pg_catalog as $$
  select fiscal_recovery_gop.attempt_json(a) from fiscal_recovery_gop.attempts a
    where (p_request is not null and a.request_id=p_request) or (p_invoice is not null and a.invoice_id=p_invoice)
$$;

create function public.gop_recovery_prepare_v1(p_request uuid,p_version bigint,p_payload jsonb,p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a fiscal_recovery_gop.attempts; ide jsonb; previous_writer text:=current_setting('fiscal_recovery_gop.writer',true);
  marker text; reference_key text; item record; total_returned numeric; available numeric; supplied numeric;
begin
  if p_version is null then return null;end if;
  select * into a from fiscal_recovery_gop.attempts where request_id=p_request for update;
  if a.request_id is null or a.version<>p_version or a.local_state not in ('prepared','blocked_local') or
    (a.post_started_at is not null and not(a.local_state='blocked_local' and a.send_state='not_started_proven')) then return null;end if;
  ide:=p_payload->'infNFe'->'ide';
  if p_payload->>'ambiente' is distinct from 'producao' or (ide->>'nNF')::integer is distinct from a.number or
    (ide->>'serie')::integer is distinct from a.series or (ide->>'tpAmb')::integer is distinct from 1 or
    (ide->>'mod')::integer is distinct from (case when a.model='NFCe' then 65 else 55 end) or
    p_payload->'infNFe'->'emit'->>'CNPJ' is distinct from a.cnpj then raise exception 'RECOVERY_PAYLOAD_IDENTITY_INVALID';end if;
  p_payload:=p_payload||jsonb_build_object('_recovery_origin_id',a.origin_id);
  for marker in select unnest(array['_entry_access_key','_shipment_origin_key','_demonstration_origin_key','_transfer_deposit_origin_key']) loop
    reference_key:=p_payload->>marker;
    if reference_key is null then continue;end if;
    if a.model<>'NFe' or reference_key !~ '^[0-9]{44}$' or not coalesce((ide->'NFref') @>
      jsonb_build_array(jsonb_build_object('refNFe',reference_key)),false) then raise exception 'RECOVERY_SPECIAL_REFERENCE_INVALID';end if;
    perform pg_advisory_xact_lock(hashtextextended('fiscal-reference:'||a.organization_id::text||':'||a.store_id||':'||marker||':'||reference_key,0));
    if marker<>'_entry_access_key' then
      if exists(select 1 from public.fiscal_invoices i where i.organization_id=a.organization_id and i.store_id=a.store_id and
        i.id<>a.invoice_id and i.environment='production' and i.tipo_documento='NFe' and i.direction='output' and
        i.status in ('draft','processing','authorized') and i.payload_json->>marker=reference_key) then
        raise exception 'RECOVERY_SPECIAL_REFERENCE_RESERVED';end if;
    else
      if jsonb_typeof(p_snapshot->'return_limits') is distinct from 'object' then raise exception 'RECOVERY_RETURN_LIMITS_REQUIRED';end if;
      for item in select d->'prod'->>'cProd' as code,sum((d->'prod'->>'qCom')::numeric) as quantity
        from jsonb_array_elements(p_payload->'infNFe'->'det') d group by d->'prod'->>'cProd' loop
        supplied:=item.quantity;available:=(p_snapshot->'return_limits'->>item.code)::numeric;
        if supplied is null or supplied<=0 or available is null or available<=0 then raise exception 'RECOVERY_RETURN_ORIGIN_INVALID';end if;
        select coalesce(sum((d->'prod'->>'qCom')::numeric),0) into total_returned from public.fiscal_invoices i,
          lateral jsonb_array_elements(i.payload_json->'infNFe'->'det') d where i.organization_id=a.organization_id and i.store_id=a.store_id
          and i.id<>a.invoice_id and i.environment='production' and i.tipo_documento='NFe' and i.direction='output'
          and i.status in ('draft','processing','authorized') and i.payload_json->>marker=reference_key and d->'prod'->>'cProd'=item.code;
        if total_returned+supplied>available then raise exception 'RECOVERY_RETURN_QUANTITY_RESERVED';end if;
      end loop;
    end if;
  end loop;
  perform set_config('fiscal_recovery_gop.writer','recovery-v1',true);
  update public.fiscal_invoices set payload_json=p_payload,valor_total=(p_snapshot->>'valor_total')::numeric,
    emitente_nome=p_snapshot->>'emitente_nome',destinatario_nome=p_snapshot->>'destinatario_nome',
    destinatario_cnpj=p_snapshot->>'destinatario_cnpj',data_emissao=coalesce((p_snapshot->>'data_emissao')::timestamptz,data_emissao),
    error_message=null,status='processing',recovery_phase='prepared',error_origin='consumer' where id=a.invoice_id;
  perform set_config('fiscal_recovery_gop.writer',coalesce(previous_writer,''),true);
  update fiscal_recovery_gop.attempts set payload=p_payload,resume_local=(resume_local or local_state='blocked_local'),
    local_state='prepared',post_started_at=null,version=version+1,updated_at=clock_timestamp()
    where request_id=a.request_id returning * into a;
  return fiscal_recovery_gop.attempt_json(a);
end $$;

create function public.gop_recovery_start_post_v1(p_request uuid,p_version bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a fiscal_recovery_gop.attempts;
begin
  if p_version is null then return null;end if;
  update fiscal_recovery_gop.attempts set post_started_at=clock_timestamp(),local_state='submission_unknown',send_state='possibly_sent',
    next_at=clock_timestamp()+interval '30 seconds',version=version+1,updated_at=clock_timestamp()
    where request_id=p_request and version=p_version and payload is not null and post_started_at is null and local_state='prepared'
    returning * into a;
  if a.request_id is null then return null;end if;
  return fiscal_recovery_gop.attempt_json(a);
end $$;

create function public.gop_recovery_local_failure_v1(p_request uuid,p_code text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a fiscal_recovery_gop.attempts; previous_writer text:=current_setting('fiscal_recovery_gop.writer',true);
begin
  select * into a from fiscal_recovery_gop.attempts where request_id=p_request for update;
  if a.request_id is null then return null;end if;
  if a.local_state in ('authorized','rejected','cancelled') then return fiscal_recovery_gop.attempt_json(a);end if;
  update fiscal_recovery_gop.attempts set local_state=case when post_started_at is null or
      (local_state='blocked_local' and send_state='not_started_proven') then 'blocked_local' else 'submission_unknown' end,
    origin=case when post_started_at is null or (local_state='blocked_local' and send_state='not_started_proven') then 'consumer' else 'transport' end,
    code=left(coalesce(p_code,'LOCAL_FAILURE'),128),version=version+1,
    next_at=case when post_started_at is null or (local_state='blocked_local' and send_state='not_started_proven')
      then null else clock_timestamp()+interval '1 minute' end,updated_at=clock_timestamp()
    where request_id=a.request_id returning * into a;
  perform set_config('fiscal_recovery_gop.writer','recovery-v1',true);
  update public.fiscal_invoices set status='processing',recovery_phase=a.local_state,error_origin=a.origin,
    error_message=case when a.local_state='blocked_local'
    then 'Validacao local: corrija esta tentativa; numero preservado.' else 'Resultado ainda nao confirmado; nota em acompanhamento.' end
    where id=a.invoice_id;
  perform set_config('fiscal_recovery_gop.writer',coalesce(previous_writer,''),true);
  return fiscal_recovery_gop.attempt_json(a);
end $$;

create function public.gop_recovery_apply_v1(p_request uuid,p_server_version bigint,p_result jsonb,p_xml text default null,p_event text default null,p_cancel_xml text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a fiscal_recovery_gop.attempts; r jsonb:=p_result->'recovery'; new_status text; new_state text; key text:=p_result->>'chave';
  previous_writer text:=current_setting('fiscal_recovery_gop.writer',true); old_state text;
begin
  select * into a from fiscal_recovery_gop.attempts where request_id=p_request for update;
  if a.request_id is null or p_server_version is null or p_server_version<1 or r->>'schema' is distinct from 'recovery-v1' or
    (r->>'version')::bigint is distinct from p_server_version or r->>'requestId' is distinct from p_request::text or
    r->>'originId' is distinct from a.origin_id or (r->>'storeId')::bigint is distinct from a.store_id or
    r->>'organizationId' is distinct from a.organization_id::text or r->>'clientId' is distinct from a.client_id or
    p_result->>'id' is distinct from 'rv1_'||p_request::text or (p_result->>'numero')::integer is distinct from a.number or
    (p_result->>'serie')::integer is distinct from a.series then raise exception 'RECOVERY_RESULT_SCOPE_INVALID';end if;
  if key is not null and (key !~ '^[0-9]{44}$' or substr(key,7,14)<>a.cnpj or substr(key,21,2)<>
    (case when a.model='NFCe' then '65' else '55' end) or substr(key,23,3)::integer<>a.series or substr(key,26,9)::integer<>a.number) then
    raise exception 'RECOVERY_RESULT_KEY_INVALID';end if;
  if p_server_version<=a.server_version then
    if p_event is not null then update fiscal_recovery_gop.inbox set applied_at=coalesce(applied_at,clock_timestamp()) where event_id=p_event and request_id=p_request;end if;
    return jsonb_build_object('applied',false,'attempt',fiscal_recovery_gop.attempt_json(a));
  end if;
  if coalesce(r->>'sendState','') not in ('not_started_proven','possibly_sent') or
    coalesce(r->>'errorOrigin','') not in ('consumer','central','transport','sefaz') or
    jsonb_typeof(r->'code') is distinct from 'string' or length(r->>'code')>128 or
    coalesce(r->>'phase','') not in ('accepted','prepared','send_started','pending','authorized','rejected',
      'blocked_local','manual_review','cancel_started','cancel_pending','cancelled') then
    raise exception 'RECOVERY_RESULT_METADATA_INVALID';end if;
  if p_result->>'status' is distinct from (case r->>'phase'
    when 'authorized' then 'autorizado' when 'cancel_started' then 'autorizado' when 'cancel_pending' then 'autorizado'
    when 'rejected' then 'rejeitado' when 'blocked_local' then 'erro' when 'cancelled' then 'cancelado' else 'processamento' end) then
    raise exception 'RECOVERY_RESULT_PHASE_INVALID';end if;
  new_status:=case p_result->>'status' when 'autorizado' then 'authorized' when 'rejeitado' then 'rejected'
    when 'cancelado' then 'cancelled' else 'processing' end;
  new_state:=case when r->>'phase'='blocked_local' then 'blocked_local' when r->>'phase'='manual_review' then 'manual_review'
    when new_status='processing' then 'submission_unknown' else new_status end;
  if a.local_state='cancelled' or (a.local_state='authorized' and new_status not in ('authorized','cancelled')) or
    (a.local_state='rejected' and new_status<>'rejected') then raise exception 'RECOVERY_TERMINAL_REGRESSION';end if;
  if new_status='authorized' and (key is null or coalesce(p_result->>'protocolo','') !~ '^[0-9]{15}$' or
    coalesce(p_xml,'')='' or r->>'phase' not in ('authorized','cancel_started','cancel_pending')) then
    raise exception 'RECOVERY_AUTHORIZATION_UNVERIFIED';end if;
  if new_status='rejected' and (r->>'phase' is distinct from 'rejected' or r->>'errorOrigin' is distinct from 'sefaz' or
    r->>'code' !~ '^[0-9]{3}$' or (r->>'code')::integer<200 or
    r->>'code' in ('204','217','301','302','303','539','656','999')) then raise exception 'RECOVERY_REJECTION_UNCERTAIN';end if;
  if new_status='cancelled' and (r->>'phase' is distinct from 'cancelled' or coalesce(p_cancel_xml,'')='' or coalesce(p_xml,'')='' or
    key is null or coalesce(p_result->>'protocolo','') !~ '^[0-9]{15}$' or
    coalesce(p_result->'cancelamento'->>'tentativa_id','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' or
    p_result->'cancelamento'->>'estado' is distinct from 'confirmado' or
    coalesce(p_result->'cancelamento'->>'codigo_status','') not in ('135','155') or
    coalesce(p_result->'cancelamento'->>'numero_protocolo','') !~ '^[0-9]{15}$') then
    raise exception 'RECOVERY_CANCELLATION_UNVERIFIED';end if;
  if new_state='blocked_local' and (r->>'sendState' is distinct from 'not_started_proven' or
    coalesce(r->>'errorOrigin','') not in ('central','consumer')) then raise exception 'RECOVERY_BLOCK_UNCERTAIN';end if;
  old_state:=a.local_state;
  perform set_config('fiscal_recovery_gop.writer','recovery-v1',true);
  update public.fiscal_invoices set status=new_status,nuvemfiscal_uuid='rv1_'||p_request::text,chave_acesso=coalesce(key,chave_acesso),
    recovery_phase=r->>'phase',recovery_version=p_server_version,error_origin=r->>'errorOrigin',
    external_status_code=case when r->>'errorOrigin'='sefaz' then r->>'code' else null end,
    xml_url=coalesce(p_result->>'xml_url',xml_url),pdf_url=coalesce(p_result->>'pdf_url',pdf_url),xml_content=coalesce(p_xml,xml_content),
    cancellation_xml_content=coalesce(p_cancel_xml,cancellation_xml_content),
    error_message=case when new_status in ('authorized','cancelled') then null else coalesce(p_result->>'motivo','Resultado em acompanhamento.') end
    where id=a.invoice_id and organization_id=a.organization_id and store_id=a.store_id;
  if not found then raise exception 'RECOVERY_INVOICE_MISSING';end if;
  if a.model='NFCe' and a.origin_id like 'sale:%' and
    ((new_status='authorized' and old_state<>'authorized') or new_status='cancelled') then
    update public.vendas set nf_emitida=(new_status='authorized') where id=
      (select work_order_id from public.fiscal_invoices where id=a.invoice_id) and store_id=a.store_id;
    if not found then raise exception 'RECOVERY_SALE_EFFECT_TARGET_MISSING';end if;
    insert into fiscal_recovery_gop.effects(request_id,effect,server_version)
      values(p_request,case when new_status='authorized' then 'nfce_authorized' else 'nfce_cancelled' end,p_server_version);
  end if;
  perform set_config('fiscal_recovery_gop.writer',coalesce(previous_writer,''),true);
  update fiscal_recovery_gop.attempts set server_version=p_server_version,local_state=new_state,send_state=r->>'sendState',
    origin=r->>'errorOrigin',code=r->>'code',reserved=new_status not in ('rejected','cancelled'),next_at=null,
    lease_token=null,lease_until=null,version=version+1,updated_at=clock_timestamp()
    where request_id=p_request returning * into a;
  if p_event is not null then update fiscal_recovery_gop.inbox set applied_at=clock_timestamp() where event_id=p_event and request_id=p_request;end if;
  return jsonb_build_object('applied',true,'attempt',fiscal_recovery_gop.attempt_json(a));
end $$;

revoke all on all functions in schema fiscal_recovery_gop from public,anon,authenticated,service_role;
revoke all on function public.gop_recovery_reserve_v1(uuid,uuid,bigint,text,text,integer,text,bigint,uuid,text) from public,anon,authenticated;
revoke all on function public.gop_recovery_get_v1(uuid,bigint) from public,anon,authenticated;
revoke all on function public.gop_recovery_prepare_v1(uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.gop_recovery_start_post_v1(uuid,bigint) from public,anon,authenticated;
revoke all on function public.gop_recovery_local_failure_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.gop_recovery_apply_v1(uuid,bigint,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.gop_recovery_reserve_v1(uuid,uuid,bigint,text,text,integer,text,bigint,uuid,text) to service_role;
grant execute on function public.gop_recovery_get_v1(uuid,bigint) to service_role;
grant execute on function public.gop_recovery_prepare_v1(uuid,bigint,jsonb,jsonb) to service_role;
grant execute on function public.gop_recovery_start_post_v1(uuid,bigint) to service_role;
grant execute on function public.gop_recovery_local_failure_v1(uuid,text) to service_role;
grant execute on function public.gop_recovery_apply_v1(uuid,bigint,jsonb,text,text,text) to service_role;
commit;
