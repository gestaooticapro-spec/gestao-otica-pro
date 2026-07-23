-- Identifica os vários recebimentos que compõem o pagamento de uma parcela.
-- Registros antigos continuam válidos, pois parcela_id é opcional.
alter table public.pagamentos
  add column if not exists parcela_id bigint references public.financiamento_parcelas(id) on delete set null;

create index if not exists pagamentos_parcela_id_idx
  on public.pagamentos (parcela_id)
  where parcela_id is not null;
