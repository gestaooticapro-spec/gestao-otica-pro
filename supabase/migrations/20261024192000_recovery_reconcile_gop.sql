-- PREPARE ONLY. Durable query-only reconciliation, without a browser or cron.
begin;
alter table fiscal_recovery_gop.attempts add column reconcile_attempt integer not null default 0;
alter table fiscal_recovery_gop.attempts alter column next_at set default (clock_timestamp()+interval '90 seconds');

create function public.gop_recovery_due_v1(p_client text,p_org uuid,p_store bigint) returns timestamptz
language sql security definer set search_path=pg_catalog as $$
  select min(greatest(next_at,coalesce(lease_until,next_at))) from fiscal_recovery_gop.attempts
    where client_id=p_client and organization_id=p_org and store_id=p_store and next_at is not null
      and local_state in ('prepared','submission_unknown')
$$;

create function public.gop_recovery_reconcile_claim_v1(p_client text,p_org uuid,p_store bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a fiscal_recovery_gop.attempts; token uuid:=gen_random_uuid();
begin
  if p_store is distinct from 1 or p_org is distinct from '40b34e90-4c9d-4446-b775-770a3e77d6c0'::uuid or
    coalesce(p_client,'')='' then raise exception 'RECOVERY_RECONCILE_SCOPE_INVALID';end if;
  select * into a from fiscal_recovery_gop.attempts where client_id=p_client and organization_id=p_org and store_id=p_store
    and next_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp())
    and local_state in ('prepared','submission_unknown') order by next_at,request_id for update skip locked limit 1;
  if a.request_id is null then return null;end if;
  if a.post_started_at is null then
    -- The only POST adapter persists its intent first. Interrupted local
    -- preparation can await correction; it is never automatically transmitted.
    perform public.gop_recovery_local_failure_v1(a.request_id,'RECOVERY_PREPARATION_INTERRUPTED');
    return jsonb_build_object('attention',true);
  end if;
  update fiscal_recovery_gop.attempts set lease_token=token,lease_until=clock_timestamp()+interval '90 seconds',
    reconcile_attempt=reconcile_attempt+1 where request_id=a.request_id returning * into a;
  return jsonb_build_object('token',token,'version',a.version,'attempt',fiscal_recovery_gop.attempt_json(a));
end $$;

create function public.gop_recovery_reconcile_complete_v1(p_request uuid,p_version bigint,p_token uuid,p_observed_version bigint)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare a fiscal_recovery_gop.attempts; previous_writer text:=current_setting('fiscal_recovery_gop.writer',true);
begin
  select * into a from fiscal_recovery_gop.attempts where request_id=p_request for update;
  if a.request_id is null or p_token is null or a.lease_token is null or a.lease_until is null or
    a.version is distinct from p_version or a.lease_token is distinct from p_token or
    a.lease_until<=clock_timestamp() then return false;end if;
  if p_observed_version is not null and (p_observed_version<1 or p_observed_version>a.server_version) then
    raise exception 'RECOVERY_RECONCILE_ACK_INVALID';end if;
  -- A canonical state is now owned by the central controller and its outbox.
  -- A missing/failed lookup remains uncertain and keeps its origin/number.
  update fiscal_recovery_gop.attempts set lease_token=null,lease_until=null,version=version+1,
    next_at=case when p_observed_version is not null then null else clock_timestamp()+
      least(1800,30*power(2,least(reconcile_attempt-1,6)))*interval '1 second' end,
    code=case when p_observed_version is null then 'RECOVERY_LOOKUP_UNCERTAIN' else code end,
    origin=case when p_observed_version is null then 'transport' else origin end,
    updated_at=clock_timestamp() where request_id=p_request;
  if p_observed_version is null then
    perform set_config('fiscal_recovery_gop.writer','recovery-v1',true);
    update public.fiscal_invoices set recovery_phase='submission_unknown',error_origin='transport',
      error_message='Resultado ainda nao confirmado; nota em acompanhamento.'
      where id=a.invoice_id and organization_id=a.organization_id and store_id=a.store_id;
    if not found then raise exception 'RECOVERY_RECONCILE_INVOICE_MISSING';end if;
    perform set_config('fiscal_recovery_gop.writer',coalesce(previous_writer,''),true);
  end if;
  return true;
end $$;
revoke all on function public.gop_recovery_due_v1(text,uuid,bigint) from public,anon,authenticated;
revoke all on function public.gop_recovery_reconcile_claim_v1(text,uuid,bigint) from public,anon,authenticated;
revoke all on function public.gop_recovery_reconcile_complete_v1(uuid,bigint,uuid,bigint) from public,anon,authenticated;
grant execute on function public.gop_recovery_due_v1(text,uuid,bigint) to service_role;
grant execute on function public.gop_recovery_reconcile_claim_v1(text,uuid,bigint) to service_role;
grant execute on function public.gop_recovery_reconcile_complete_v1(uuid,bigint,uuid,bigint) to service_role;
commit;
