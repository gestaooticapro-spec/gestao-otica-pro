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
- Deploy de producao restaurado e com status `Ready`.
- Typecheck aprovado.
- 25 testes automatizados aprovados.
- Build de producao aprovado.
- APIs HTTP v1 de clientes e sessoes publicadas.

### Neosmart

- Repositorio independente criado.
- Next 14.2.35, React 18.2.0 e Electron 43.1.1.
- Identidade `br.com.mboptical.neosmart`.
- Executavel `neosmart`.
- Instalador planejado como `Neosmart-Setup-*`.
- Origens do renderer e das APIs separadas.
- Ciclo de clientes e sessoes migrado para HTTP v1.
- Typecheck aprovado.
- 19 testes automatizados aprovados.
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

A migration `20260722100000_tower_web_measurements.sql` ainda nao foi aplicada
ao Supabase porque a CLI vinculada respondeu `403` por falta de privilegio da
conta. O lote nao deve ser publicado fora de ordem: primeiro aplicar a
migration e publicar o MB Optical; depois publicar e validar a Neosmart.

O lint da Neosmart terminou sem erros e com dois avisos preexistentes. O lint
do MB Optical nao iniciou a analise por uma falha circular da configuracao do
ESLint 9; typecheck, testes e build continuaram aprovados.

Ainda existem actions copiadas que podem acessar o Supabase diretamente. Antes
do empacotamento final, executar um inventario e migrar pelo menos:

1. medidas;
2. heatmap/campo visual;
3. ativos e operacoes do equipamento;
4. leituras restantes de catalogo e recomendacao;
5. qualquer outra action que use `createAdminClient`, service role ou acesso
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

**Interrompido antes da publicacao e instalacao do piloto.**

O primeiro empacotamento foi feito quando a Torre ainda estava dentro do MB
Optical. Ele gerou um instalador de prova e validou a abertura do Electron no
Windows de desenvolvimento. Esse instalador antigo nao deve ser usado porque:

- possui nome e identidade antigos;
- carrega o renderer do MB Optical;
- foi criado antes da separacao dos repositorios;
- nao representa a arquitetura final Neosmart -> APIs MB Optical.

O trabalho foi interrompido quando o deploy do MB Optical travou na Vercel. O
MB Optical ja foi restaurado, mas o Passo 10 nao deve continuar do ponto do
instalador antigo. Ele deve ser retomado com a Neosmart separada.

### Condicoes para retomar

O Passo 10 so pode recomecar quando:

- as actions operacionais necessarias estiverem migradas para HTTP;
- a auditoria de credenciais da Neosmart estiver limpa;
- o projeto web Neosmart existir na Vercel;
- a URL da interface Neosmart estiver separada da URL do MB Optical;
- o fluxo Neosmart -> MB Optical estiver validado online;
- a queda e o retorno da internet estiverem validados;
- nao houver evento pendente perdido ou duplicacao na outbox.

### Execucao do Passo 10

1. Criar o projeto Vercel exclusivo da Neosmart.
2. Configurar variaveis de ambiente sem copiar segredos administrativos.
3. Publicar o renderer e validar suas rotas.
4. Validar ativacao, pareamento e sessao curta contra o MB Optical em producao.
5. Testar cliente, avaliacao, receita, medidas, heatmap e encerramento.
6. Simular queda de internet durante cliente e medidas.
7. Confirmar persistencia no SQLite e sincronizacao posterior da outbox.
8. Gerar o instalador Windows com identidade Neosmart.
9. Instalar no mini PC da Loja 7.
10. Homologar camera, touch, segunda tela, kiosk e inicializacao automatica.
11. Reiniciar Windows e confirmar identidade, cache e dados locais preservados.
12. Validar desinstalacao/reinstalacao sem perda acidental de `userData`.
13. Registrar resultados e bloqueios do piloto.

Assinatura de codigo e tratamento do SmartScreen sao obrigatorios antes da
distribuicao comercial, mas podem ser posteriores ao piloto controlado.

## Plano de retomada da proxima sessao

1. Fazer smoke test curto do MB Optical restaurado: login, loja, atendimento,
   clientes e uma area critica.
2. No Neosmart, confirmar o HEAD e executar:

   ```bash
   npm install
   npm run typecheck
   npm test
   npm run build
   ```

3. Inventariar os imports e acessos restantes ao Supabase.
4. Migrar medidas, heatmap e ativos, um dominio por vez.
5. Fazer a auditoria final de seguranca.
6. Retomar o Passo 10 seguindo a lista acima.

Nao e necessario recriar todos os testes. Os testes automatizados existentes
devem ser reexecutados como regressao. Os testes integrados e de hardware devem
ser repetidos porque mudaram o repositorio, o executavel, a origem do renderer
e a fronteira de comunicacao com o MB Optical.

## Documentos complementares

- `..\torre-neosmart\CURRENT_STATUS.md`: checklist detalhado da Neosmart;
- `TOWER_AND_TABLET_VISION_CONTEXT.md`: visao complementar do produto;
- `HEATMAP_HEAD_SANDBOX_STATUS.md`: premissas do campo visual;
- `LENS_CATALOG_ARCHITECTURE.md`: catalogo e geometrias.

Em caso de divergencia sobre o estado atual ou a ordem de execucao, este
documento prevalece.
