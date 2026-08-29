-- Mantém a rastreabilidade das correções de forma de pagamento no Livro Caixa.
create table if not exists public.payment_method_change_audit (
  id bigint generated always as identity primary key,
  payment_id bigint not null references public.pagamentos(id) on delete cascade,
  store_id bigint not null references public.stores(id) on delete cascade,
  previous_payment_method text not null,
  new_payment_method text not null,
  authorized_by_employee_id bigint not null references public.employees(id) on delete restrict,
  authorized_by_user_id uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists payment_method_change_audit_payment_changed_at_idx
  on public.payment_method_change_audit (payment_id, changed_at desc);

create or replace function public.change_payment_method_with_audit(
  p_payment_id bigint,
  p_store_id bigint,
  p_new_payment_method text,
  p_installments integer,
  p_authorized_by_employee_id bigint,
  p_authorized_by_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.pagamentos%rowtype;
  v_employee public.employees%rowtype;
  v_new_payment_method text := nullif(trim(p_new_payment_method), '');
begin
  if v_new_payment_method is null then
    raise exception 'Informe uma forma de pagamento válida.';
  end if;

  select * into v_payment
  from public.pagamentos
  where id = p_payment_id and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Pagamento não encontrado.';
  end if;

  select * into v_employee
  from public.employees
  where id = p_authorized_by_employee_id
    and store_id = p_store_id
    and is_active = true;

  if not found then
    raise exception 'Funcionário autorizador inválido ou inativo.';
  end if;

  if v_payment.employee_id is not null
    and v_payment.employee_id <> p_authorized_by_employee_id then
    raise exception 'Apenas o funcionário que realizou este pagamento pode alterá-lo.';
  end if;

  update public.pagamentos
  set forma_pagamento = v_new_payment_method,
      parcelas = case when coalesce(p_installments, 1) > 1 then p_installments else parcelas end
  where id = v_payment.id;

  insert into public.payment_method_change_audit (
    payment_id,
    store_id,
    previous_payment_method,
    new_payment_method,
    authorized_by_employee_id,
    authorized_by_user_id
  ) values (
    v_payment.id,
    p_store_id,
    coalesce(v_payment.forma_pagamento, 'Não informado'),
    v_new_payment_method,
    p_authorized_by_employee_id,
    p_authorized_by_user_id
  );
end;
$$;

revoke all on function public.change_payment_method_with_audit(bigint, bigint, text, integer, bigint, uuid) from public;
grant execute on function public.change_payment_method_with_audit(bigint, bigint, text, integer, bigint, uuid) to service_role;
