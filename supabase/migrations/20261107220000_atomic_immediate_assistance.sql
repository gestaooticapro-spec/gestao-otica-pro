create table if not exists public.immediate_assistance_operations (
  key uuid primary key, tenant_id uuid not null, store_id bigint not null,
  ticket_id bigint not null unique, stock_movement_id bigint not null,
  authorized_by_user_id uuid not null, authorized_by_employee_id bigint not null,
  request_snapshot jsonb not null, result_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.immediate_assistance_operations enable row level security;
revoke all on public.immediate_assistance_operations from public,anon,authenticated;
grant select,insert on public.immediate_assistance_operations to service_role;

create or replace function public.create_immediate_assistance_atomic(
  p_store_id bigint,p_customer_id bigint,p_product_id bigint,p_original_sale_id bigint,
  p_description text,p_defect text,p_photos jsonb,p_phone text,
  p_employee_id bigint,p_user_id uuid,p_tenant_id uuid,p_key uuid
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_request jsonb;
  v_previous public.immediate_assistance_operations%rowtype;
  v_product public.products%rowtype;
  v_customer public.customers%rowtype;
  v_ticket public.assistance_tickets%rowtype;
  v_movement_id bigint;
  v_result jsonb;
begin
  if p_key is null or coalesce(p_product_id,0)<=0 or coalesce(p_customer_id,0)<=0
    or char_length(btrim(coalesce(p_description,'')))<2 or char_length(btrim(coalesce(p_defect,'')))<3
    or jsonb_typeof(p_photos) is distinct from 'array' then raise exception 'Dados da troca imediata invalidos.'; end if;
  if p_user_id is null or p_tenant_id is null or not exists(
    select 1 from public.profiles p join public.stores s on s.id=p_store_id and s.tenant_id=p.tenant_id
    where p.id=p_user_id and p.tenant_id=p_tenant_id and (p.role='admin' or p.store_id=p_store_id)
  ) then raise exception 'Usuario sem acesso a esta loja.'; end if;
  if not exists(select 1 from public.employees where id=p_employee_id and store_id=p_store_id
    and tenant_id=p_tenant_id and is_active=true) then raise exception 'Funcionario autorizador invalido ou inativo.'; end if;
  v_request := jsonb_build_object('store',p_store_id,'customer',p_customer_id,'product',p_product_id,
    'sale',p_original_sale_id,'description',p_description,'defect',p_defect,'photos',p_photos,
    'phone',p_phone,'employee',p_employee_id,'user',p_user_id,'tenant',p_tenant_id);
  perform pg_advisory_xact_lock(hashtextextended('immediate_assistance:'||p_key::text,0));
  select * into v_previous from public.immediate_assistance_operations where key=p_key;
  if found then
    if v_previous.request_snapshot is distinct from v_request then raise exception 'Tentativa ja utilizada com outros dados.'; end if;
    return v_previous.result_snapshot;
  end if;
  select * into v_customer from public.customers where id=p_customer_id and store_id=p_store_id
    and tenant_id=p_tenant_id for update;
  if not found then raise exception 'Cliente nao encontrado nesta loja.'; end if;
  if p_original_sale_id is not null and not exists(select 1 from public.vendas where id=p_original_sale_id
    and store_id=p_store_id and tenant_id=p_tenant_id and customer_id=p_customer_id) then
    raise exception 'Venda original nao corresponde ao cliente e a loja.';
  end if;
  select * into v_product from public.products where id=p_product_id and store_id=p_store_id
    and tenant_id=p_tenant_id for update;
  if not found then raise exception 'Produto nao encontrado nesta loja.'; end if;

  if nullif(p_phone,'') is not null then
    update public.customers set fone_movel=p_phone where id=p_customer_id;
    v_customer.fone_movel := p_phone;
  end if;
  insert into public.assistance_tickets(tenant_id,store_id,customer_id,venda_original_id,product_id,
    product_descricao,modalidade,descricao_defeito,fotos_urls,contato_usado,status,status_publico,
    created_by_user_id,dt_troca_cliente)
    values(p_tenant_id,p_store_id,p_customer_id,p_original_sale_id,p_product_id,p_description,'TrocaImediata',
      p_defect,p_photos,p_phone,'LogisticaReversa','Troca Realizada',p_user_id,now()) returning * into v_ticket;
  -- Politica confirmada pelo usuario: manter a possibilidade de estoque negativo.
  update public.products set estoque_atual=coalesce(estoque_atual,0)-1 where id=p_product_id;
  insert into public.stock_movements(tenant_id,store_id,product_id,variant_id,tipo,quantidade,motivo,
    custo_unitario_momento,registrado_por_id,employee_id,created_at)
    values(p_tenant_id,p_store_id,p_product_id,null,'Saida',1,
      format('Troca Imediata Garantia Ticket #%s',v_ticket.id),v_product.preco_custo,p_user_id,p_employee_id,now())
    returning id into v_movement_id;
  insert into public.assistance_timeline(tenant_id,ticket_id,tipo,mensagem,usuario_id)
    values(p_tenant_id,v_ticket.id,'Sistema','Solicitação aberta.',p_user_id),
      (p_tenant_id,v_ticket.id,'Alerta',format('Baixa de estoque realizada (Troca Imediata). Autorizador: funcionário #%s.',p_employee_id),p_user_id);
  v_result := to_jsonb(v_ticket)||jsonb_build_object('customers',jsonb_build_object(
    'full_name',v_customer.full_name,'fone_movel',v_customer.fone_movel));
  insert into public.immediate_assistance_operations(key,tenant_id,store_id,ticket_id,stock_movement_id,
    authorized_by_user_id,authorized_by_employee_id,request_snapshot,result_snapshot)
    values(p_key,p_tenant_id,p_store_id,v_ticket.id,v_movement_id,p_user_id,p_employee_id,v_request,v_result);
  return v_result;
end;
$$;
revoke all on function public.create_immediate_assistance_atomic(bigint,bigint,bigint,bigint,text,text,jsonb,text,bigint,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_immediate_assistance_atomic(bigint,bigint,bigint,bigint,text,text,jsonb,text,bigint,uuid,uuid,uuid) to service_role;
