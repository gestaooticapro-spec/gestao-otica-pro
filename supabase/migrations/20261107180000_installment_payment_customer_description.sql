-- Snapshot separado da anotacao da parcela; nao altera recebimentos antigos.
alter table public.pagamentos add column if not exists installment_note_snapshot text;

-- Busca por digitos contiguos sem depender da mascara dos telefones existentes.
alter table public.customers
  add column if not exists search_mobile_digits text generated always as
    (regexp_replace(coalesce(fone_movel,''),'[^0-9]','','g')) stored,
  add column if not exists search_phone_digits text generated always as
    (regexp_replace(coalesce(phone,''),'[^0-9]','','g')) stored;

create or replace function public.set_installment_payment_customer_description()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_customer_id bigint;
  v_number integer;
  v_name text;
begin
  select coalesce(fp.customer_id,f.customer_id,v.customer_id),fp.numero_parcela,fp.obs
    into v_customer_id,v_number,new.installment_note_snapshot
    from public.financiamento_parcelas fp
    join public.financiamento_loja f on f.id=fp.financiamento_id
    join public.vendas v on v.id=f.venda_id
    where fp.id=new.parcela_id and v.id=new.venda_id
      and fp.store_id=new.store_id and f.store_id=new.store_id and v.store_id=new.store_id
      and fp.tenant_id=new.tenant_id and f.tenant_id=new.tenant_id and v.tenant_id=new.tenant_id;
  if not found then raise exception 'Parcela inconsistente com a venda, loja ou empresa do recebimento.'; end if;
  select coalesce(nullif(btrim(full_name),''),nullif(btrim(razao_social),''),nullif(btrim(nome_fantasia),''))
    into v_name from public.customers
    where id=v_customer_id and store_id=new.store_id and tenant_id=new.tenant_id;
  new.obs := format('Ref. Venda #%s - Parc. %s - Cliente: %s',new.venda_id,v_number,
    coalesce(v_name,'Cliente não identificado'));
  return new;
end;
$$;
revoke all on function public.set_installment_payment_customer_description() from public,anon,authenticated;
drop trigger if exists set_installment_payment_customer_description on public.pagamentos;
create trigger set_installment_payment_customer_description before insert on public.pagamentos
for each row when (new.parcela_id is not null and new.receipt_operation_id is not null)
execute function public.set_installment_payment_customer_description();
