# Inventario de acessos ao Supabase na Neosmart

Atualizado em 22/07/2026.

## Objetivo

Este documento registra a linha de base dos repositorios e separa os acessos ao
Supabase que ainda fazem parte dos fluxos ativos da Neosmart dos arquivos
historicos que foram copiados, mas nao pertencem ao produto final.

O inventario inicial foi diagnostico. Os lotes de autorizacao/medidas e de
heatmap foram implementados depois da auditoria, conforme registrado abaixo.

## Atualizacao do primeiro lote

Implementado localmente em 22/07/2026:

- guard das rotas migrado para `/api/tower/v1/web/access`;
- fallback conectado de medidas migrado para
  `/api/tower/v1/web/measurements`;
- UUID de operacao mantido entre retries sem alteracao do resultado;
- funcao SQL atomica que serializa a versao por sessao e rejeita reutilizacao
  do UUID com outro conteudo;
- caminho Electron SQLite -> outbox -> sync mantido sem alteracoes;
- typecheck, testes e builds aprovados nos dois repositorios.

Depois do lote, a Neosmart passou de 77 para 75 arquivos relacionados ao
Supabase, de 54 para 53 actions relacionadas e de 64 para 62 imports do cliente
administrativo.

A migration `20260722100000_tower_web_measurements.sql` foi aplicada
manualmente e confirmada por chamada remota sem gravacao. O MB Optical foi
publicado em producao com os contratos `/access` e `/measurements` protegidos.

O projeto Vercel `neosmart` tambem foi criado e vinculado, mas nao foi
publicado. Os dominios ativos restantes ainda impedem um deploy sem credencial
administrativa. A proxima migracao ativa e o ciclo de avaliacao e criacao de
cliente.

## Atualizacao do lote de heatmap

Implementado e publicado no MB Optical em 22/07/2026:

- as nove operacoes do Campo Visual foram reunidas no contrato autenticado
  `/api/tower/v1/web/heatmaps/commands`;
- todas as consultas e gravacoes do endpoint exigem tenant e loja derivados da
  sessao curta do equipamento;
- criar/retomar, iniciar, concluir, cancelar, reiniciar, consultar resultado e
  salvar/carregar template deixaram de usar o cliente administrativo na
  Neosmart;
- retries de inicio e cancelamento sao idempotentes, e uma segunda conclusao
  com resultado divergente e rejeitada;
- typecheck, 25 testes e build passaram no MB Optical;
- typecheck, 21 testes, lint e build passaram na Neosmart.

O commit `3f0c6ad` do MB Optical foi publicado em producao com status `Ready`.
Uma chamada sem credencial confirmou que a rota existe e responde `401`. O
commit local correspondente na Neosmart e `12db718`; o renderer continua sem
deploy ate a conclusao dos dominios ativos restantes.

Uma recontagem com o mesmo recorte amplo encontrou 74 arquivos relacionados e
52 actions relacionadas. O numero ainda inclui muito codigo residual que sera
eliminado no lote final, por isso nao mede apenas o fluxo ativo.

## Linha de base validada

### MB Optical

- branch: `main`;
- HEAD: `807b6c8`;
- `npm install`: aprovado, dependencias ja atualizadas;
- typecheck: aprovado;
- testes: 25 aprovados;
- build Next 14.2.35: aprovado.

### Neosmart

- branch: `main`;
- HEAD: `082e7a1`;
- worktree: limpo;
- `npm install`: aprovado, dependencias ja atualizadas;
- typecheck: aprovado;
- testes: 19 aprovados;
- build Next 14.2.35: aprovado.

O `082e7a1` e o commit documental posterior ao `fa043f4` registrado como o
ultimo commit funcional em `CURRENT_STATUS.md`.

O `npm install` informou 10 vulnerabilidades em cada repositorio, sendo 2
moderadas e 8 altas. Nenhuma correcao automatica foi aplicada, pois isso pode
alterar versoes e exige uma auditoria separada.

## Dimensao do acoplamento encontrado

Na Neosmart existem atualmente:

- 77 arquivos em `src` com referencias relacionadas ao Supabase;
- 64 arquivos em `src` que importam o cliente administrativo;
- 57 arquivos em `src/lib/actions`;
- 54 actions com referencias ao Supabase ou aos clientes antigo e
  administrativo.

Esses numeros nao significam que todos os arquivos estejam no fluxo ativo. A
maior parte corresponde a codigo historico do MB Optical que nao deve receber
uma API equivalente na Neosmart: deve ser removida quando a arvore ativa ja nao
depender dela.

## Acessos ativos por dominio

### 1. Autorizacao das rotas e configuracao

Arquivos ativos:

- `src/lib/server/tower-device-web-session.ts`;
- `src/lib/server/tower-remote-config.ts`;
- `src/lib/server/tower-remote-config-session.ts`;
- `src/app/torre/ativacao/page.tsx`.

Todas as rotas operacionais em `/torre/[storeId]` usam
`authorizeTowerStoreAccess()`. Apesar de a sessao curta ser assinada, a funcao
ainda consulta `tower_devices` diretamente e conserva um fallback de sessao
humana do Supabase. A configuracao e a autorizacao remotas tambem consultam o
banco diretamente.

A pagina de ativacao consulta diretamente ativacoes e PINs. Alem disso,
`src/app/torre/inicial/page.tsx` ainda chama uma URL relativa
`/api/tower/device/validate-activation`.

### 2. Medidas

Arquivos ativos:

- `src/lib/actions/tower-measurement.actions.ts`;
- `src/lib/tower/local-operations.ts`;
- `src/components/medidas/TowerMeasurementLab.tsx`.

No Electron, o resultado e salvo corretamente no SQLite, entra na outbox e e
enviado por `/api/tower/device/sync`. Fora do Electron, o fallback conectado
chama `saveTowerMeasurementResult()`, que ainda consulta `tower_sessions` e
grava `tower_measurement_results` diretamente com o cliente administrativo.

### 3. Campo visual e heatmap - migrado

Arquivos ativos:

- `src/lib/actions/tower-heatmap.actions.ts`;
- `src/app/torre/[storeId]/campo-visual/page.tsx`;
- `src/components/catalog/GazeHeatmapLab.tsx`.

Todo o ciclo ativo agora usa `/api/tower/v1/web/heatmaps/commands`. A action da
Neosmart preserva a interface consumida pelas telas, mas funciona apenas como
adaptador HTTP e nao importa cliente administrativo nem autorizacao local.

### 4. Avaliacao e cliente

Arquivos ativos:

- `src/components/tower/TowerEvaluationIntake.tsx`;
- `src/lib/actions/evaluation.actions.ts`;
- `src/lib/tower/local-operations.ts`;
- `src/lib/actions/customer.actions.ts`.

O ciclo de busca e vinculo de clientes ja usa os contratos HTTP v1 de sessao.
Entretanto:

- `upsertOpticalEvaluation()` ainda grava diretamente no Supabase;
- o fallback web de criacao rapida usa `createQuickCustomer()`, ainda direto;
- o fluxo Electron de cliente provisorio continua corretamente local-first.

### 5. Catalogo, geometrias, visagismo e recomendacao

Arquivos ativos:

- `src/lib/actions/global-catalog.actions.ts`;
- `src/lib/actions/lens-geometry.actions.ts`;
- `src/lib/actions/visagismo.actions.ts`;
- `src/lib/actions/lens-recommendation.actions.ts`;
- `src/lib/server/lens-recommendation.ts`;
- `src/lib/actions/store.actions.ts`;
- `src/lib/actions/tower-heatmap.actions.ts`.

As telas da Neosmart ainda leem diretamente:

- versoes e ativacoes do catalogo global;
- familias, ofertas, tratamentos e grades;
- geometrias de lentes;
- templates de armacao do visagismo;
- configuracao comercial da loja;
- resultado do heatmap usado pela recomendacao agora chega pelo contrato HTTP;
  as demais entradas da recomendacao ainda sao leituras diretas.

O motor reutilizavel pode continuar na Neosmart, mas suas entradas devem vir de
um snapshot ou contrato HTTP autenticado, e nao de consultas diretas ao banco.

### 6. Demonstracao de espessura

`src/components/tower/TowerLensThicknessDemo.tsx` ainda importa
`searchCustomersByName()` de `vendas.actions.ts`. Essa busca acessa `customers`
diretamente, embora ja exista o contrato HTTP v1 de busca de clientes na
Neosmart.

## Rotas relativas sem implementacao local

O build da Neosmart nao contem nenhuma rota `/api`. Mesmo assim, ainda existem
chamadas relativas para:

- `/api/tower/device/validate-activation`;
- `/api/tower/remote-config/[publicCode]/session`;
- `/api/tower/remote-config/[publicCode]/configuration`;
- `/api/tower/remote-config/[publicCode]/catalogs`;
- `/api/tower/remote-config/[publicCode]/ai-suggestion-config`.

Como renderer e MB Optical possuem origens separadas e nao ha rewrite em
`next.config.js`, essas chamadas apontam para a origem da Neosmart e tendem a
retornar 404 no deploy separado. O build nao detecta esse problema.

## Codigo residual que nao deve ser migrado dominio por dominio

Os seguintes grupos existem na arvore da Neosmart, mas nao sao importados pela
interface ativa da Torre ou pertencem claramente ao backoffice:

- `tower-admin.actions.ts` e `tower-assets.actions.ts`;
- financeiro, fiscal, estoque, vendas e laboratorio;
- WhatsApp, cobranca, relatorios e impressao;
- administracao geral de lojas, usuarios e funcionarios.

Esses arquivos devem permanecer no MB Optical. Na Neosmart, a acao correta e
elimina-los depois que os poucos imports ativos forem substituidos. Criar uma
API para cada action copiada perpetuaria o acoplamento antigo.

Tambem existem helpers de servidor sem consumidores ativos, como partes da
autenticacao de dispositivo, rate limit e grant de manutencao. Eles devem ser
confirmados pela arvore de imports e removidos quando nao forem necessarios ao
renderer separado.

## Outros sinais para a auditoria final

- `src/lib/supabase/admin.ts`, `server.ts` e `client.ts` ainda existem;
- ainda ha referencias a `SUPABASE_SERVICE_ROLE_KEY` na Neosmart;
- `SupabaseCookieHygiene.tsx` ainda existe;
- a CSP em `next.config.js` ainda libera `https://*.supabase.co` e
  `wss://*.supabase.co`;
- nao foram encontradas referencias ao Supabase no codigo Electron.

## Ordem recomendada de execucao

### Lote 1 - fundacao HTTP e medidas

1. Remover a consulta ao Supabase do guard de dispositivo usado pelas rotas da
   Neosmart, preservando validacao de assinatura, expiracao e `store_id` da
   sessao curta.
2. Fazer o MB Optical continuar como autoridade remota em cada contrato, onde
   o dispositivo e seu estado ativo sao revalidados.
3. Criar o contrato HTTP v1 conectado para salvar medidas.
4. Trocar o fallback web de medidas pelo cliente HTTP.
5. Preservar sem alteracao o caminho Electron SQLite -> outbox -> sync.
6. Adicionar testes de escopo, idempotencia e separacao das origens.

### Lote 2 - heatmap

Concluido em 22/07/2026. Todo o ciclo foi migrado em conjunto para manter o MB
Optical como autoridade unica.

### Lote 3 - avaliacao e criacao de cliente

Migrar a avaliacao e substituir a criacao rapida direta. Reutilizar o contrato
de clientes ja existente sempre que possivel.

### Lote 4 - snapshot de catalogo e recomendacao

Definir o recorte completo do snapshot operacional, alimentar o motor por
dados recebidos e remover as leituras diretas de catalogo, geometria,
visagismo e configuracao comercial.

### Lote 5 - ativacao e configuracao remota

Corrigir as URLs relativas e decidir quais paginas pertencem ao MB Optical e
quais pertencem ao renderer Neosmart. Nao duplicar no renderer as APIs
administrativas ja existentes no MB Optical.

### Lote 6 - limpeza e auditoria

Remover actions e modulos residuais, clientes Supabase, variaveis, dependencia
e permissoes de CSP. Em seguida, auditar codigo-fonte, bundle e instalador.
