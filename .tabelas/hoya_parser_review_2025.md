## HOYA Parser Review

Data: 2026-04-09

### Corrigido nesta etapa

- `Pentax` confirmado como tabela real apenas na página `19`.
- `EnRoute Progressiva` confirmado na página `36`.
- `EnRoute Visao Simples` confirmado na página `37`.
- `Hoyalux Sportive Progressiva` e `Sportive Visao Simples` revisados por imagem:
  - coluna 3 confirmada como `1.53 (PNX)`
  - ajustes de grade no `Polarizado` da progressiva
  - infos técnicas adicionais incluídas no parser
- `HILUX Esfericas Surfacadas` revisada pelo PDF:
  - materiais confirmados como `1.59 / 1.53 / 1.50`
  - confiança elevada para `alta`

### Estado atual

- Famílias extraídas: `22`
- Linhas de preço: `138`
- Status `EM_BREVE`: `24`

### Pendências reais de parser

#### Baixa confiança

- `HILUX Prontas Esfericas` (`p.17`)
  - colunas ainda incertas: `material_A_incerto`, `material_B_incerto`, `1.50_incerto`
  - o PDF textual não expõe os materiais de forma clara

- `Amplitude` (`p.29`)
  - colunas ainda incertas: `material_A_incerto`, `material_B_incerto`
  - família entry-level com 3 colunas, sem labels de material legíveis no OCR

- `SYNC III` (`p.35`)
  - estrutura de `6` colunas continua atípica
  - materiais ainda marcados como incertos:
    - `1.74_incerto`
    - `1.67_incerto`
    - `1.60 (EYAS2.0)_incerto`
    - `1.59_incerto`
    - `1.53_incerto`
  - o layout sugere uma sequência de materiais, mas ainda sem evidência forte o bastante para normalizar

#### Confiança média com colunas incertas

- `NULUX TrueForm` (`p.13`)
  - `col4 = 1.53_incerto`

- `Hoyalux Balansis` (`p.26`)
  - `col3 = 1.59_ou_1.53_incerto`

- `Hoyalux Daynamic` (`p.27`)
  - `col4 = 1.53_incerto`

- `ARGOS` (`p.28`)
  - `col3 = 1.59_ou_1.53_incerto`
  - `col4 = 1.53_incerto`

- `WorkSmart Room` (`p.33`)
  - `col2 = 1.59_incerto`

#### Confiança média sem coluna incerta explícita

- `NULUX Prontas Asfericas EYAS 2.0` (`p.16`)
  - estrutura está estável
  - ainda vale uma revisão fina futura porque a página `15` foi citada como continuação em outras famílias do bloco

### Leitura prática

- O parser HOYA já está suficientemente completo para auditoria séria.
- O que ainda resta não parece “quebra de parser”, e sim falta de evidência visual clara em algumas colunas de material.
- O próximo avanço natural é revisar essas páginas com captura visual mais focada no cabeçalho das colunas, se quisermos reduzir ainda mais os `incerto`.
