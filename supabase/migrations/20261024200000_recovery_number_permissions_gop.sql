-- PREPARE ONLY. Catalog confirms both NF-e overloads are SECURITY DEFINER
-- and currently executable by PUBLIC/anon/authenticated. The app allocates
-- numbers through authenticated server actions using service_role.
-- No counter value, function body, or other store's sequence is modified.
begin;
revoke all on function public.get_next_nfe_number(uuid,integer,text) from public,anon,authenticated;
revoke all on function public.get_next_nfe_number(uuid,bigint,integer,text) from public,anon,authenticated;
grant execute on function public.get_next_nfe_number(uuid,integer,text) to service_role;
grant execute on function public.get_next_nfe_number(uuid,bigint,integer,text) to service_role;
commit;
