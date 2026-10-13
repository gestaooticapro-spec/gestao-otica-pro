# Limpeza da sobra da Torre neste repositório

A interface da Torre e o Electron já vivem em `G:\projetos\torre-neosmart`.
Este arquivo descreve como tirar a cópia antiga daqui sem mexer na ótica em produção.

A Torre está funcional e fora de produção. Uma quebra nela pode ser revertida.
Venda, laboratório, financeiro, WhatsApp e o tablet da loja não podem quebrar.

## Ritmo

Não apague um arquivo por dia. Cada deploy incompleto ocupa armazenamento de novo
e deixa o site num estado intermediário.

Faça **três cortes**. Cada corte é um commit, um deploy e uma verificação.
Se algo falhar, reverta esse commit. Não comece o corte seguinte no mesmo dia
se o anterior ainda não foi visto em produção.

| Corte | O que sai | Quem sente | Quando publicar |
|---|---|---|---|
| 1 | Arquivo morto e assets sem import | Ninguém | Assim que o typecheck passar |
| 2 | Electron duplicado e testes dele | Ninguém na web | No deploy seguinte, depois do corte 1 estável |
| 3 | Páginas antigas da experiência da Torre | Só quem ainda abre `/torre/{loja}` neste site | Um deploy próprio, com a lista de fumaça da ótica |

Os cortes 1 e 2 não mudam URL de usuário. Podem ir em dias seguidos.
O corte 3 é o único que apaga tela. Faça ele inteiro num único deploy:
apagar uma página por dia criaria links internos quebrados.

## O que não entra em corte nenhum

Estas partes continuam sendo deste repositório. A Neosmart ainda as chama,
ou a ótica em produção ainda as usa.

### APIs e servidor

- `src/app/api/tower/v1/web/**`
- `src/app/api/tower/device/**`
- `src/app/api/tower/asset/**`
- `src/app/api/tower/remote-config/**`
- `src/app/api/internal/tower-report-cleanup/**`
- `src/app/api/public/tower-reports/**`
- `src/lib/server/tower-*`
- `src/lib/tower/**`
- `src/lib/actions/tower-*.actions.ts` e as actions de avaliação, medida,
  catálogo e recomendação usadas por essas rotas
- `supabase/migrations/**` com tabelas da Torre
- `tests/tower-web-api-contracts.test.mjs`
- `tests/tower-migration.test.mjs`

### Backoffice que a loja e a instalação ainda usam

- `src/app/admin/torres/**`
- `src/components/admin/Tower*.tsx`
- `src/app/torre/ativacao/**` — o admin gera o link `/torre/ativacao` para o QR
- `src/app/torre/remota/**` — única tela que grava a configuração comercial da Torre
- `src/components/tower/TowerRemote*.tsx`
- `src/components/tower/TowerCommercialAccessPanel.tsx`
- `src/app/relatorio/[token]/**` e `src/components/tower/TowerReportLensSimulation.tsx`
  — o link do relatório do cliente aponta para este domínio

### Tablet e medidas da ótica

O tablet da loja não passa pela Torre.

- `src/app/tablet/**` — OS, Pix maquininha e o botão de modo tablet
- `src/components/tablet/**`
- `src/app/medidas-armacao/**`
- `src/components/medidas/FrameMeasurementTool.tsx`
- `src/app/api/medidas/**` e `src/lib/medidas/**`
- `services/lens-segmentation/**`

`TowerMeasurementLab.tsx` só é aberto por `src/app/torre/[storeId]/medidas`.
Ele sai no corte 3, junto com essa página. `FrameMeasurementTool` fica.

Também ficam, porque o dashboard da loja importa:

- `src/components/catalog/**` (mapa de calor, campo focal, visualizador, geometria)
- `src/components/visagismo/**`
- `src/components/evaluation/**`
- `src/components/medidas/**`, exceto `TowerMeasurementLab.tsx` no corte 3
- `public/lens-demo/**`, `public/lens-bg.png`, `public/lens-bg1.png`, `public/dossie*`
- `@mediapipe/tasks-vision`

`GazeHeatmapLab` tem um atalho para `/torre/...` só quando existe `towerSessionId`.
A página do dashboard não envia esse id. Não apague o componente. Não reescreva
o fluxo do mapa de calor da loja neste trabalho.

## Antes de cada corte

1. Confirme que o deploy anterior está Ready e que a loja consegue vender.
2. Trabalhe em um commit só desse corte.
3. Rode `npm run typecheck`.
4. Rode `npm test` depois de ajustar os scripts, se o corte mexer em teste.
5. Publique. Não misture correção de venda, WhatsApp ou fiscal nesse commit.

Se a produção quebrar, reverta o commit desse corte e publique de novo.
Não "conserte por cima" no mesmo dia.

## Corte 1 — arquivo morto

Nada disso é importado por página, API ou tablet.

Apague:

- `src/components/tower/LensPhysicalView copy.tsx`
- `public/3d/armacao.dae`
- `public/avatar.glb`

Procure no repositório, antes de apagar, por `LensPhysicalView copy`,
`armacao.dae` e `avatar.glb`. Se aparecer um import novo, pare.

Verificação:

- `npm run typecheck`
- Abra no ar, depois do deploy: uma loja, a venda experimental e
  `/tablet/{loja}/os`
- Abra `/medidas-armacao?storeId={loja}` e confirme que a câmera da medida
  de armação ainda carrega

Não há fumaça de Torre neste corte.

## Corte 2 — Electron duplicado

O site na Vercel não executa esse Electron. A Neosmart tem o pacote dela.

Apague:

- a pasta `electron/`
- `src/types/electron.d.ts`, se nenhum arquivo de `src/` ainda o importar
- `tests/electron-security.test.mjs`
- `tests/tower-local-database.test.mjs`

No `package.json`:

- tire os scripts `dev:electron`, `electron`, `electron:wait`, `pack:electron`
  e `dist:electron`
- tire `electron`, `electron-builder`, `concurrently` e `wait-on` das
  dependências, se mais nada os importar
- tire o bloco `"build"` do electron-builder
- tire `"main": "electron/main.cjs"` se ele só existia para o Electron
- no script `test`, tire `tests/electron-security.test.mjs` e
  `tests/tower-local-database.test.mjs`
- no script `lint:tower`, tire `electron/main.cjs` e `electron/preload.cjs`

Não tire `three` nem `@zxing/browser` neste corte. A página de ativação e as
demos ainda podem usá-los. Isso fica para o corte 3, e só se o typecheck
mostrar que ninguém mais importa.

`dist-electron/` já está no `.gitignore`. Apague a pasta local se quiser
liberar disco. Ela não vai no Git.

Verificação:

- `npm run typecheck`
- `npm test`
- No ar: login, dashboard de uma loja, `/tablet/{loja}` e
  `/tablet/{loja}/os` abrindo a medida de armação
- Admin → Torres ainda abre e o botão de reemitir QR ainda mostra
  `/torre/ativacao`

## Corte 3 — experiência antiga da Torre

Faça este corte num único commit. As páginas se ligam entre si. Apagar uma
e deixar as outras cria botão que cai em 404.

Apague as páginas:

- `src/app/torre/[storeId]/**`
- `src/app/torre/inicial/**`
- `src/app/torre/configuracao/**`
- `src/app/torre/cliente/**`
- `src/app/dashboard/loja/[storeId]/torre/**`

Apague os componentes que só essas páginas importam:

- `src/components/tower/TowerWelcomeMock.tsx`
- `src/components/tower/TowerEvaluationIntake.tsx`
- `src/components/tower/ArTreatmentDemo.tsx`
- `src/components/tower/OptiFogDemo.tsx`
- `src/components/tower/PolarizedLensDemo.tsx`
- `src/components/tower/TowerLensFieldComparison.tsx`
- `src/components/tower/TowerLensThicknessDemo.tsx`
- `src/components/tower/LensPhysicalView.tsx`
- `src/components/medidas/TowerMeasurementLab.tsx`

Não apague:

- `src/app/torre/ativacao/**`
- `src/app/torre/remota/**`
- `src/components/tower/TowerActivation*.tsx`
- `src/components/tower/TowerRemote*.tsx`
- `src/components/tower/TowerCommercialAccessPanel.tsx`
- `src/components/tower/TowerReportLensSimulation.tsx`
- `src/components/medidas/FrameMeasurementTool.tsx`

Antes de apagar cada componente, busque o nome no `src/`. Se o dashboard,
o tablet ou uma API importar, deixe o arquivo.

No `next.config.js`, o cabeçalho de CSP em `/torre/:path*` pode ficar:
`/torre/ativacao` e `/torre/remota` continuam.

No `package.json`, o script `lint:tower` deve deixar de citar
`src/app/torre` inteiro se essa pasta ainda tiver ativação e remota.
Aponte só para as pastas que permanecerem.

Verificação neste computador, antes do deploy:

- `npm run typecheck`
- `npm test`
- Busca por `` `/torre/${ `` e `href="/torre/` fora de ativação, remota e admin
- Confirme que não restou import de `TowerMeasurementLab`

Verificação no ar, depois do deploy, numa loja real:

1. Login e abertura do dashboard.
2. Venda experimental abre e um item entra no rascunho. Não finalize uma venda
   de cliente só para este teste.
3. `/tablet/{loja}` abre.
4. `/tablet/{loja}/os` lista ordens.
5. O link de medir armação abre `/medidas-armacao` e a ferramenta carrega.
6. `/dashboard/loja/{loja}/lentes/mapa-calor` abre.
7. `/dashboard/loja/{loja}/lentes/campo-focal` abre.
8. `/dashboard/loja/{loja}/visagismo` abre.
9. `/dashboard/loja/{loja}/avaliacao` abre.
10. Admin → Torres abre, e o link de QR continua em `/torre/ativacao`.
11. `/torre/remota/{codigo}` ainda pede o PIN.

A experiência em `/torre/{loja}` passa a responder 404. Isso é o resultado
esperado. A Torre física usa o executável Neosmart, não essa URL.

## O que fica para outra decisão

Não faça neste plano:

- apagar `/api/tower/**`
- apagar o admin de torres
- apagar `/torre/ativacao` ou `/torre/remota`
- apagar o relatório `/relatorio/[token]`
- mover catálogo, visagismo, avaliação ou medida de armação para a Neosmart
- enxugar `GazeHeatmapLab`, `VirtualTryOn` ou `EvaluationInterface`

Esses arquivos são grandes e pesam no deploy, mas são função da ótica ou
contrato da Torre. Misturá-los com esta limpeza é o jeito de quebrar produção.

## Registro

Quando um corte for implementado, descreva só esse corte em
`PENDING_RELEASE_CHANGES`. Não altere número de versão sem a frase
`mude a versao`.
