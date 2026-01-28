-- Adiciona colunas de credenciais da Nuvem Fiscal na tabela stores
alter table stores
add column if not exists nuvemfiscal_prod_client_id text,
add column if not exists nuvemfiscal_prod_client_secret text,
add column if not exists nuvemfiscal_hom_client_id text,
add column if not exists nuvemfiscal_hom_client_secret text;
