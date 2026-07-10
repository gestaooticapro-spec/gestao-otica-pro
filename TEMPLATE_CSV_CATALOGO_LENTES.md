# Template CSV para Catalogo de Lentes

> **Nota atual (2026):** este template serve apenas para tabelas simples ou para uma primeira planilha de revisao. Para tabelas com multiplas faixas por produto/indice/material, use um CSV de grades separado ou multiplas linhas de grade por oferta. Nao use este template para resumir varias faixas em `esferico_min/max` + `cilindrico_max`, pois isso achata a grade e pode liberar graus indevidos.

Este template define as colunas recomendadas para cadastrar um catalogo manualmente (Excel/Google Sheets) e exportar em CSV confiavel para importacao futura.

## Colunas obrigatorias

1. `laboratorio`
2. `versao`
3. `familia`
4. `produto`
5. `design`
6. `material`
7. `indice_refracao`
8. `tratamento`
9. `preco_par_brl`
10. `preco_tipo`
11. `fonte_tabela`
12. `pagina_pdf`

## Colunas de grade (fortemente recomendadas)

13. `esferico_min`
14. `esferico_max`
15. `cilindrico_max`
16. `adicao_min`
17. `adicao_max`
18. `diametro`

## Flags de tratamento embutido

19. `transitions` (sim/nao)
20. `transitions_cores` (C/M/V/A/S etc.)
21. `blue_uv` (sim/nao)
22. `polarizado` (sim/nao)
23. `solar` (sim/nao)
24. `espelhado` (sim/nao)

## Outros campos uteis

25. `nota_disponibilidade`
26. `observacoes`

## Linha de exemplo (CSV)

```
laboratorio,versao,familia,produto,design,material,indice_refracao,tratamento,preco_par_brl,preco_tipo,fonte_tabela,pagina_pdf,esferico_min,esferico_max,cilindrico_max,adicao_min,adicao_max,diametro,transitions,transitions_cores,blue_uv,polarizado,solar,espelhado,nota_disponibilidade,observacoes
Essilor,Essilor Abril 2026,Varilux XR Series,Varilux XR Pro,Progressiva Digital,Orma,1.50,Crizal Sapphire HR,3507.00,absoluto,PVC,4,-10.00,+6.00,-4.00,1.00,3.50,70,nao,,sim,nao,nao,nao,,
```

## Dicas de preenchimento

- `preco_par_brl` sempre em numero (ex: 3507.00).
- `preco_tipo` use `absoluto` quando o preco ja e final.
- Se algum campo nao existir, deixar vazio (nao inventar).
- Se nao houver adicao, deixe `adicao_min` e `adicao_max` vazios.
- Para transicoes, use `transitions=sim` e `transitions_cores=C/M/V` etc.
- Para multifocal, bifocal e ocupacional, preencha `adicao_min` e `adicao_max` sempre que a tabela trouxer grade. O motor usa esses campos para bloquear ofertas indisponiveis, por exemplo ADD +4.00.
- Nao marque `solar=sim` como `transitions=sim`. Solar fixo e fotossensivel automatico sao necessidades diferentes no motor.
- Nao marque `blue_uv=sim` por inferencia comercial vaga; use apenas quando a tabela/tratamento confirmar.
- Depois da importacao estrutural, ainda e necessario enriquecer semantica de familias e tratamentos. O contrato completo fica em `IMPORTACAO_CATALOGOS_E_SEMANTICA.md`.

## Campos que alimentam a recomendacao

O CSV bruto resolve preco e disponibilidade, mas o motor tambem depende de semantica importada/enriquecida no banco:

- `clinical_category` por familia/oferta: `visao_simples`, `multifocal`, `ocupacional`, `bifocal`, `controle_miopia`, `plana_solar`, `mista`.
- `tags_uso`: computador, celular, leitura, dirigir, dirigir_noite, sol, crianca, esporte.
- `tags_beneficios`: adaptacao_rapida, conforto_visual, conforto_digital, qualidade_optica, campo_perto, lente_fina, estetica, resistencia, controle_miopia.
- `features` da oferta: material/indice, fotossensivel, solar, blue_uv, antirreflexo embutido, design asferico/esferico, alturas/corredor quando disponiveis.
- `semantic_profile` dos tratamentos: tier, usos, beneficios, resumo comercial e notas de indicacao.

Para uma marca nova como Zeiss, o motor nao deve depender do nome da marca para "adivinhar" desempenho. Ele precisa desses campos estruturados para ranquear e explicar com a mesma coerencia das marcas ja testadas.
