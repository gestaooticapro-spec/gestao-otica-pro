# Haytek - notas de importacao

## Regra principal

Nao achatar grades dioptricas.

A grade pertence a combinacao de familia + indice + material/variante tecnica. Quando a tabela informa mais de uma faixa para o mesmo indice, cada faixa deve virar uma linha separada em `global_offer_diopter_grids`.

## Como importar grades

- `family`: familia comercial, exemplo `Haytek Pro ID`.
- `indice_refracao`: indice optico, exemplo `1.67`.
- `material`: material quando indicado, exemplo `POLI` para `1.59 Poli`.
- `variant`: variante comercial embutida no preco, exemplo `Incolor`, `Filtro Azul`, `Foto Haytek`, `Filtro Azul Foto Haytek`.
- `global_offer_diopter_grids`: deve receber um registro por segmento real da tabela.
- `metadata`: guardar evidencia util, como pagina, diametro, marcacao e texto bruto da grade quando possivel.

## Exemplo da pagina 3

Para `Haytek Pro ID` e `Haytek Top`, a pagina 3 tem:

```txt
1.56:
Esf. +6.00 a -6.00 | Cil. ate -6.00

1.59 Poli:
Esf. +6.00 a -8.00 | Cil. ate -6.00

1.61:
Esf. +7.00 a -6.00 | Cil. ate -6.00
Esf. -6.25 a -8.00 | Cil. ate -4.00

1.67:
Esf. +8.00 a -8.50 | Cil. ate -6.00
Esf. -8.75 a -10.00 | Cil. ate -4.00

1.74:
Esf. +14.00 a -13.00 | Cil. ate -6.00
Esf. -13.25 a -14.00 | Cil. ate -4.00
```

Nao transformar `1.67` em:

```txt
Esf. -10.00 a +8.00 | Cil. ate -6.00
```

Isso aceitaria indevidamente graus como `-10.00 -5.00`, quando a faixa negativa extrema so permite cilindro ate `-4.00`.

## Modelo de preco da pagina 3

Cada celula de preco representa o preco final da lente/variante embutida + tratamento da coluna.

Colunas:

- `Antirrisco`
- `AR Verde`
- `AR Azul`
- `AR Premium Verde`
- `AR Premium Azul`

Variantes embutidas no preco:

- `Incolor`
- `Filtro Azul`
- `Foto Haytek`
- `Filtro Azul Foto Haytek`

## Corredores e altura

Na pagina 3, `Haytek Pro ID` e `Haytek Top` informam:

- Altura minima: `16mm`
- Corredores disponiveis: `14`, `15`, `16`, `17`, `18`

Registrar como disponibilidade tecnica. Nao assumir customizacao livre alem do que a tabela informa.

## Arquivos de apoio

- `tmp/haytek_page3_prices_review.csv`: precos da pagina 3.
- `tmp/haytek_page3_grids_review.csv`: segmentos de grade da pagina 3.
- `tmp/haytek_page4_prices_review.csv`: precos da pagina 4.
- `tmp/haytek_page4_grids_review.csv`: segmentos de grade da pagina 4.
- `tmp/haytek_page5_prices_review.csv`: precos da pagina 5.
- `tmp/haytek_page5_grids_review.csv`: segmentos de grade da pagina 5.
- `tmp/haytek_page6_prices_review.csv`: precos da pagina 6.
- `tmp/haytek_page6_grids_review.csv`: segmentos de grade da pagina 6.
- `tmp/haytek_page7_prices_review.csv`: precos da pagina 7.
- `tmp/haytek_page7_grids_review.csv`: segmentos de grade da pagina 7.
- `tmp/haytek_page8_prices_review.csv`: precos da pagina 8.
- `tmp/haytek_page8_grids_review.csv`: segmentos de grade da pagina 8.
- `tmp/haytek_semantics_2025_09.json`: semantica consolidada da Haytek.
- `tmp/haytek_semantics_2025_09.md`: leitura humana da semantica consolidada.

## Pagina 4

Familias:

- `Haytek Smart`: corredores `14`, `16`, `18`; altura minima `16mm`.
- `Haytek Light`: corredores `14`, `18`; altura minima `16mm`.

`Haytek Smart` usa o mesmo padrao de grade segmentada de `Haytek Pro ID`/`Haytek Top` na pagina 3:

```txt
1.56: esf +6.00 a -6.00 | cil ate -6.00
1.59 Poli: esf +6.00 a -8.00 | cil ate -6.00
1.61: esf +7.00 a -6.00 | cil ate -6.00; esf -6.25 a -8.00 | cil ate -4.00
1.67: esf +8.00 a -8.50 | cil ate -6.00; esf -8.75 a -10.00 | cil ate -4.00
1.74: esf +14.00 a -13.00 | cil ate -6.00; esf -13.25 a -14.00 | cil ate -4.00
```

## Pagina 8

Familias de visao simples freeform:

- `Haytek Visao Simples ID`: visao simples freeform individualizada.
- `Haytek Visao Simples`: visao simples freeform.

Nao registrar adicao, altura minima ou corredores. A pagina informa apenas grade de esferico/cilindrico e diametro.

Grade:

```txt
1.56: esf +10.00 a -10.00 | cil ate -6.00
1.59 Poli: esf +11.00 a -12.00 | cil ate -6.00
1.61: esf +11.00 a -11.00 | cil ate -6.00
1.67: esf +12.00 a -13.00 | cil ate -6.00
1.74: esf +15.00 a -16.00 | cil ate -6.00
```

## Pagina 7

Familia:

- `Haytek Easy`: lente de visao simples especial Freeform com apoio acomodativo; altura minima `16mm`.

Semantica:

- Indicada para telas, leitura e fadiga visual.
- Ideal com Filtro Azul, conforme chamada da pagina.
- Baixas adicoes: `0.50`, `0.75`, `1.00`, `1.25`.
- Classificar como `visao_simples`, mas com tags de apoio visual/fadiga/telas.
- Motivo: no BD global, lentes parecidas de conforto digital/apoio acomodativo (`Eyezen Boost`, `Eyezen Start`, `SYNC III`) estao em `visao_simples`, nao em `ocupacional`.
- Nao tratar como visao simples comum sem semantica; preservar `add_range` baixo e tags de fadiga/telas.

Grade:

```txt
1.56: esf +8.00 a -6.00 | cil ate -6.00
1.59 Poli: esf +9.00 a -8.00 | cil ate -6.00
1.61: esf +9.00 a -6.00 | cil ate -6.00; esf -6.25 a -8.00 | cil ate -4.00
1.67: esf +10.00 a -8.50 | cil ate -6.00; esf -8.75 a -10.00 | cil ate -4.00
1.74: esf +14.00 a -13.00 | cil ate -6.00; esf -13.25 a -14.00 | cil ate -4.00
```

`Haytek Light` tem grade mais restritiva:

```txt
1.56: esf +6.00 a -6.00 | cil ate -4.00
1.59 Poli: esf +6.00 a -6.00 | cil ate -4.00
1.61: esf +6.00 a -6.00 | cil ate -4.00
1.67: esf +6.00 a -10.00 | cil ate -4.00
1.74: esf +8.00 a -12.00 | cil ate -4.00
```

## Pagina 5

Familia:

- `Haytek Go!`: corredores `14`, `18`; altura minima `16mm`.

`Haytek Go!` usa a grade restritiva da `Haytek Light`:

```txt
1.56: esf +6.00 a -6.00 | cil ate -4.00
1.59 Poli: esf +6.00 a -6.00 | cil ate -4.00
1.61: esf +6.00 a -6.00 | cil ate -4.00
1.67: esf +6.00 a -10.00 | cil ate -4.00
1.74: esf +8.00 a -12.00 | cil ate -4.00
```

A pagina tambem traz o bloco de tecnologias Haytek Freeform. Usar esse bloco para enriquecer tags/beneficios das familias, mas nao transformar tecnologias em ofertas/precos.

## Pagina 6

Familias ocupacionais:

- `Haytek Drive`: altura minima `20mm`.
- `Haytek Office`: altura minima `20mm`.

A pagina nao mostra corredores numericos para essas familias; registrar corredores como vazio/nao informado.

As duas familias usam o mesmo padrao de grade segmentada amplo de `Haytek Smart`:

```txt
1.56: esf +6.00 a -6.00 | cil ate -6.00
1.59 Poli: esf +6.00 a -8.00 | cil ate -6.00
1.61: esf +7.00 a -6.00 | cil ate -6.00; esf -6.25 a -8.00 | cil ate -4.00
1.67: esf +8.00 a -8.50 | cil ate -6.00; esf -8.75 a -10.00 | cil ate -4.00
1.74: esf +14.00 a -13.00 | cil ate -6.00; esf -13.25 a -14.00 | cil ate -4.00
```

## Pagina 9

Tabela de `Transitions Gen S / Blue UV`, cores `Cinza` e `Marrom`.

Precos:

- A pagina traz preco final por familia + indice + tratamento (`Antirrisco`, `AR Verde`, `AR Azul`, `AR Premium Verde`, `AR Premium Azul`).
- Indices disponiveis nesta pagina: `1.50`, `1.59`, `1.67`.
- Nao inferir `1.56`, `1.61`, `1.74` ou `Poli` nesta pagina.
- `Haytek VS ID` foi normalizada como `Haytek Visao Simples ID`.
- `Haytek VS Freeform` deve permanecer como familia separada da `Haytek Visao Simples ID`.

Grade:

```txt
1.50: esf +6.00 a -9.00 | cil ate -6.00 | diametro 80mm
1.59: esf +7.00 a -10.00 | cil ate -6.00 | diametro 80mm
1.67: esf +9.00 a -11.00 | cil ate -6.00 | diametro 80mm
```

Regra importante:

- A adicao exibida nas linhas de visao simples (`Haytek VS ID` e `Haytek VS Freeform`) e erro da tabela. Ignorar `add_min`/`add_max` nessas linhas.
- `Haytek Easy` continua com baixa adicao (`0.50` a `1.25`) porque e visao simples especial com apoio acomodativo.
- As familias multifocais/ocupacionais da pagina mantem adicao `1.00` a `3.50`.

## Pagina 11

Lentes acabadas/prontas. Nao tratar como ofertas sem familia no BD.

Familias:

- `Haytek Visao Simples Acabadas`: familia propria de visao simples pronta/acabada.
- `Haytek Progressivas Acabadas`: familia propria de progressivas prontas/acabadas.

Modelo de preco:

- A pagina nao usa as colunas padrao de AR das paginas 3 a 9.
- Em visao simples, o preco varia por faixa de cilindro: `Cil. ate -2.00`, `Cil. -2.25 a -4.00` e, em uma linha, `Super Cilindro -4.25 a -6.00`.
- Em progressivas acabadas, ha uma coluna unica `Preco/par`.
- As linhas solares planas (`Solar Total` e `Solar Degrade`) tambem usam preco unico por par.

Modelo tecnico:

- Registrar como oferta atomica/pronta: `is_atomic_offer=true`, `allows_composition=false`, `features.fulfillment_mode=pronta`.
- Manter as grades segmentadas por produto; nao resumir por indice.
- Nas progressivas acabadas, a tabela informa `Esf. 0.00 a +3.00 | Add. 1.00 a 3.50 | Diam. 70mm`, mas nao informa cilindro. Deixar cilindro vazio/nao informado.
- Nas solares planas, registrar `Plano`, bases `4.00|6.00`, diametro `80mm`.
