# Essilor: Próximos Passos Quando as Tabelas Chegarem

> **Nota atual (2026):** documento historico. A Essilor ja foi importada/ativada no catalogo global atual. Para novas importacoes, use `CATALOGO_IMPORTACAO_REGRAS_ATUAIS.md` e `IMPORTACAO_CATALOGOS_E_SEMANTICA.md`.

Este arquivo serve para preservar o contexto. Quando as tabelas da Essilor forem importadas, siga a sequência abaixo para alinhar com o que já fizemos em HOYA, Gamalab e Optilab.

## 1) Confirmar quais versões Essilor foram importadas

As duas tabelas esperadas são:
- `.tabelas\V2 - Tabela PVC ABRIL 26 WEB.pdf` (preço de venda ao consumidor)
- `.tabelas\V2 - Tabela PVO ABRIL 26.pdf` (preço de venda da ótica / custo)

Depois da importação, localizar os `version_id` no banco:

- Tabela: `global_catalog_versions`
- Campos: `id`, `laboratorio`, `versao`

Se necessário, rode o mesmo comando usado para listagem de versões e pegue os `id` correspondentes às versões Essilor.

## 2) Aplicar os 3 passos de tratamentos genéricos e mapeamento embutido

Para cada `version_id` Essilor:

1. Criar tratamentos genéricos com semântica consolidada:
```
node scripts\ensure_generic_treatments.js --version-id=<ESSILOR_VERSION_ID>
```

2. Mapear tratamentos embutidos nas ofertas (ex.: Blue UV, fotossensível, polarizado, etc.):
```
node scripts\map_embedded_treatments.js --version-id=<ESSILOR_VERSION_ID>
```

Esses passos replicam exatamente o que já foi feito para:
- HOYA Dezembro 2025
- Gamalab Marco de 2026
- Optilab 06 de abril a 31 de julho de 2026

## 3) Verificação mínima pós-processo

Depois de rodar os scripts:

- Conferir se tratamentos genéricos foram criados (8 itens).
- Conferir se algumas ofertas embutidas receberam `features.generic_treatments`.
- Se aparecer “0 atualizadas”, validar se:
  - as ofertas não são embutidas
  - o texto não contém sinais (blue, uv, transitions, photochromic, sun, polarizado etc.)

## Observação importante

Não deduplicar entre laboratórios. A Essilor terá ofertas próprias, mesmo que compartilhe marcas com Optilab.

Quando a Essilor chegar, basta seguir esse checklist e depois validar o comportamento na UI (filtros e sugestões).
