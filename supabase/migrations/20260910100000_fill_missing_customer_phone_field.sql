-- Preenche o campo de telefone que estiver vazio quando o outro campo possuir valor.
-- Se os dois campos tiverem valores, inclusive valores diferentes, preserva ambos.
-- A migration e idempotente e vale para clientes de todas as lojas.
update public.customers
set
  phone = case
    when nullif(btrim(phone), '') is null
      and nullif(btrim(fone_movel), '') is not null
      then fone_movel
    else phone
  end,
  fone_movel = case
    when nullif(btrim(fone_movel), '') is null
      and nullif(btrim(phone), '') is not null
      then phone
    else fone_movel
  end
where (
  nullif(btrim(phone), '') is null
  and nullif(btrim(fone_movel), '') is not null
)
or (
  nullif(btrim(fone_movel), '') is null
  and nullif(btrim(phone), '') is not null
);
