-- PREPARE ONLY. Local cancellation admission is separate from emission.
begin;
alter table public.fiscal_invoices add column recovery_cancel_phase text;
create table fiscal_recovery_gop.cancellations (
  intent_id uuid primary key,
  request_id uuid not null references fiscal_recovery_gop.attempts(request_id),
  justification text not null check(length(justification) between 15 and 255),
  phase text not null default 'prepared' check(phase in ('prepared','possibly_sent','delegated','manual_review','confirmed','rejected','blocked_local')),
  post_started_at timestamptz,
  version bigint not null default 1,
  observed_version bigint not null default 0,
  next_at timestamptz default(clock_timestamp()+interval '90 seconds'),
  lease_token uuid,lease_until timestamptz,
  query_attempt integer not null default 0,
  created_by uuid not null,created_at timestamptz not null default clock_timestamp()
);
create unique index gop_recovery_cancel_active on fiscal_recovery_gop.cancellations(request_id)
  where phase not in ('rejected','blocked_local');
alter table fiscal_recovery_gop.cancellations enable row level security;
revoke all on fiscal_recovery_gop.cancellations from public,anon,authenticated,service_role;
create trigger gop_recovery_cancel_wake after insert or update of next_at on fiscal_recovery_gop.cancellations
  for each row execute function fiscal_recovery_gop.notify_work();
create function fiscal_recovery_gop.cancel_json(c fiscal_recovery_gop.cancellations) returns jsonb
language sql stable set search_path=pg_catalog as $$
  select jsonb_build_object('intentId',c.intent_id,'requestId',c.request_id,'justification',c.justification,
    'phase',c.phase,'version',c.version,'postStartedAt',c.post_started_at)
$$;
create function fiscal_recovery_gop.sync_cancel_invoice(p_request uuid,p_phase text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare previous_writer text:=current_setting('fiscal_recovery_gop.writer',true);
begin
  perform set_config('fiscal_recovery_gop.writer','recovery-v1',true);
  update public.fiscal_invoices set recovery_cancel_phase=p_phase
    where id=(select invoice_id from fiscal_recovery_gop.attempts where request_id=p_request);
  if not found then raise exception 'RECOVERY_CANCEL_INVOICE_MISSING';end if;
  perform set_config('fiscal_recovery_gop.writer',coalesce(previous_writer,''),true);
end $$;
create function public.gop_recovery_cancel_get_v1(p_request uuid) returns jsonb
language sql security definer set search_path=pg_catalog as $$
  select fiscal_recovery_gop.cancel_json(c) from fiscal_recovery_gop.cancellations c
    where request_id=p_request order by created_at desc,intent_id desc limit 1
$$;
create function public.gop_recovery_cancel_reserve_v1(p_request uuid,p_intent uuid,p_actor uuid,p_justification text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a fiscal_recovery_gop.attempts;c fiscal_recovery_gop.cancellations;
begin
  if p_intent is null or p_actor is null or p_justification is null or p_justification<>btrim(p_justification) or
    length(p_justification) not between 15 and 255 then raise exception 'RECOVERY_CANCEL_REQUEST_INVALID';end if;
  select * into a from fiscal_recovery_gop.attempts where request_id=p_request for update;
  if a.request_id is null or a.store_id<>1 or a.organization_id<>'40b34e90-4c9d-4446-b775-770a3e77d6c0'::uuid or
    not exists(select 1 from public.profiles where id=p_actor and tenant_id=a.organization_id and (store_id=a.store_id or role='admin')) then
    raise exception 'RECOVERY_CANCEL_ACCESS_DENIED';end if;
  select * into c from fiscal_recovery_gop.cancellations where intent_id=p_intent;
  if c.intent_id is not null and (c.request_id<>p_request or c.justification<>p_justification) then raise exception 'RECOVERY_CANCEL_CONFLICT';end if;
  if c.intent_id is null then select * into c from fiscal_recovery_gop.cancellations where request_id=p_request and phase not in ('rejected','blocked_local');end if;
  if c.intent_id is not null then return fiscal_recovery_gop.cancel_json(c);end if;
  if a.local_state<>'authorized' then raise exception 'RECOVERY_CANCEL_NOT_AUTHORIZED';end if;
  insert into fiscal_recovery_gop.cancellations(intent_id,request_id,justification,created_by)
    values(p_intent,p_request,p_justification,p_actor) returning * into c;
  perform fiscal_recovery_gop.sync_cancel_invoice(p_request,'prepared');
  return fiscal_recovery_gop.cancel_json(c);
end $$;
create function public.gop_recovery_cancel_start_v1(p_intent uuid,p_version bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare c fiscal_recovery_gop.cancellations;
begin
  update fiscal_recovery_gop.cancellations set phase='possibly_sent',post_started_at=clock_timestamp(),version=version+1,
    next_at=clock_timestamp()+interval '30 seconds'
    where intent_id=p_intent and version=p_version and phase='prepared' and post_started_at is null returning * into c;
  if c.intent_id is null then return null;end if;
  perform fiscal_recovery_gop.sync_cancel_invoice(c.request_id,'possibly_sent');
  return fiscal_recovery_gop.cancel_json(c);
end $$;
create function public.gop_recovery_cancel_observe_v1(p_request uuid,p_result jsonb) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare a fiscal_recovery_gop.attempts;c fiscal_recovery_gop.cancellations;r jsonb:=p_result->'recovery';state text;
begin
  select * into a from fiscal_recovery_gop.attempts where request_id=p_request for update;
  if a.request_id is null or r->>'requestId' is distinct from p_request::text or
    coalesce((r->>'version')::bigint,0)<1 or (r->>'version')::bigint>a.server_version or r->>'clientId' is distinct from a.client_id or
    r->>'organizationId' is distinct from a.organization_id::text or (r->>'storeId')::bigint is distinct from a.store_id then
    raise exception 'RECOVERY_CANCEL_OBSERVATION_INVALID';end if;
  select * into c from fiscal_recovery_gop.cancellations where request_id=p_request and phase not in ('rejected','blocked_local') for update;
  if c.intent_id is null then return false;end if;
  if c.phase='confirmed' then return true;end if;
  if (r->>'version')::bigint<c.observed_version then return false;end if;
  if p_result->'cancelamento'->>'tentativa_id' is distinct from c.intent_id::text then return false;end if;
  state:=p_result->'cancelamento'->>'estado';
  if state='confirmado' and a.local_state<>'cancelled' then raise exception 'RECOVERY_CANCEL_ARTIFACT_NOT_APPLIED';end if;
  if coalesce(state,'') not in ('confirmado','rejeitado','bloqueado_local','pendente_confirmacao','pendente_transmissao') then return false;end if;
  update fiscal_recovery_gop.cancellations set phase=case state when 'confirmado' then 'confirmed' when 'rejeitado' then 'rejected'
    when 'bloqueado_local' then 'blocked_local' else case when r->>'errorOrigin'='central' and
      r->>'code'='RECOVERY_CANCELLATION_EVIDENCE_INVALID' then 'manual_review' else 'delegated' end end,
    next_at=null,lease_token=null,lease_until=null,observed_version=(r->>'version')::bigint,version=version+1 where intent_id=c.intent_id returning * into c;
  perform fiscal_recovery_gop.sync_cancel_invoice(p_request,c.phase);
  return true;
end $$;
create function public.gop_recovery_cancel_claim_v1(p_client text,p_org uuid,p_store bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare c fiscal_recovery_gop.cancellations;a fiscal_recovery_gop.attempts;token uuid:=gen_random_uuid();
begin
  select b.* into c from fiscal_recovery_gop.cancellations b join fiscal_recovery_gop.attempts invoice_attempt on invoice_attempt.request_id=b.request_id
    where invoice_attempt.client_id=p_client and invoice_attempt.organization_id=p_org and invoice_attempt.store_id=p_store and b.phase in ('prepared','possibly_sent')
      and b.next_at<=clock_timestamp() and coalesce(b.lease_until,b.next_at)<=clock_timestamp()
    order by b.next_at,b.intent_id for update of b skip locked limit 1;
  if c.intent_id is null then return null;end if;
  if c.post_started_at is null then
    update fiscal_recovery_gop.cancellations set phase='blocked_local',next_at=null,version=version+1 where intent_id=c.intent_id;
    perform fiscal_recovery_gop.sync_cancel_invoice(c.request_id,'blocked_local');
    return jsonb_build_object('attention',true);end if;
  update fiscal_recovery_gop.cancellations set lease_token=token,lease_until=clock_timestamp()+interval '90 seconds',query_attempt=query_attempt+1
    where intent_id=c.intent_id returning * into c;
  select * into strict a from fiscal_recovery_gop.attempts where request_id=c.request_id;
  return jsonb_build_object('token',token,'cancellation',fiscal_recovery_gop.cancel_json(c),'attempt',fiscal_recovery_gop.attempt_json(a));
end $$;
create function public.gop_recovery_cancel_retry_v1(p_intent uuid,p_version bigint,p_token uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if p_token is null then return false;end if;
  update fiscal_recovery_gop.cancellations set lease_token=null,lease_until=null,version=version+1,
    next_at=clock_timestamp()+least(1800,30*power(2,least(query_attempt-1,6)))*interval '1 second'
    where intent_id=p_intent and version=p_version and lease_token=p_token and lease_until>clock_timestamp() and phase='possibly_sent';
  return found;
end $$;
create function public.gop_recovery_cancel_due_v1(p_client text,p_org uuid,p_store bigint) returns timestamptz
language sql security definer set search_path=pg_catalog as $$
  select min(greatest(b.next_at,coalesce(b.lease_until,b.next_at))) from fiscal_recovery_gop.cancellations b
    join fiscal_recovery_gop.attempts a on a.request_id=b.request_id where a.client_id=p_client and a.organization_id=p_org and a.store_id=p_store
      and b.phase in ('prepared','possibly_sent') and b.next_at is not null
$$;
revoke all on function fiscal_recovery_gop.cancel_json(fiscal_recovery_gop.cancellations) from public,anon,authenticated,service_role;
revoke all on function fiscal_recovery_gop.sync_cancel_invoice(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.gop_recovery_cancel_get_v1(uuid) from public,anon,authenticated;
grant execute on function public.gop_recovery_cancel_get_v1(uuid) to service_role;
revoke all on function public.gop_recovery_cancel_reserve_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.gop_recovery_cancel_start_v1(uuid,bigint) from public,anon,authenticated;
revoke all on function public.gop_recovery_cancel_observe_v1(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.gop_recovery_cancel_claim_v1(text,uuid,bigint) from public,anon,authenticated;
revoke all on function public.gop_recovery_cancel_retry_v1(uuid,bigint,uuid) from public,anon,authenticated;
revoke all on function public.gop_recovery_cancel_due_v1(text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.gop_recovery_cancel_reserve_v1(uuid,uuid,uuid,text) to service_role;
grant execute on function public.gop_recovery_cancel_start_v1(uuid,bigint) to service_role;
grant execute on function public.gop_recovery_cancel_observe_v1(uuid,jsonb) to service_role;
grant execute on function public.gop_recovery_cancel_claim_v1(text,uuid,bigint) to service_role;
grant execute on function public.gop_recovery_cancel_retry_v1(uuid,bigint,uuid) to service_role;
grant execute on function public.gop_recovery_cancel_due_v1(text,uuid,bigint) to service_role;
commit;
