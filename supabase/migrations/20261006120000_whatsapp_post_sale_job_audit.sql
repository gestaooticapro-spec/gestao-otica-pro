-- Auditoria, exclusao mutua e cadencia persistente do primeiro contato.
create table public.whatsapp_post_sale_job_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','failed','abandoned')),
  result jsonb,
  error_code text
);
create index whatsapp_post_sale_job_runs_started_idx on public.whatsapp_post_sale_job_runs(started_at desc);
alter table public.whatsapp_post_sale_job_runs enable row level security;

create table public.whatsapp_post_sale_dispatch_clock (
  singleton boolean primary key default true check (singleton),
  claimed_at timestamptz
);
insert into public.whatsapp_post_sale_dispatch_clock(singleton) values (true);
alter table public.whatsapp_post_sale_dispatch_clock enable row level security;

create function public.begin_whatsapp_post_sale_job() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(610061200);
  if exists(select 1 from whatsapp_post_sale_job_runs where status='running' and started_at > now()-interval '10 minutes') then
    return null;
  end if;
  update whatsapp_post_sale_job_runs set status='abandoned',finished_at=now(),error_code='lease_expired' where status='running';
  insert into whatsapp_post_sale_job_runs default values returning id into v_id;
  return v_id;
end $$;

create function public.claim_whatsapp_post_sale_dispatch() returns boolean
language plpgsql security definer set search_path = public as $$
declare v_claimed boolean;
begin
  update whatsapp_post_sale_dispatch_clock set claimed_at=now()
  where singleton and (claimed_at is null or
    date_bin(interval '30 minutes',claimed_at,timestamptz '1970-01-01 00:15:00+00') <
    date_bin(interval '30 minutes',now(),timestamptz '1970-01-01 00:15:00+00'))
  returning true into v_claimed;
  return coalesce(v_claimed,false);
end $$;

-- A unicidade da OS representante nao protegia as demais OS agrupadas.
create function public.guard_whatsapp_post_sale_coverage() returns trigger
language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(610061201);
  if exists(select 1 from whatsapp_post_sale_followups f
    where f.store_id=new.store_id and f.id<>new.id
    and f.covered_service_order_ids && new.covered_service_order_ids) then
    raise exception 'OS ja coberta por acompanhamento' using errcode='23505';
  end if;
  return new;
end $$;
create trigger guard_whatsapp_post_sale_coverage before insert or update of covered_service_order_ids,store_id
on public.whatsapp_post_sale_followups for each row execute function public.guard_whatsapp_post_sale_coverage();

revoke all on function public.begin_whatsapp_post_sale_job() from public,anon,authenticated;
revoke all on function public.claim_whatsapp_post_sale_dispatch() from public,anon,authenticated;
grant execute on function public.begin_whatsapp_post_sale_job() to service_role;
grant execute on function public.claim_whatsapp_post_sale_dispatch() to service_role;
grant all on public.whatsapp_post_sale_job_runs,public.whatsapp_post_sale_dispatch_clock to service_role;
