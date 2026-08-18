-- Controla a baixa automatica de uma cobranca Pix confirmada pelo Sicredi.
-- A chave de idempotencia permite repetir webhook/consulta sem duplicar o recebimento.

alter table public.pix_installment_charges
  add column if not exists settlement_status text not null default 'PENDING',
  add column if not exists settlement_idempotency_key uuid,
  add column if not exists settlement_operation_id bigint references public.installment_receipt_operations(id) on delete set null,
  add column if not exists settled_at timestamptz,
  add constraint pix_installment_charges_settlement_status_check
    check (settlement_status in ('PENDING', 'COMPLETED', 'ERROR'));

update public.pix_installment_charges
set settlement_idempotency_key = gen_random_uuid()
where settlement_idempotency_key is null;

alter table public.pix_installment_charges
  alter column settlement_idempotency_key set not null;

create unique index if not exists pix_installment_charges_settlement_idempotency_key_idx
  on public.pix_installment_charges (settlement_idempotency_key);

create index if not exists pix_installment_charges_settlement_status_idx
  on public.pix_installment_charges (settlement_status, updated_at desc);
