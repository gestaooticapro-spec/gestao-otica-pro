-- Adiciona colunas de configuração fiscal (CSC e Certificado) na tabela stores
alter table stores
add column if not exists csc_homologacao text,
add column if not exists csc_id_homologacao text,
add column if not exists csc_producao text,
add column if not exists csc_id_producao text,
add column if not exists certificate_thumbprint text,
add column if not exists certificate_valid_until timestamp with time zone;
