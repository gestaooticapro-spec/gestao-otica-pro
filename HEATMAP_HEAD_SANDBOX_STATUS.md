# Heatmap Head Sandbox Status

## Context

Este documento resume o que foi feito na branch `eyetrack` para o laboratorio de mapa de calor em:

- `src/app/dashboard/loja/[storeId]/lentes/mapa-calor/page.tsx`
- `src/components/catalog/GazeHeatmapLab.tsx`

O foco desta fase foi validar o motor logico do mapa de calor usando:

- alvo conhecido na tela
- movimento da cabeca capturado pela camera
- compensacao da cabeca contra o alvo

Nesta fase, os olhos reais deixaram de ser a base da decisao. A simplificacao adotada foi:

> se o cliente foi instruido a acompanhar o alvo, assumimos que ele estava olhando para o alvo

Com isso, o problema ficou reduzido a responder:

- quanto do deslocamento do alvo foi acompanhado pela cabeca
- quanto restou para os olhos dentro da lente

## Regra do motor

O comportamento buscado foi este:

1. Se a cabeca fica parada, o calor deve pintar onde o alvo passou.
2. Se a cabeca acompanha totalmente o alvo, o calor deve ficar centralizado.
3. Se a cabeca acompanha parcialmente, o calor deve ficar entre o centro e o alvo.

Em outras palavras:

- `alvo - compensacao da cabeca = ponto restante na lente`

## O que foi implementado

### 1. Sandbox por cabeca

Foi reforcado o modo `Sandbox cabeca` dentro de `GazeHeatmapLab.tsx`, usando a branch `eyetrack` como laboratorio principal.

O caminho principal passa por:

- `startSandboxCalibration()`
- `runSandboxCalibrationStep()`
- `finishSandboxCalibration()`
- `projectHeadSandboxSample()`
- `projectSampleToLens()`

### 2. Calibracao por eixo e direcao

Foi criada uma calibracao especifica para a sandbox:

- `HeadSandboxCalibration`
- `xNegative`
- `xPositive`
- `yNegative`
- `yPositive`

Essa calibracao nasce da sequencia de 9 passos:

- centro
- so olhos esquerda/direita/cima/baixo
- cabeca esquerda/direita/cima/baixo

O baseline continua sendo o centro, mas agora os passos de cabeca alimentam a escala da compensacao em vez de serem ignorados.

### 3. Compensacao baseada em cabeca

Foi criada a logica:

- `getCalibratedHeadCarry()`
- `projectHeadSandboxSample()`

Ela calcula, para cada eixo:

- quanto a cabeca acompanhou o alvo
- quanto isso compensa do alvo
- quanto sobra para ser pintado como uso dos olhos dentro da lente

### 4. Regra de direcao

Uma correcao importante foi impedir que movimento de cabeca do lado anterior compensasse um alvo que ja pulou para o lado oposto.

Exemplo:

- alvo estava a esquerda
- cliente virou a cabeca para a esquerda
- alvo pula para a direita
- cliente volta a cabeca so ate o meio

Neste caso, a cabeca nao deve compensar o alvo da direita.

Foi aplicada uma regra de direcao dentro de `getCalibratedHeadCarry()`.

Observacao importante:

- no eixo horizontal, a camera estava reportando o sinal invertido em relacao ao alvo visual
- por isso a comparacao passou a usar `directionalHead = -head`

### 5. Pisos de ruido

Foi adicionada uma zona morta para evitar que micro-ruidos da cabeca virem compensacao forte:

- `HEAD_SANDBOX_NOISE_FLOOR_X`
- `HEAD_SANDBOX_NOISE_FLOOR_Y`

Tambem foi adicionada uma escala minima de demanda:

- `HEAD_SANDBOX_MIN_SCALE_DEMAND`

Isso evita dois problemas:

- ruido pequeno virar `100%`
- alvo perto do centro explodir a compensacao

### 6. Ajuste de projecao vertical na sandbox

Foi criada uma projecao vertical especifica para a sandbox:

- `projectSandboxLensY()`

Motivo:

- a projecao vertical usada antes estava comprimindo demais o eixo Y
- no teste "so olhos", o calor ficava contido para cima e para baixo

Com isso, a sandbox passou a respeitar melhor a altura real do alvo dentro da lente.

### 7. Painel de debug por alvo

O bloco `Sandbox cabeca · decisao por alvo` foi melhorado para mostrar:

- `Alvo lente`
- `Cabeca compensou`
- `Olho restante`
- `Cabeca eixo`
- `leitura bruta cabeca`

Tambem foram removidos os cards de fallback com `0 amostras`, que estavam confundindo a leitura.

## O que ja fez sentido nos testes

Durante os testes, algumas validacoes importantes passaram a fazer sentido:

- quando o usuario mexeu so os olhos, o mapa abriu e pintou a lente
- quando o usuario acompanhou bem com a cabeca, o mapa centralizou
- quando houve mistura de cabeca e olhos, o mapa ficou intermediario

Esses tres comportamentos eram a meta principal desta fase.

## O que ainda nao esta fechado

### 1. Eixo vertical no tablet em paisagem

O eixo vertical ainda nao deve ser tratado como calibracao final do produto.

Motivos:

- os testes atuais foram feitos com a tela em paisagem
- a torre futura deve usar a tela em retrato
- no tablet paisagem, o movimento horizontal acaba sendo mais natural e mais forte
- o movimento vertical da cabeca fica menos evidente e mais dificil de medir

Conclusao pratica:

- o eixo Y atual serve como aproximacao e laboratorio
- nao deve ser tratado como regra definitiva do produto final

### 2. Sem uso de olhos reais nesta fase

Nesta etapa, os olhos reais foram tirados da equacao para simplificar a validacao do motor.

Isso foi uma decisao consciente, e nao um bug.

Beneficio:

- tornou a regra auditavel
- eliminou a incerteza de rastreamento ocular enquanto o motor de cabeca ainda estava sendo provado

Limite:

- assume que o cliente sempre seguiu o alvo corretamente

## Recomendacao de produto

Para esta fase, a leitura sem olhos reais pode ser considerada suficiente para validar o motor logico da torre.

Recomendacao:

1. considerar esta fase como validacao do motor de compensacao cabeca vs alvo
2. manter essa base como modo controlado/logico
3. voltar ao uso dos olhos reais apenas numa fase posterior, como refinamento e verificacao adicional

Ou seja:

- nao usar olhos reais agora como dependencia para dizer se o conceito funciona
- usar olhos reais depois como camada extra de qualidade

## Arquivos principais

- `src/components/catalog/GazeHeatmapLab.tsx`
- `src/app/dashboard/loja/[storeId]/lentes/mapa-calor/page.tsx`
- `TOWER_AND_TABLET_VISION_CONTEXT.md`

## Estado atual

- a sandbox continua sendo laboratorio no MB Optical, nao contrato de
  persistencia nem autoridade de sessao;
- o fluxo operacional do Campo Visual da Neosmart usa o contrato autenticado
  `/api/tower/v1/web/heatmaps/commands`;
- o renderer Neosmart esta publicado em `https://neosmart-eta.vercel.app/`;
- o resultado do heatmap permanece vinculado a `tower_session_id` e a sessao
  deve ser retomada pelo mesmo UUID ao voltar ao menu;
- typecheck, testes e build passaram nos dois repositorios.

O nome da branch `eyetrack` e a referencia ao laboratorio permanecem como
historico desta sandbox. Nao tratar este arquivo como indicacao de que o fluxo
de producao da Torre acessa diretamente o Supabase.

## Proxima retomada sugerida

Quando este tema for retomado, a ordem mais segura e:

1. abrir este arquivo de status;
2. revisar `projectHeadSandboxSample()` e `getCalibratedHeadCarry()`;
3. manter a sandbox separada do contrato HTTP de producao;
4. decidir se o proximo passo sera:
   - congelar o modo logico atual
   - adaptar a experiencia para a torre em retrato
   - reintroduzir os olhos reais como refinamento

