-- A protecao contra replay da baixa Pix do PDV deve atingir somente pagamentos
-- diretos da venda. Recebimentos de parcelas usam a mesma forma de pagamento,
-- mas podem ocorrer mais de uma vez para a mesma venda e parcela.

drop index if exists public.pagamentos_pix_sicredi_venda_obs_idx;

create unique index pagamentos_pix_sicredi_venda_obs_idx
  on public.pagamentos (venda_id, obs)
  where forma_pagamento = 'Pix Sicredi'
    and obs is not null
    and parcela_id is null;
