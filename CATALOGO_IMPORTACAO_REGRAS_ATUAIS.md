# Catalogo de Lentes - Regras Atuais de Importacao

Status: referencia operacional atual.

Use este arquivo como ponto de partida para novas importacoes de tabelas de preco e para corrigir grades achatadas em catalogos antigos.

## Documentos de Referencia

Use primeiro:

- `IMPORTACAO_CATALOGOS_E_SEMANTICA.md`: fluxo geral, contrato semantico e checklist de marca nova.
- `HAYTEK_IMPORTACAO_NOTAS.md`: exemplo recente e validado de importacao pagina por pagina.
- `tmp/haytek_import_manifest_2025_09.md`: exemplo de manifesto de importacao validada.
- `scripts/build_haytek_catalog_from_csv.js`: exemplo recente de construtor CSV para payload global.
- `scripts/import_global_catalog.js`: importador oficial para o Supabase.
- `scripts/activate_global_catalog.js`: ativacao de versao global na loja.
- `scripts/audit_price_table_ui_db_consistency.js`: auditoria UI x BD apos ativacao.
- `scripts/audit_global_grid_flattening.js`: auditoria para localizar suspeitas de grade achatada.

Leia como historico, nao como fonte operacional principal:

- `LENS_CATALOG_ARCHITECTURE.md`
- `PASSO_1_CATALOGO_GLOBAL_DETALHADO.md`
- `ESSILOR_NEXT_STEPS.md`
- `TEMPLATE_CSV_CATALOGO_LENTES.md`

## Regra Principal

Nao achatar grades dioptricas.

Se a tabela informar faixas diferentes para o mesmo produto/indice/material/tratamento, cada faixa deve virar uma linha em `global_offer_diopter_grids`.

Exemplo de erro:

```txt
1.67: esf -10.00 a +8.00 | cil ate -6.00
```

Se a fonte real diz:

```txt
esf +8.00 a -8.50 | cil ate -6.00
esf -8.75 a -10.00 | cil ate -4.00
```

O banco deve receber duas grades, nao uma.

## Modelo Atual do Banco

Unidade central:

- `global_lens_families`: familia comercial/tecnica.
- `global_lens_offers`: oferta vendavel.
- `global_offer_diopter_grids`: uma ou mais faixas tecnicas da oferta.
- `global_treatments`: tratamentos avulsos ou canonicos.
- `global_offer_treatments_compatibility`: matriz oferta + tratamento com preco e `price_mode`.
- `tenant_catalog_activations`: versoes globais ativas na loja.
- `tenant_commercial_offers`: snapshot comercial local das ofertas ativadas.

Nao usar mais o modelo antigo onde `sph_min`, `sph_max` e `cyl_max` ficam diretamente em `global_lens_offers`.

## Pipeline Recomendado

1. Extrair semantica do PDF.
2. Extrair precos da foto/PDF em CSV revisavel.
3. Extrair grades em CSV separado sempre que houver qualquer complexidade.
4. Validar cada pagina por amostragem visual e checagem mecanica.
5. Marcar `review_status=ok`.
6. Criar manifesto da importacao.
7. Gerar payload JSON no formato do `scripts/import_global_catalog.js`.
8. Rodar dry-run sem `--commit`.
9. Importar com `--commit`.
10. Ativar na loja.
11. Rodar auditoria UI x BD.
12. Rodar auditoria de suspeita de grade achatada.
13. Testar o motor de recomendacao quando a tabela alimentar IA/venda assistida.

## Precos

Quando a tabela traz uma matriz lente + tratamento em que cada celula ja e preco final:

- `base_price`: preco da coluna base, normalmente `Antirrisco` ou preco unico do item.
- `compatible_treatments[].special_price`: preco final da combinacao.
- `compatible_treatments[].price_mode`: `final`.

Quando a tabela traz acrescimo:

- `base_price`: preco da lente base.
- `special_price`: acrescimo.
- `price_mode`: `surcharge`.

Quando a oferta ja vem fechada com tratamento:

- `is_atomic_offer=true`
- `allows_composition=false`
- `already_includes_treatment=true`
- `compatible_treatments=[]`

## Familias e Categorias

Toda familia deve ter `clinical_category` coerente:

- `multifocal`
- `visao_simples`
- `ocupacional`
- `bifocal`
- `controle_miopia`
- `plana_solar`
- `mista`
- `indefinida` apenas temporariamente

Use `mista` quando uma familia contem ofertas de categorias diferentes.

Toda oferta deve ter `clinical_category` explicita quando:

- a familia for `mista`;
- a inferencia por grade puder errar;
- houver baixa adicao de apoio acomodativo, como Haytek Easy/Dynamic Relax, que deve ser `visao_simples`, nao `ocupacional`;
- houver produto solar dentro de familia de visao simples.

## Grades

Cada linha de `global_offer_diopter_grids` representa uma faixa real da tabela.

Campos obrigatorios quando disponiveis:

- `sph_min`
- `sph_max`
- `cyl_min`
- `cyl_max`
- `add_min`
- `add_max`
- `metadata.diameter`
- `metadata.min_fitting_height_mm`
- `metadata.corridors_available_mm`
- `metadata.source_page`
- `metadata.notes`

Para visao simples, nao preencher `add_min/add_max`, mesmo que a tabela tenha erro grafico mostrando adicao.

Para progressivas/ocupacionais/bifocais, preencher `add_min/add_max` quando a fonte trouxer adicao.

Para lentes acabadas/prontas, nao resumir grade por indice. A disponibilidade pode variar por produto, cilindro, esferico e diametro.

## Lentes Acabadas e Prontas

Nao tratar lentes acabadas como ofertas sem familia.

Criar familia propria quando a tabela tiver secao clara, por exemplo:

- `Haytek Visao Simples Acabadas`
- `Haytek Progressivas Acabadas`

Regras:

- `is_atomic_offer=true`
- `allows_composition=false`
- `already_includes_treatment=true`
- `features.fulfillment_mode=pronta`
- `features.pronta=true`
- `features.acabada=true`

Se o preco variar por faixa de cilindro, transformar cada faixa de preco em oferta separada ou manter uma modelagem equivalente que permita calcular o preco por receita sem regra escondida.

## Tratamentos e Features

Nao misturar solar fixo com fotossensivel:

- `transitions` / `fotossensivel`: lente que escurece automaticamente.
- `solar`: lente solar fixa.
- `polarizado`: lente solar polarizada.

Nao marcar `blue_uv=true` por inferencia vaga. A tabela precisa indicar filtro azul/Blue UV.

Tratamentos embutidos precisam aparecer em `features` e/ou `generic_treatments` para o motor de recomendacao explicar a escolha.

Tratamentos avulsos relevantes devem ter `features.semantic_profile`.

## Auditorias Minimas

Depois de importar e ativar:

```powershell
node scripts\audit_price_table_ui_db_consistency.js --store=1
node scripts\audit_global_grid_flattening.js
```

Esperado na auditoria UI x BD:

- `faltando ativar para UI: 0`
- `tenant duplicadas: 0`
- `global_offer ausente: 0`
- `family ausente: 0`
- `mismatch versao: 0`
- `mismatch categoria deterministica: 0`
- `ofertas indefinidas visiveis: 0`

Para tabelas novas que alimentam recomendacao, testar tambem o motor com casos reais de:

- multifocal comum;
- visao simples alto indice;
- ocupacional;
- pronta entrega/acabadas;
- fotossensivel;
- filtro azul;
- alto cilindro ou alto esferico.

## Arquivos que Precisam Cuidado

`TEMPLATE_CSV_CATALOGO_LENTES.md` e util para tabelas simples, mas nao basta para tabelas complexas. Se houver multiplas grades, use arquivo separado de grades ou multiplas linhas por produto.

`LENS_CATALOG_ARCHITECTURE.md` e `PASSO_1_CATALOGO_GLOBAL_DETALHADO.md` tem valor arquitetural, mas os blocos SQL sao historicos. O schema atual deve ser conferido nas migrations e no banco.

`ESSILOR_NEXT_STEPS.md` e historico. Nao usar como checklist atual para novas marcas.

`RULES.md` contem regras antigas de processo e nao deve bloquear a operacao atual do Codex sem revisao.
