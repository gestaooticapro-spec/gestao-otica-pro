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

