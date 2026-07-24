# Neosmart - Decisoes de desenvolvimento e estado atual

> Documento canonico para retomar o desenvolvimento da antiga Torre, agora
> chamada Neosmart.

## Objetivo do produto

A Neosmart e a experiencia dedicada da torre interativa para lojas de otica.
Ela deve operar em tela cheia no mini PC, com touch, camera e segunda tela, sem
depender do login humano do MB Optical.

As experiencias principais sao:

1. visagismo;
2. campo visual/heatmap com indicacao de multifocais;
3. medidas;
4. demonstracoes educativas de lentes, foco, desfoco e espessura;
5. avaliacao e recomendacao comercial de lentes.

## Arquitetura obrigatoria

### Contexto de produto que deve ser preservado

A Neosmart nao deve ser apenas um dashboard com menus escondidos. Ela possui
uma experiencia propria de cliente, uma experiencia de operador, camera, tela
cheia, hardware e continuidade local. O tablet e um apoio para lojas que ainda
nao possuem Torre; ele nao define a experiencia principal.

Quando a loja contratar o MB Optical completo, nao existe migracao de clientes,
sessoes ou historico. O mesmo `tenant_id` e `store_id` continuam validos; mudam
apenas plano, modulos e permissoes humanas.

### Repositorios separados

Os produtos nao compartilham mais o mesmo repositorio:

- `G:\projetos\gestao-otica-pro`: backoffice, banco, regras centrais e APIs;
- `G:\projetos\torre-neosmart`: interface dedicada, Electron, SQLite e cache.

O nome do produto da torre e **Neosmart**. Nao criar novas funcionalidades da
Neosmart dentro do MB Optical.

### Responsabilidades do MB Optical

- fonte canonica dos dados no Supabase;
- tenants, lojas, usuarios e permissoes;
- cadastro e administracao de equipamentos;
- clientes, avaliacoes e historico;
- catalogos, geometrias e regras de recomendacao;
- configuracao remota;
- APIs autenticadas usadas pela Neosmart;
- dashboard, vendas, estoque, laboratorio, financeiro, fiscal e WhatsApp.

### Responsabilidades da Neosmart

- renderer web da torre;
- shell Electron e instalador Windows;
- experiencia de operador e cliente;
- camera, touch e segunda tela;
- SQLite local, cache e outbox;
- identidade local do equipamento;
- continuidade durante falhas de internet;
- sincronizacao com as APIs do MB Optical.

### Regra de integracao

A Neosmart nao deve importar codigo do repositorio MB Optical. A comunicacao
ocorre por APIs HTTP autenticadas e versionadas.

Contratos web atuais:

- `/api/tower/v1/web/customers`;
- `/api/tower/v1/web/session-context`;
- `/api/tower/v1/web/sessions`;
- `/api/tower/v1/web/sessions/commands`.

Esses contratos cobrem busca de clientes e todo o ciclo de sessoes: criar,
retomar, listar, vincular cliente, vincular avaliacao, salvar receita, concluir
e descartar.

## Seguranca e identidade

- O equipamento e pareado com um `store_id` imutavel.
- A credencial permanente fica somente no processo principal do Electron,
  protegida pelo `safeStorage`.
- A credencial permanente nao pode entrar no renderer, preload, SQLite, bundle
  web ou variaveis publicas.
- O renderer recebe apenas uma sessao web curta em cookie HTTP-only.
- O servidor deve derivar tenant, loja e equipamento da credencial validada.
- Nunca aceitar `tenant_id`, `store_id` ou identidade de cliente arbitrarios do
  renderer sem validar o pareamento.
- A Neosmart nao pode conter `SUPABASE_SERVICE_ROLE_KEY` nem cliente
  administrativo do Supabase.
- Renderer e APIs possuem origens independentes:
  - `NEOSMART_RENDERER_URL`: interface Neosmart;
  - `MB_OPTICAL_API_URL`: APIs centrais do MB Optical.
- Em producao, ambas as origens devem usar HTTPS.

## Ativacao, pareamento e manutencao

O fluxo de ativacao e separado do fluxo de manutencao:

```text
equipamento sem vinculo
 -> conectar a internet
 -> ler QR Code ou digitar codigo alternativo
 -> validar ativacao no servidor
 -> parear com tenant/store_id
 -> guardar credencial protegida
 -> executar diagnostico e calibracao
 -> liberar operacao normal

equipamento ja pareado
 -> PIN local para manutencao do equipamento
 -> camera, telas, brilho, orientacao e rede
 -> configuracao comercial por URL autenticada
```

QR Code, codigo alternativo e PIN devem ser tratados como credenciais
separadas. Codigos devem ser temporarios, armazenados como hash e reemitidos
quando perdidos; reemissao nao cria outra loja nem outro tenant.

### Decisao de produto: prototipo aberto e producao appliance

Em 23/07/2026 foi decidido separar explicitamente os dois cenarios:

- o MiniPC atualmente em homologacao e um prototipo de laboratorio; ele pode
  usar o Windows normalmente para configurar rede, instalar o Electron e
  ajustar camera, iluminacao, telas, rastreamento ocular e ergonomia;
- esse prototipo nao sera entregue a uma otica;
- a Torre de producao deve ser um appliance Windows: iniciar diretamente no
  Electron, impedir o acesso normal ao desktop e bloquear atalhos de escape
  como `Alt+Tab` por politica de kiosk do Windows, nao apenas pelo fullscreen
  da janela Electron;
- a configuracao inicial de Wi-Fi deve ocorrer dentro do Electron, em uma tela
  protegida, sem exigir que a otica receba acesso ao Windows;
- deve existir uma porta de manutencao separada, protegida por PIN ou codigo
  temporario de suporte, capaz de abrir as ferramentas tecnicas do Windows
  somente quando autorizada e com auditoria;
- a implementacao do modo appliance, da configuracao interna de Wi-Fi e da
  manutencao protegida e obrigatoria antes do primeiro equipamento de
  producao, mas nao bloqueia a homologacao do prototipo atual.

O kiosk de janela existente no Electron e apenas uma camada parcial. Ele nao
substitui Assigned Access/Shell Launcher, politicas do Windows e os testes de
reinicio, perda de rede, recuperacao e suporte.

### Mudanca registrada no WhatsApp - 23/07/2026

O fluxo de atendimento passou a respeitar o modo manual do cliente de forma
uniforme:

- o roteador de mensagens automaticas reconhece `force_human` mesmo quando o
  telefone salvo possui variacao de formato;
- lembretes automaticos de parcelas nao sao agendados para clientes em modo
  manual;
- lembretes que ja estavam agendados sao cancelados antes do envio quando o
  cliente entra em atendimento manual;
- a validacao foi concluida com `tsc --noEmit`; o lint global continua
  bloqueado por uma falha circular preexistente na configuracao do ESLint 9.

## Decisoes da experiencia

### Fluxo de avaliacao e sessoes

A avaliacao usa a credencial do dispositivo pareado e nao uma sessao humana do
dashboard. Falha de autorizacao deve voltar ao fluxo da Torre e nao enviar o
touch para `/login`.

Cada atendimento possui uma sessao persistida. Cliente, avaliacao, receita e
resultados devem compartilhar a mesma `tower_session` e loja. Operacoes de
criar, retomar, vincular, salvar e concluir precisam ser idempotentes em retries
de rede.

### Campo visual e heatmap

O modelo atual usa alvo conhecido e movimento de cabeca para estimar a demanda
visual restante dentro da lente. Olhos reais nao sao a base da decisao nesta
fase; o cliente acompanha o alvo instruido pelo operador.

O roteiro usa 19 alvos balanceados: 9 longe, 6 intermediarios e 4 perto. Os
cantos inferiores ficam livres para respeitar a logica de ampulheta das
multifocais, mas a parte inferior central continua sensivel para leitura.

Cada alvo gera amostra consolidada. Heatmap e auditoria devem usar a mesma
coordenada, orientacao e convencao de eixos. Alteracoes de calibracao devem ser
comparadas com `HEATMAP_HEAD_SANDBOX_STATUS.md`.

`BroadcastChannel` e somente um mecanismo de prototipo para sincronizar
operador e tela do cliente. Nao e contrato de persistencia, autoridade de
sessao ou sincronizacao com o MB Optical.

### Medidas

Resultados numericos e estado operacional pertencem a sessao e devem sobreviver
a falha de rede. Imagens frontal e de perfil precisam de rascunho local quando
forem necessarias para retomar a tela. A politica de descarte deve respeitar
privacidade e a conclusao do atendimento.

### Experiencias educativas

Tratamento AR, lentes polarizadas, Opti Fog, comparativo de campos e espessura
sao experiencias didaticas. Elas explicam o beneficio comercial e nao devem ser
apresentadas como prescricao ou calculo final de laboratorio.

Na espessura existem cinco templates didaticos e uma opcao separada de receita
real. A receita real usa OD/OE, cilindro, eixo e adicao persistidos na sessao;
os controles didaticos de indice, armacao e centro optico continuam separados.
Ao voltar a um template didatico, a receita real permanece salva, mas nao se
torna obrigatoria.

O modelo futuro de armacao com haste deve reutilizar a geometria frontal sem
alterar o modelo original e acrescentar perfil lateral, dobradica, profundidade
e encaixe. `visualWeight` nao substitui uma medida fisica do aro.

Escala fisica aproximada depende de perfis homologados de monitor, pixels por
milimetro e conferencia com regua de 50 mm. A escala didatica deve indicar a
ampliacao; nenhuma delas substitui a referencia de producao do laboratorio.

## Dados locais e sincronizacao

O Supabase continua sendo a fonte de verdade. O SQLite e uma replica limitada,
cache operacional e fila de sincronizacao.

O fluxo local-first deve permanecer:

1. a operacao e gravada no SQLite;
2. a mesma transacao cria um evento na outbox;
3. o Electron tenta sincronizar imediatamente;
4. falhas permanecem na fila e usam retry;
5. reenvios sao idempotentes;
6. confirmacoes remotas atualizam os mapeamentos locais;
7. falha de sincronizacao nunca apaga o dado local.

O SQLite ja cobre sessoes, clientes provisorios, medidas, aprovacoes de
hardware, configuracao remota cifrada e outbox. A credencial permanente nao e
armazenada nele.

## Configuracao remota

O MB Optical administra a loja e publica a configuracao. A Neosmart baixa um
snapshot autenticado e versionado depois de validar o dispositivo pareado.

O snapshot atual inclui:

- configuracao da interface;
- identidade das versoes ativas do catalogo;
- prioridades comerciais;
- estado necessario para operacao conectada.

Ele ainda nao inclui todo o recorte de familias, ofertas, tratamentos,
geometrias e motor de recomendacao necessario para partida e recomendacao
completamente offline.

## Estado das etapas de desenvolvimento

### Passos 1 a 8

Existe base implementada para shell Electron, tela inicial, ativacao, QR Code e
codigo alternativo, pareamento, armazenamento protegido, PIN/manutencao,
experiencias no Electron e configuracao remota. A homologacao completa em
hardware real continua pendente.

### Passo 9 - persistencia local e sincronizacao

O contrato local-first esta implementado: SQLite em `app.getPath('userData')`,
WAL, foreign keys, transacoes `BEGIN IMMEDIATE`, outbox e retry. O processo
principal tenta sincronizar imediatamente e em ciclo periodico. Falha de rede
nao apaga dados.

Aprovacoes de hardware, sessoes, clientes provisorios, medidas e configuracao
remota possuem persistencia local e sincronizacao. As migrations necessarias
desta etapa foram aplicadas no Supabase.

Ainda falta validar funcionalmente, no Electron e depois no equipamento real:

- queda de internet durante cadastro e medidas;
- reinicio do Electron e do Windows;
- reconciliacao de cliente provisorio;
- retomada com dispositivo pareado real;
- ausencia de duplicacao ou perda na outbox.

### Decisoes que orientam qualquer codigo novo

1. A avaliacao inicia a leitura visual e pertence a uma sessao persistida.
2. Cliente, avaliacao, catalogo, geometria, heatmap e recomendacao devem
   preservar o mesmo contexto de loja.
3. O calculo reutilizavel deve ser independente da interface.
4. Geometria, heatmap e medidas devem usar coordenadas e unidades coerentes.
5. O motor de recomendacao e a base da indicacao; a UI apenas apresenta.
6. Privacidade, dispositivo pareado e escopo de loja sao obrigatorios desde o
   inicio.
7. Falhas de sincronizacao nao podem apagar dados locais nem duplicar clientes.

## Estado atual validado

### MB Optical

- Next 14.2.35 e React 18.
- Deploy de producao ativo e com status `Ready` em `gestao-otica-pro.vercel.app`.
- Typecheck aprovado.
- 26 testes automatizados aprovados.
- Build de producao aprovado.
- APIs HTTP v1 de clientes, sessoes, heatmap, medidas, catalogo,
  recomendacao, configuracao e IA publicadas.

### Neosmart

- Repositorio independente criado.
- Next 14.2.35, React 18.2.0 e Electron 43.1.1.
- Identidade `br.com.mboptical.neosmart`.
- Executavel `neosmart`.
- Instalador planejado como `Neosmart-Setup-*`.
- Renderer publicado em `https://neosmart-eta.vercel.app/`.
- O renderer oficial da Torre/Neosmart e o projeto Vercel `neosmart`; o
  instalador de producao deve usar
  `tower.productionUrl = https://neosmart-eta.vercel.app/`. O dominio
  `gestao-otica-pro.vercel.app` pertence ao backoffice MB Optical e nao deve
  ser usado como origem do Electron da Neosmart.
- Origens do renderer e das APIs separadas.
- Ciclo de clientes e sessoes migrado para HTTP v1.
- Typecheck aprovado.
- 30 testes automatizados aprovados.
- Build de producao aprovado.

## Pendencias antes do Passo 10

### Lote HTTP de autorizacao e medidas - implementado localmente em 22/07/2026

O primeiro lote posterior a separacao foi implementado nos dois repositorios:

- novo contrato `/api/tower/v1/web/access`, que revalida no MB Optical o
  dispositivo ativo usado pelo guard das rotas da Neosmart;
- novo contrato `/api/tower/v1/web/measurements`;
- persistencia de medidas atomica e idempotente por UUID de operacao;
- fallback web da Neosmart migrado para HTTP;
- caminho Electron SQLite -> outbox -> sync preservado;
- typecheck, testes e builds aprovados nos dois repositorios.

A migration `20260722100000_tower_web_measurements.sql` foi aplicada
manualmente e a funcao foi confirmada por chamada remota sem gravacao. O MB
Optical foi publicado pelo commit `8ea4163`; o deploy de producao ficou
`Ready`, e os contratos `/access` e `/measurements` responderam corretamente
como rotas protegidas.

O projeto Vercel exclusivo `neosmart` foi criado, vinculado ao repositorio e
publicado em `https://neosmart-eta.vercel.app/`, sem chaves administrativas ou
acesso direto ao Supabase. Os lotes de heatmap, avaliacao/cliente, catalogo,
recomendacao, ativacao, configuracao e IA operacional ja foram migrados.

O lint da Neosmart terminou sem erros e com dois avisos preexistentes. O lint
do MB Optical nao iniciou a analise por uma falha circular da configuracao do
ESLint 9; typecheck, testes e build continuaram aprovados.

### Lote HTTP de Campo Visual - publicado em 22/07/2026

O ciclo completo do heatmap foi migrado sem dividir sua autoridade entre os
dois sistemas:

- o MB Optical publicou `/api/tower/v1/web/heatmaps/commands`;
- o endpoint autentica a sessao curta e aplica tenant e loja em todas as
  operacoes;
- a Neosmart preserva as nove funcoes consumidas pela interface, mas todas
  encaminham comandos HTTP e nenhuma acessa o Supabase diretamente;
- uma conclusao repetida aceita o mesmo resultado e rejeita conteudo
  divergente;
- typecheck, testes e builds passaram nos dois repositorios; o lint da
  Neosmart tambem passou.

O commit `3f0c6ad` foi publicado no MB Optical com deploy `Ready`; uma chamada
sem credencial ao endpoint retornou `401`. O commit local da Neosmart e
`12db718`. O renderer Neosmart ja possui deploy proprio; a validacao integrada
continua sendo feita contra as duas origens publicadas.

### Lote HTTP de avaliacao e cliente - publicado em 22/07/2026

- a rota de clientes passou a aceitar criacao autenticada e idempotente em
  retries com o mesmo nome e telefone;
- a nova rota `/api/tower/v1/web/evaluations` valida tenant, loja, cliente e
  configuracao de Analise Pre-Venda;
- uma avaliacao aberta e atualizada em vez de duplicada;
- a Neosmart usa actions HTTP dedicadas nos dois consumidores ativos;
- o caminho local-first do Electron foi preservado;
- typecheck, testes e builds passaram nos dois repositorios, e o lint do lote
  Neosmart nao apresentou erros.

O commit `9eca599` foi publicado no MB Optical com deploy `Ready`. Os dois
contratos responderam `401` sem credencial e sem gravacao. O commit local da
Neosmart e `107c01e`.

### Lote HTTP de catalogo e recomendacao - publicado em 22/07/2026

- o snapshot `/api/tower/v1/web/operational-catalog` expoe catalogos ativos,
  geometrias e gabaritos como recursos selecionaveis;
- ativacoes sao limitadas por tenant, loja e estado ativo;
- a inferencia de perfil de gabaritos antigos foi mantida;
- o motor de recomendacao passou para
  `/api/tower/v1/web/recommendations` e valida todas as versoes solicitadas;
- configuracao comercial, catalogo, geometrias e heatmap permanecem sob a
  autoridade do MB Optical;
- as paginas ativas e a action de recomendacao da Neosmart usam apenas HTTP;
- typecheck, testes e builds passaram nos dois repositorios, e o lint do lote
  Neosmart nao apresentou erros.

O commit `011967a` foi publicado no MB Optical com deploy `Ready`. Snapshot e
recomendacao responderam `401` sem credencial. O commit local da Neosmart e
`16f933b`.

### Lote HTTP de ativacao e configuracao - publicado em 22/07/2026

- a configuracao operacional ganhou o contrato autenticado
  `/api/tower/v1/web/configuration`, limitado por dispositivo ativo, tenant e
  loja;
- a validacao de ativacao saiu da URL relativa do renderer e passou pelo IPC
  restrito do Electron diretamente para o MB Optical;
- as paginas copiadas de ativacao e configuracao remota da Neosmart agora
  encaminham para as telas canonicas do MB Optical;
- a sessao comercial, o PIN, os catalogos e a gravacao da configuracao remota
  permanecem no dominio central, onde o cookie HTTP-only e valido;
- a implementacao remota duplicada e seus acessos administrativos foram
  removidos da Neosmart;
- typecheck, 25 testes e build passaram no MB Optical; typecheck, 24 testes,
  lint do lote e build passaram na Neosmart.

O commit `0d2eafb` foi publicado no MB Optical com deploy `Ready`, e a nova
rota respondeu `401` sem credencial. O commit local da Neosmart e `8d4d48f`.

### Lote de ativos e operacoes do equipamento - concluido em 22/07/2026

- o inventario confirmou que registro fisico, status, validacao de ativacao,
  pareamento, PIN, acesso remoto, configuracao, sessao curta e sincronizacao ja
  usam os endpoints centrais existentes do MB Optical;
- as credenciais permanentes continuam restritas ao processo principal do
  Electron e nao foi necessario criar outro contrato HTTP;
- `tower-admin.actions.ts`, `tower-assets.actions.ts` e os modulos servidores
  copiados para autenticacao, rate limit e grant de manutencao nao possuíam
  consumidor ativo na Neosmart e foram removidos;
- os componentes usados apenas para apresentar ativacoes no backoffice central
  tambem foram retirados da Neosmart;
- typecheck, 25 testes, lint do lote e build passaram na Neosmart.

Este lote nao alterou codigo do MB Optical nem exigiu deploy funcional. O
commit local da Neosmart e `ffe8861`.

### Lote de desacoplamento final e IA operacional - publicado em 22/07/2026

- a tela de espessura deixou de importar `vendas.actions.ts` e passou a usar a
  busca autenticada de clientes da propria Torre;
- medidas, narrativa comercial de lentes e narrativa de visagismo passaram a
  usar o gateway autenticado `/api/tower/v1/web/ai` no MB Optical;
- o gateway valida o payload, a loja e o dispositivo, responde sem cache e
  aplica rate limit compartilhado por dispositivo e operacao;
- as chaves e os SDKs dos provedores foram removidos dos tres fluxos ativos da
  Neosmart e permanecem somente no servidor central;
- a imagem de medidas e reduzida para no maximo 1600 px e recomprimida antes do
  envio; as coordenadas sao escaladas na ida e restauradas na volta;
- `.env.local` e as variaveis do projeto Vercel da Neosmart nao contem chaves
  de provedores de IA;
- a auditoria dos traces do build confirmou que espessura, medidas, avaliacao e
  visagismo nao carregam `vendas.actions`, service role, chaves ou URLs de
  provedores;
- typecheck, testes e builds passaram nos dois repositorios. Foram aprovados 26
  testes no MB Optical e 27 na Neosmart; o lint direcionado da Neosmart ficou
  sem erros. Permanecem apenas as dividas globais de lint ja documentadas.

O commit `6696498` foi publicado no MB Optical com deploy `Ready`, e a rota
respondeu `401` sem credencial. O commit local da Neosmart e `2c9e439`; o
renderer ja foi publicado separadamente.

### Lote de experiencia e continuidade de sessao - publicado em 22/07/2026

- narrativas de IA aguardam respostas validas dos provedores e mantem a tela do
  cliente limpa quando todos falham;
- comparativos de AR e polarizado publicam os videos de origem e tratamento;
- a tela inicial do Electron exibe as aprovacoes reais de camera, touch e tela
  cliente;
- ao retornar para uma sessao existente, o UUID vindo na URL agora sincroniza
  o estado interno do menu e impede a criacao silenciosa de uma nova sessao;
- a correcao foi publicada no MB Optical (`e8e6834`) e na Neosmart (`2331597`);
- 26 testes do MB Optical e 30 testes da Neosmart passaram, com typecheck e
  build aprovados nos dois repositorios.

As duas sessoes duplicadas criadas antes da correcao permanecem preservadas
para reconciliacao posterior; nenhum dado foi apagado ou mesclado
automaticamente.

Ainda existem actions copiadas que podem acessar o Supabase diretamente. Antes
do empacotamento final, executar um inventario e migrar pelo menos:

1. qualquer outra action que use `createAdminClient`, service role ou acesso
   direto ao banco.

Para cada dominio:

1. criar contrato HTTP v1 no MB Optical;
2. autenticar a sessao curta do equipamento;
3. validar `store_id`, tenant e estado do dispositivo no servidor;
4. criar cliente HTTP correspondente na Neosmart;
5. remover o acesso direto ao Supabase da Neosmart;
6. executar typecheck, testes e build nos dois repositorios;
7. criar commits separados no MB Optical e na Neosmart.

Depois das migracoes, auditar o bundle e o codigo da Neosmart para confirmar a
ausencia de credenciais administrativas e acessos amplos ao banco.

## Passo 10 - Publicacao, empacotamento e piloto

### Estado do passo

**Renderer publicado; prototipo de laboratorio em instalacao; empacotamento e
homologacao do piloto de producao ainda pendentes.**

O MiniPC em uso nesta fase e somente de laboratorio. A instalacao atual pode
ser feita com acesso normal ao Windows para acelerar os ajustes fisicos da
Torre. Isso nao constitui homologacao do modo de entrega e nao autoriza usar
essa configuracao em uma otica final.

O primeiro empacotamento foi feito quando a Torre ainda estava dentro do MB
Optical. Ele gerou um instalador de prova e validou a abertura do Electron no
Windows de desenvolvimento. Esse instalador antigo nao deve ser usado porque:

- possui nome e identidade antigos;
- carrega o renderer do MB Optical;
- foi criado antes da separacao dos repositorios;
- nao representa a arquitetura final Neosmart -> APIs MB Optical.

O deploy separado da Neosmart ja esta funcional. O instalador antigo continua
fora do piloto; o proximo instalador deve ser gerado a partir do repositorio
Neosmart e validado contra as duas origens publicadas.

A publicacao de novas telas no projeto Vercel `neosmart` nao atualiza um
instalador que ainda aponta para `gestao-otica-pro.vercel.app`. Depois de cada
alteracao de UI, confirmar o deploy `Ready` de `neosmart` e gerar o instalador
a partir do repositorio `G:\projetos\torre-neosmart`, com a origem
`https://neosmart-eta.vercel.app/`.

### Condicoes para retomar

O Passo 10 so pode recomecar quando:

- as actions operacionais necessarias estiverem migradas para HTTP;
- a auditoria de credenciais da Neosmart estiver limpa;
- o projeto web Neosmart existir na Vercel; **atendido**;
- a URL da interface Neosmart estiver separada da URL do MB Optical;
- o fluxo Neosmart -> MB Optical estiver validado online;
- a queda e o retorno da internet estiverem validados;
- nao houver evento pendente perdido ou duplicacao na outbox.

### Execucao do Passo 10

1. Configurar variaveis de ambiente sem copiar segredos administrativos.
2. Publicar o renderer e validar suas rotas. **Concluido em 22/07/2026.**
4. Validar ativacao, pareamento e sessao curta contra o MB Optical em producao.
5. Testar cliente, avaliacao, receita, medidas, heatmap e encerramento.
6. Simular queda de internet durante cliente e medidas.
7. Confirmar persistencia no SQLite e sincronizacao posterior da outbox.
8. Gerar o instalador Windows com identidade Neosmart.
9. Instalar no mini PC da Loja 7.
10. Homologar camera, touch, segunda tela, kiosk/appliance, Wi-Fi interno,
    manutencao protegida e inicializacao automatica.
11. Reiniciar Windows e confirmar identidade, cache e dados locais preservados.
12. Validar desinstalacao/reinstalacao sem perda acidental de `userData`.
13. Registrar resultados e bloqueios do piloto.

Assinatura de codigo e tratamento do SmartScreen sao obrigatorios antes da
distribuicao comercial, mas podem ser posteriores ao piloto controlado.

## Plano de retomada da proxima sessao

1. Reexecutar smoke test integrado nas duas URLs publicadas.
2. No Neosmart, confirmar o HEAD e executar:

   ```bash
   npm install
   npm run typecheck
   npm test
   npm run build
   ```

3. Validar online/offline, outbox, camera, touch e segunda tela no Electron.
4. Auditar os imports residuais do Supabase por dominio; nao remover codigo
   sem confirmar consumidor ativo.
5. Gerar o instalador Neosmart e homologar o mini PC da Loja 7.
6. Decidir a reconciliacao das sessoes duplicadas antigas.

Nao e necessario recriar todos os testes. Os testes automatizados existentes
devem ser reexecutados como regressao. Os testes integrados e de hardware devem
ser repetidos porque mudaram o repositorio, o executavel, a origem do renderer
e a fronteira de comunicacao com o MB Optical.

## Atualizacao do prototipo e da continuidade - 23/07/2026

### Tela do cliente e operacao no Electron

- A segunda tela passou a ser persistente. Sem uma experiencia ativa, ela
  apresenta `public/abertura.mp4` em loop; ao sair de qualquer experiencia,
  volta automaticamente para essa abertura.
- Botoes de camera agora tambem ativam a experiencia correspondente na tela do
  cliente. Demonstracoes sem camera alternam entre apresentar e fechar a
  apresentacao, sem exigir um botao separado para abrir outra janela.
- A tela do cliente deixou de exibir mensagens operacionais como "Aguardando
  comando" e "Tela cheia". Falhas devem permanecer nos diagnosticos/logs do
  operador, sem poluir a apresentacao comercial.
- O repouso preto por inatividade usa 30 minutos como padrao e e interrompido
  por atividade, desbloqueio, retorno da suspensao ou reconexao do monitor. A
  chamada correta no processo principal e
  `powerMonitor.getSystemIdleTime()`.
- Fullscreen/kiosk foi limitado ao aplicativo empacotado. No desenvolvimento,
  moldura e barra do Windows podem permanecer visiveis para facilitar debug.
- O Visagismo teve o acionamento da camera corrigido, inclusive a publicacao
  do video na tela do cliente. Em retrato, o video usa preenchimento com
  recorte e coordenadas compensadas; o carrossel de armacoes fica proximo ao
  topo para nao competir com o rosto.

### Espessura das lentes

- A apresentacao inicial e ampliada; "Tamanho real" permanece como opcao
  calibrada.
- Em retrato, as vistas de borda fisica e perfil calculado ocupam a parte
  superior e recebem prioridade demonstrativa. A lente frontal permanece
  abaixo, com funcao explicativa.
- Vista fisica 3D, perfil calculado e lente frontal usam uma unica escala de
  pixels por milimetro. Foi removida a ampliacao duplicada do SVG frontal e a
  reducao artificial da camera 3D.
- Os canvases passaram a 640 px, com margem para a diagonal da lente. A
  geometria e recentralizada depois de cada giro, inclusive quando DNP ou
  altura do centro optico estao deslocadas, sem mudar a escala.
- O indice inicial e `1.56`. As opcoes atuais sao `1.49`, `1.56`, `1.59`,
  `1.67` e `1.74`; `1.60` foi removido.

### Continuar atendimento e dropdown de cliente

O rastreio do SQLite confirmou uma sessao indevida criada em 23/07/2026 as
10h45, na experiencia de espessura. O problema tinha duas camadas:

1. o renderer podia chegar ao helper de criacao sem um UUID efetivo, mesmo
   partindo visualmente do fluxo "Continuar atendimento";
2. ao materializar localmente uma sessao existente apenas no servidor, o
   Electron usava o horario atual como `started_at`, fazendo a retomada parecer
   um novo atendimento e sincronizando esse estado pela outbox.

A correcao separa explicitamente os modos `new` e `resume`:

- `resume` exige UUID e nunca gera um UUID novo;
- uma sessao remota importada para o SQLite preserva UUID, `started_at` e
  `customer_id`;
- `new` rejeita a reutilizacao de UUID;
- a selecao do dropdown abre imediatamente as experiencias, sem botao
  intermediario "Continuar";
- a mesclagem local/remota preserva o objeto `customer` do servidor;
- clientes provisorios offline sao lidos do payload local protegido e tambem
  podem aparecer como `data e hora - nome` no dropdown.

Foram adicionadas regressoes para impedir criacao sem UUID, preservar os dados
da sessao remota e listar o nome do cliente local. Na Neosmart, 31 testes,
typecheck, lint direcionado e `git diff --check` passaram. Nao houve deploy.
A sessao indevida das 10h45 continua preservada; qualquer exclusao ou
reconciliacao exige decisao explicita.

## Documentos complementares

- `..\torre-neosmart\CURRENT_STATUS.md`: checklist detalhado da Neosmart;
- `TOWER_AND_TABLET_VISION_CONTEXT.md`: visao complementar do produto;
- `HEATMAP_HEAD_SANDBOX_STATUS.md`: premissas do campo visual;
- `LENS_CATALOG_ARCHITECTURE.md`: catalogo e geometrias.

Em caso de divergencia sobre o estado atual ou a ordem de execucao, este
documento prevalece.
