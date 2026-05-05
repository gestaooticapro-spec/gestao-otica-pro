# Importacao de Catalogos e Enriquecimento Semantico

Este documento resume como estamos importando dados extraidos de PDFs para o banco, como ativamos catalogos na loja e como enriquecemos semantica (familias e tratamentos). Use como referencia ao abrir novos contextos.

## 1) Estrutura geral do fluxo

1. Extrair ou consolidar dados do PDF (CSV/JSON auditavel).
2. Corrigir inconsistencias (precos faltantes, colunas deslocadas).
3. Converter para o formato draft (JSON esperado pelo importador).
4. Importar no banco com `scripts/import_global_catalog.js`.
5. Ativar catalogo na loja com `scripts/activate_global_catalog.js`.
6. Enriquecer semantica (familias e tratamentos).
7. Validar na UI e ajustar.

## 2) Arquivos e scripts principais

### Importacao de catalogo global

- **Importador**: `scripts/import_global_catalog.js`
  - Espera JSON com a estrutura:
    - `catalog_version`
    - `source_document`
    - `treatments`
    - `families[]` (cada familia com `offers[]`)
  - Dry-run: sem `--commit`
  - Commit: com `--commit`

- **Ativacao na loja**: `scripts/activate_global_catalog.js`
  - Parametros:
    - `--store=<id>`
    - `--laboratorio=<nome>`
    - `--versao=<nome>`

### Conversoes e drafts

- **HOYA**: `scripts/convert_hoya_to_draft.py`
  - Entrada: `.tabelas/hoya_catalog_extraction_2025.json`
  - Saida: `tmp/hoya_catalog_draft_2025.json`

- **Essilor (PVC/PVO)**: `scripts/convert_essilor_csv_to_draft.py`
  - Entrada: `.tabelas/essilor_ABRIL2026_COMPLETO__numeric_plus_rules_fixed.csv`
  - Saida: `tmp/essilor_catalog_draft_2026.json`

## 3) Tratamento de dados antes de importar

### Essilor (PVC + PVO)

1. Consolidamos PVC (venda) e PVO (custo).
2. Corrigimos precos faltantes usando imagens (Pags 4, 12, 15).
3. Geramos CSV final:
   - `.tabelas/essilor_ABRIL2026_COMPLETO__numeric_plus_rules_fixed.csv`

### Kodak dentro da Essilor

Kodak nao e laboratorio separado. Ele entra como familia dentro da tabela Essilor.

### Split de importacao (quando ha falha de rede)

Para reduzir erros de `fetch failed`, usamos:

- `IMPORT_THROTTLE_MS` (pausa por familia)
- `IMPORT_OFFER_THROTTLE_MS` (pausa por oferta)
- `IMPORT_SKIP_EXISTING=1` (pula leitura pesada de ofertas existentes)
- Importacao em partes (ex.: Kodak part1/part2)

## 4) Semantica: familias e tratamentos

### Contrato semantico minimo para o motor de indicacao

Ao importar uma nova tabela global, a importacao estrutural so coloca os produtos no banco. Para o motor indicar com coerencia, cada familia/oferta/tratamento precisa carregar semantica suficiente para responder tres perguntas:

1. **Esta lente pode ser tecnicamente vendida para este grau?**
2. **Esta lente pertence a categoria clinica certa para a anamnese?**
3. **Quais beneficios reais justificam o ranking e a explicacao comercial?**

Se uma marca nova entrar sem esses campos, o motor ate pode listar precos, mas vai perder nuances como adaptacao, ocupacional, AR premium, disponibilidade de ADD +4.00, fotossensivel prioritario ou controle de miopia.

#### Familia (`global_lens_families`)

Campos/semanticas que devem ser revisados em toda marca nova:

| Campo | Por que importa para o motor |
| --- | --- |
| `clinical_category` | Define a categoria base: `visao_simples`, `multifocal`, `ocupacional`, `bifocal`, `controle_miopia`, `plana_solar`, `mista` ou `indefinida`. Sem isso, o motor pode comparar categorias erradas. |
| `design` | Ajuda a diferenciar progressivo, ocupacional, digital, asferico, esferico, controle de miopia etc. |
| `tags_uso` | Alimenta matches de rotina: `computador`, `celular`, `leitura`, `dirigir`, `dirigir_noite`, `sol`, `crianca`, `esporte`. |
| `tags_beneficios` | Alimenta score e explicacao: `adaptacao_rapida`, `conforto_visual`, `conforto_digital`, `qualidade_optica`, `campo_perto`, `lente_fina`, `estetica`, `resistencia`, `controle_miopia`. |
| `source_page_reference` | Mantem rastreabilidade da decisao e ajuda a auditar importacoes futuras. |

#### Oferta (`global_lens_offers`)

Campos/semanticas que precisam vir da tabela ou de enriquecimento posterior:

| Campo | Regra pratica |
| --- | --- |
| `clinical_category` | Deve confirmar ou especializar a categoria da familia. Ex.: uma familia mista pode ter ofertas `visao_simples`, `multifocal` e `plana_solar`. |
| `raw_label` / `canonical_label` | `raw_label` preserva evidencia; `canonical_label` deve ser legivel para venda. |
| `material` e `indice_refracao` | Fundamentais para alto grau, lente fina, estetica e resistencia. |
| `base_price` | Deve representar preco do par na logica da tabela. |
| `is_atomic_offer` | `true` quando a oferta ja e pacote fechado com tratamento/material/features embutidos. |
| `already_includes_treatment` | `true` quando o tratamento ja vem na oferta e nao deve ser composto de novo. |
| `allows_composition` | `true` quando a oferta pode receber tratamento da matriz de compatibilidade. |
| `features` | Deve carregar flags estruturadas listadas abaixo. |
| `source_page_reference` | Obrigatorio para auditoria quando houver duvida de grade/preco/tratamento. |

Flags importantes dentro de `offer.features`:

| Feature | Uso esperado |
| --- | --- |
| `transitions` / `fotossensivel` | Diferenciar lente que escurece automaticamente de solar fixo. Nao inferir a partir de "Sun", "Solar" ou coracao comercial. |
| `blue_uv` | So marcar quando a oferta/tratamento realmente trouxer filtro Blue/UV. |
| `solar`, `polarizado`, `espelhado` | Separar oculos de sol grau fixo de fotossensivel. |
| `has_antirreflexo` / `antirreflexo_tipo` | Evita recomendar AR ausente/externo quando o caso pede AR premium ou dirigir a noite. |
| `min_fitting_height` / `fitting_heights_available` | Importante para multifocal, corredor curto e adaptacao. |
| `design_esferico` / `design_asferico` ou equivalente | Importante em alto grau positivo/negativo; se a fonte nao disser, deixar indefinido e nao inventar. |
| `generic_treatments` | Usado como fallback para tratamentos embutidos que nao existem como linha separada em `global_treatments`. |

#### Grade (`global_offer_diopter_grids`)

Essa e a parte que nao pode ser "semantica textual"; precisa ser numerica.

| Campo | Regra critica |
| --- | --- |
| `sph_min` / `sph_max` | Obrigatorio sempre que a tabela trouxer grade de producao. |
| `cyl_min` / `cyl_max` | Obrigatorio quando houver limite de cilindro. |
| `add_min` / `add_max` | Obrigatorio para `multifocal`, `bifocal` e `ocupacional` quando a tabela tiver adicao. |

Regra de ouro: **se a lente e multifocal/ocupacional/bifocal e o paciente tem adicao, a recomendacao so e segura quando `add_min/add_max` existem e incluem a adicao solicitada**. O caso ADD +4.00 mostrou por que isso importa: `beneficio:adicao_presente` nao prova disponibilidade de grade.

#### Tratamento (`global_treatments.features.semantic_profile`)

Cada tratamento relevante precisa de um `semantic_profile` com:

| Campo | Exemplo de valores |
| --- | --- |
| `positioning` / `price_tier` | `entrada`, `intermediaria`, `premium` |
| `usage_tags` | `computador`, `celular`, `dirigir_noite`, `sol`, `uso_diario` |
| `benefit_tags` | `conforto_visual`, `conforto_digital`, `qualidade_optica`, `ar_premium`, `resistencia_riscos`, `facil_limpeza`, `blue_uv`, `conforto_luz` |
| `commercial_summary` | Resumo curto para a UI/parecer. |
| `recommendation_notes` | Quando subir ou quando evitar. |
| `explain_why` | Frase curta opcional para justificar a escolha. |

Sem isso, o motor ainda identifica que existe antirreflexo, mas perde diferencas como AR basico vs premium, Blue UV, direcao noturna, facilidade de limpeza e resistencia a riscos.

#### Matriz de compatibilidade (`global_offer_treatments_compatibility`)

Para oferta componivel, cada tratamento permitido precisa estar na matriz com:

| Campo | Regra |
| --- | --- |
| `offer_id` / `treatment_id` | A IA nunca deve adivinhar compatibilidade. |
| `special_price` | Preco final ou acrescimo, conforme tabela. |
| `price_mode` | `final` quando o valor ja e preco final; `surcharge` quando e acrescimo sobre a oferta. |

Se a tabela Zeiss, por exemplo, trouxer combinacoes fechadas de lente + tratamento, modele como oferta atomica. Se trouxer lente base e tratamentos opcionais, modele como oferta componivel + matriz.

### Cobertura de semantica

Script para ver cobertura por versao:

```
node scripts/list_semantic_coverage.js
```

### Essilor/Kodak (semantica atual)

Arquivo limpo:
- `.tabelas/pesquisa_tratamento_essilor_kodak_insert_ready.json`

Importador:
- `scripts/import_essilor_semantics.js`

Rodar:

```
node scripts/import_essilor_semantics.js --version-id=<VERSION_ID>
```

### Tratamentos genericos (fallback)

Script:
- `scripts/ensure_generic_treatments.js`

Rodar:

```
node scripts/ensure_generic_treatments.js --version-id=<VERSION_ID> --semantic=.tabelas/pesquisa_tratamento_essilor_kodak_insert_ready.json
```

## 5) Exemplo Essilor (real)

Version ID:
- `99497d03-50bf-46b7-a7ab-8cb19e80db5a`

Ativacao:

```
node scripts/activate_global_catalog.js --store=1 --laboratorio=Essilor --versao="Essilor Abril 2026"
```

## 6) Validacao na UI

Depois de ativar:

1. Buscar por "Varilux" (deve aparecer Varilux + Varilux XR).
2. Buscar por "Kodak City" (deve aparecer Kodak).
3. Validar filtros e explicacoes da IA.

## 7) Observacoes importantes

- Sempre separar **importacao estrutural** de **enriquecimento semantico**.
- Tratamentos embutidos precisam semantica para a IA explicar bem.
- Familias podem agrupar sublinhas (ex.: Eyezen dentro de "Lentes Essilor").
- Se uma familia nao existe no BD, precisamos mapear/alias antes de inserir semantica.
- Marca nova sem semantica nao deve ser ativada direto para venda assistida; primeiro rode a checklist abaixo.

## 8) Checklist para importar uma marca nova (ex.: Zeiss)

Antes de ativar a versao na loja:

1. Conferir se todas as familias tem `clinical_category` coerente.
2. Conferir se familias mistas foram quebradas em ofertas com `clinical_category` especifica.
3. Conferir se toda oferta multifocal/ocupacional/bifocal tem `add_min/add_max` quando a fonte trouxer grade.
4. Conferir se ofertas de ADD alta nao dependem apenas de texto comercial.
5. Conferir se `transitions/fotossensivel`, `solar`, `polarizado` e `blue_uv` foram separados corretamente.
6. Conferir se solar fixo nao foi marcado como fotossensivel automatico.
7. Conferir se tratamento embutido esta como `already_includes_treatment=true` e tem semantica propria ou `generic_treatments`.
8. Conferir se tratamentos avulsos tem `semantic_profile`.
9. Conferir se a matriz de compatibilidade usa `price_mode` correto.
10. Rodar cobertura de semantica:

```
node scripts/list_semantic_coverage.js
```

11. Listar tratamentos sem semantica:

```
node scripts/list_missing_treatment_semantics.js
```

12. Testar personagens/regressoes relevantes na UI ou com JSON exportado:

```
node scripts/check_lens_recommendation_output.js helena caminho/saida-ui.json
node scripts/check_lens_recommendation_output.js lia caminho/saida-ui.json
node scripts/check_lens_recommendation_output.js alta_miopia_futebol caminho/saida-ui.json
node scripts/check_lens_recommendation_output.js add_400_disponibilidade caminho/saida-ui.json
```

Para Zeiss especificamente, crie primeiro um arquivo de semantica por familia/tratamento antes da ativacao comercial. O motor nao "sabe Zeiss" por marca; ele sabe ler categoria clinica, grade numerica, material/indice, features e `semantic_profile`.
