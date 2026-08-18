-- Impede duas geracoes concorrentes de QR Code para a mesma parcela.
-- A reserva CREATING e criada antes da chamada remota ao Sicredi.

alter table public.pix_installment_charges
  drop constraint if exists pix_installment_charges_status_check;

alter table public.pix_installment_charges
  add constraint pix_installment_charges_status_check
    check (status in ('CREATING', 'PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'DIVERGENT', 'ERROR'));

drop index if exists public.pix_installment_charges_one_pending_per_installment_idx;

create unique index if not exists pix_installment_charges_one_active_creation_per_installment_idx
  on public.pix_installment_charges (installment_id)
  where status in ('CREATING', 'PENDING');
