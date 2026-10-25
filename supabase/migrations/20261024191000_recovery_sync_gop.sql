-- PREPARE ONLY: requires recovery_pilot_gop. Never executes fiscal network I/O.
begin;
create function public.gop_recovery_inbox_v1(p_event text,p_request uuid,p_version bigint,p_hash text,
  p_client text,p_org uuid,p_store bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a fiscal_recovery_gop.attempts; i fiscal_recovery_gop.inbox;
begin
  if p_event is distinct from p_request::text||':'||p_version::text or p_version is null or p_version<1 or
    p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'RECOVERY_EVENT_INVALID';end if;
  select * into a from fiscal_recovery_gop.attempts where request_id=p_request for update;
  if a.request_id is null or a.client_id is distinct from p_client or a.organization_id is distinct from p_org or
    a.store_id is distinct from p_store then raise exception 'RECOVERY_EVENT_SCOPE_INVALID';end if;
  insert into fiscal_recovery_gop.inbox(event_id,request_id,body_hash) values(p_event,p_request,p_hash) on conflict(event_id) do nothing;
  select * into strict i from fiscal_recovery_gop.inbox where event_id=p_event;
  if i.request_id<>p_request or i.body_hash<>p_hash then raise exception 'RECOVERY_EVENT_CONFLICT';end if;
  -- An already-applied newer canonical version also satisfies this notification.
  if a.server_version>=p_version then
    update fiscal_recovery_gop.inbox set applied_at=coalesce(applied_at,clock_timestamp()) where event_id=p_event;
  end if;
  return jsonb_build_object('applied',a.server_version>=p_version,'serverVersion',a.server_version,
    'attempt',fiscal_recovery_gop.attempt_json(a));
end $$;
revoke all on function public.gop_recovery_inbox_v1(text,uuid,bigint,text,text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.gop_recovery_inbox_v1(text,uuid,bigint,text,text,uuid,bigint) to service_role;
commit;
