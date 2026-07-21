# Torre - Decisoes de Desenvolvimento e Contexto Obrigatorio

> **Documento canonico para implementacao da Torre.**
>
> Este arquivo e a fonte principal de decisoes, contexto e direcionamento para
> qualquer trabalho futuro da Torre. `TOWER_AND_TABLET_VISION_CONTEXT.md` e um
> documento complementar de visao; em caso de divergencia, este arquivo deve
> prevalecer.

## Como usar este documento

Antes de iniciar ou retomar qualquer trabalho relacionado a torre, visagismo,
heatmap, medidas ou recomendacao visual, leia nesta ordem:

1. `TOWER_DEVELOPMENT_DECISIONS.md` (este arquivo, canonico)
2. `TOWER_AND_TABLET_VISION_CONTEXT.md` (contexto complementar)
3. `HEATMAP_HEAD_SANDBOX_STATUS.md`
4. `LENS_CATALOG_ARCHITECTURE.md` quando o trabalho envolver catalogo,
   geometrias ou recomendacao de lentes.

Este documento registra a direcao do produto. Ele nao substitui a verificacao
do codigo atual antes de alterar comportamento.

---

## Visao de produto

A torre sera um produto focado em quatro experiencias:

1. Visagismo.
2. Heatmap com indicacao de multifocais.
3. Medidas de lentes.
4. Mapa educativo de foco e desfoco conforme o movimento dos olhos.

O sistema de Gestao Otica continua sendo o backoffice completo: clientes,
avaliacoes, catalogo, OS, estoque, financeiro e notas.

A torre nao deve ser apenas um dashboard com menus escondidos. Ela deve ter
experiencia propria de cliente, operador, camera, tela cheia e hardware.

O tablet e um apoio para lojas que ainda nao terao a Torre. Ele nao deve
definir a experiencia principal nem misturar suas limitacoes com o produto da
Torre.

As quatro frentes de hardware da Torre sao futuras. Antes da integracao com
Electron, a prioridade e organizar e validar as experiencias de operador e
cliente no navegador, mantendo os contratos de comunicacao substituiveis.

---

## Decisao de arquitetura atual

### Produto separado, plataforma compartilhada

A direcao escolhida e construir a torre como uma aplicacao propria que usa os
servicos e dados da mesma plataforma de Gestao Otica.

```text
Gestao Otica (backoffice)
  - clientes, avaliacoes, catalogo, geometrias e recomendacao

Torre (experiencia dedicada)
  - visagismo, heatmap, medidas e mapa educativo

Servicos compartilhados
  - identidade da loja, clientes, sessoes, catalogo, geometrias e resultados
```

No curto prazo, os dois produtos podem continuar no mesmo repositorio para
reaproveitar logica, tipos e contratos. A separacao deve ser de modulos e
responsabilidades, nao necessariamente de repositorio neste momento.

### Direcao para o mini PC

A torre deve rodar localmente no mini PC, com camera e telas conectadas a ele.
Electron e uma direcao provavel para empacotar a aplicacao desktop. A escolha
final da tecnologia desktop pode esperar, mas o modelo de dados e sincronizacao
ja tem uma direcao definida: a torre precisa operar localmente sem se tornar
uma base isolada da loja.

### Sem migracao ao contratar o sistema completo

Cada torre vendida ja nasce em uma conta da plataforma:

- a loja recebe um `tenant`/`store_id` imutavel no Supabase;
- recebe usuarios autenticados e permissoes do plano `torre`;
- o mini PC e pareado como dispositivo limitado daquela loja;
- a torre grava e sincroniza os dados relevantes com esse mesmo `store_id`.

Assim, quando a loja contratar o Gestao Otica completo, nao existe migracao de
clientes, sessoes ou historico. Mantem-se o mesmo tenant e a mesma base na
nuvem; apenas mudam o plano contratado, os modulos liberados e as permissoes
dos usuarios.

Nao tratar essa evolucao como troca de `store_id` ou "mudanca de role da
loja". A loja continua sendo a mesma. O que muda e a assinatura/entitlement e,
quando necessario, as roles dos usuarios.

### Supabase canonico, SQLite local para continuidade

O Supabase e a fonte de verdade compartilhada desde o primeiro dia. O SQLite
do mini PC nao e um clone do Supabase: ele e uma replica local limitada, cache
e fila de sincronizacao para a torre continuar funcionando quando a internet
falhar.

O banco local deve conter somente o necessario para operar a torre:

- configuracao e pareamento do dispositivo;
- clientes e avaliacoes usados pela torre;
- sessoes, resultados e amostras consolidadas;
- recorte/versionamento do catalogo, geometrias e regras necessarias;
- fila de eventos pendentes de sincronizacao (`outbox`).

A sincronizacao deve ser idempotente: cada entidade recebe UUID gerado antes
do envio, `store_id` imutavel, datas e versao. Sessoes concluidas devem ser
append-only; uma correcao cria nova versao/registro, nunca altera silenciosamente
o resultado historico. A regra de conflito deve ser explicita antes de existir
edicao concorrente entre torre e backoffice.

O funcionamento esperado e:

```text
Torre sem internet
-> atende com SQLite local
-> registra operacoes na outbox
-> reconecta
-> sincroniza com Supabase do mesmo store_id

Loja contrata Gestao Otica
-> libera modulos e usuarios no mesmo tenant
-> utiliza os clientes e historicos ja sincronizados
-> sem reinstalacao e sem migracao
```

Nao colocar chave administrativa, service role ou credencial ampla do Supabase
no mini PC. O dispositivo usa credencial limitada e pareada, armazenada de
forma segura no sistema operacional, com acesso apenas aos dados do seu
`store_id` e as operacoes estritamente necessarias.

### Configuracao inicial remota e manutencao continua da loja

A configuracao inicial de uma Torre standalone acontece remotamente antes do
equipamento chegar a loja. Um usuario autorizado cadastra a empresa, a loja,
as preferencias iniciais de catalogo, as ofertas, a estrategia comercial e os
modulos liberados em uma URL administrativa da Torre. Essa configuracao gera
uma ativacao por QR Code e tambem um codigo alternativo para uso no fallback.

Depois da ativacao, a empresa nao deve depender do tecnico de TI para alterar
suas decisoes comerciais. A Torre deve oferecer uma URL administrativa propria
daquela loja, acessivel por computador ou celular, para que um usuario
autorizado possa alterar continuamente:

- pesos e prioridades de tabelas do catalogo;
- tabelas que participam ou deixam de participar das ofertas;
- estrategia comercial de indicacao;
- modulos e botoes disponiveis na Torre;
- demais preferencias de apresentacao comercial.

O endereco pode ser curto e vinculado a loja, por exemplo
`torre.app/loja/AB7K2`, mas o link nao concede acesso por si so. A pessoa deve
autenticar-se com a conta autorizada da loja. Quando o Gestao Otica completo
for contratado, essa mesma configuracao deve continuar disponivel no sistema
completo, usando os mesmos dados, usuarios e permissoes, sem duplicar ou
migrar o cadastro.

As configuracoes locais do equipamento ficam separadas das configuracoes
comerciais. Na primeira tela da Torre, o operador usa a tela touch para:

- conectar a rede;
- ler o QR Code de ativacao;
- digitar o codigo alternativo se a leitura falhar.

Depois de ativada, a UI do funcionario oferece um botao discreto de
Configuracoes protegido por PIN local. Esse menu e reservado a manutencao do
equipamento, incluindo camera, telas, brilho, orientacao, diagnostico e
calibracao do monitor. Ele tambem deve mostrar o endereco curto e, quando
conveniente, um QR Code para abrir a configuracao remota em outro dispositivo.

A tela do cliente nao exibe configuracoes administrativas. O catalogo e a
estrategia comercial podem ser consultados e ajustados pela URL remota; a
Torre apenas baixa, aplica e sincroniza esses dados. A tela touch pode mostrar
o estado da sincronizacao, mas nao deve ser o local principal para editar
essas regras.

O fluxo de ativacao deve permanecer separado do fluxo de manutencao:

```text
Torre sem vinculo
-> conectar a internet
-> ler QR Code ou digitar codigo de ativacao
-> vincular dispositivo ao tenant/store_id
-> executar testes e calibracao locais
-> liberar a operacao normal

Torre ja vinculada
-> PIN local para manutencao do equipamento
-> URL autenticada para catalogo e estrategia comercial
```

O fallback de digitacao deve existir antes do vinculo com qualquer empresa.
Ele valida um codigo temporario no servidor e nao permite cadastrar livremente
uma empresa nem acessar dados de outra loja. Uma ativacao completamente offline
por pacote assinado fica fora do primeiro escopo e pode ser decidida depois.

---

## Implementacoes concluídas nesta etapa

Esta etapa preparou o ciclo completo de administracao remota da Torre antes da
existencia do aplicativo Electron.

### Administrador da plataforma

- Foi criado o papel `platform_admin`.
- Esse papel nao pertence a nenhum `tenant` nem a nenhuma loja.
- A atribuicao do papel e protegida no banco.
- O administrador acessa a area `/admin/torres`.

### Cadastro e manutencao da Torre

O backoffice permite:

- criar uma rede nova ou selecionar uma rede existente;
- cadastrar a loja que recebera a Torre;
- gerar ativacao por QR Code;
- gerar codigo alternativo para fallback;
- gerar PIN administrativo provisório da Torre;
- enviar o link de ativacao pelo WhatsApp sem fixar um numero de destino;
- listar lojas com Torre;
- editar dados cadastrais da loja;
- reemitir QR Code, codigo alternativo e PIN quando as credenciais forem
  perdidas ou o equipamento for substituido.

A reemissao nao cria outra rede nem outra loja. Ela revoga ativacoes pendentes
anteriores e cria uma nova ativacao para o mesmo `store_id`.

### Protecoes de cadastro

O banco impede redes duplicadas por nome normalizado e lojas duplicadas pelo
nome dentro da mesma rede. A interface tambem bloqueia cliques concorrentes e
apresenta uma mensagem orientando a abrir a loja existente.

Os codigos, tokens e PINs nunca sao armazenados em texto puro. O banco guarda
somente seus hashes; por isso, uma credencial perdida deve ser reemitida.

### Liberacao da Gestao Otica completa

A Torre pode funcionar inicialmente sem usuario humano. Quando a loja comprar
o programa completo, o administrador da plataforma informa o nome e o e-mail
do representante e usa a acao **Liberar Gestao Otica e enviar convite**.

Essa acao:

1. preserva o mesmo `tenant_id` e `store_id`;
2. registra a liberacao comercial da loja;
3. cria o convite no Supabase Auth;
4. cria o perfil humano com papel `admin` vinculado a rede e loja;
5. envia ao representante o link para definir a propria senha;
6. direciona o usuario, depois do login, ao dashboard completo da loja;
7. mantem a credencial da Torre e o PIN local independentes desse usuario.

No momento, a tabela de liberacao aceita um responsavel principal por loja.
Nao existem bloqueios de modulos: a Gestao Otica e liberada completa, conforme
a decisao atual do produto.

## Plano de execucao do aplicativo Electron da Torre

Este e o roteiro oficial para levar a aplicacao ao PC da Torre. Os sete passos
devem ser executados nesta ordem; cada passo precisa ser validado antes do
proximo. Nao vamos tentar transportar todo o dashboard de uma vez.

### Passo 1 - Criar o shell Electron

Criar o aplicativo desktop que abre em tela cheia no PC da Torre, inicia com o
sistema operacional quando necessario e possui uma janela controlada para a
experiencia da Torre. Nesta fase, a meta e somente provar que o Electron abre,
fecha e consegue carregar a aplicacao local/remota.

### Passo 2 - Montar a tela inicial da Torre

Criar a tela de equipamento ainda nao pareado, com instrucoes para conectar a
internet e ler o QR Code ou informar o codigo alternativo. Essa tela nao deve
exibir dados de outra loja nem permitir cadastro livre de empresa.

### Passo 3 - Implementar a leitura do QR Code e do codigo alternativo

O Electron deve ler o payload de ativacao e enviar a tentativa ao backend por
um contrato proprio de ativacao. O servidor valida o token ou o fallback,
confirma que a ativacao esta pendente e ainda dentro da validade, e vincula o
dispositivo ao `tenant_id` e `store_id` corretos.

### Passo 4 - Parear o dispositivo com a loja

Depois da validacao, o backend deve emitir uma credencial limitada e propria
daquele dispositivo. A credencial deve permitir somente as operacoes da Torre
daquela loja. Ela nao pode ser `service_role`, senha de usuario ou chave ampla
do Supabase.

O contrato adotado para este passo usa uma credencial opaca de dispositivo,
gerada com alta entropia e entregue uma unica vez. O banco guarda somente o
hash. A credencial nao acessa o Supabase diretamente: ela autentica o
dispositivo nos endpoints proprios da Torre, que resolvem no servidor o
`tenant_id` e o `store_id` permitidos.

O pareamento deve ser atomico: validar e bloquear a ativacao, bloquear a loja,
revogar o dispositivo ativo anterior quando houver substituicao, criar o novo
dispositivo e consumir a ativacao acontecem na mesma transacao. Se qualquer
parte falhar, nenhuma dessas alteracoes permanece. A decisao atual permite uma
Torre ativa por loja; multiplas Torres na mesma loja exigirao uma decisao de
produto e outra regra de identidade antes de serem implementadas.

Ao final do Passo 4, a credencial pode permanecer apenas na memoria do processo
para validar o contrato. Isso ainda nao e continuidade operacional: gravacao
persistente e protegida pelo Windows pertence obrigatoriamente ao Passo 5.

### Passo 5 - Armazenar a credencial localmente

O Electron deve salvar a credencial usando o armazenamento seguro do sistema
operacional, com SQLite local apenas para configuracao, cache, sessoes,
resultados e fila de sincronizacao. O banco local nao sera um clone completo
do Supabase.

Implementacao adotada: a credencial opaca e os identificadores imutaveis do
pareamento sao criptografados pelo `safeStorage` do Electron. No Windows, essa
protecao usa os recursos da conta do sistema operacional. O arquivo local
contem somente um envelope versionado e o conteudo cifrado; a credencial em
texto existe apenas na memoria do processo durante a execucao. Ao reiniciar, o
Electron descriptografa a sessao, valida seu formato e consulta o endpoint de
status quando houver internet. Falha de leitura ou descriptografia nunca deve
liberar dados de outra loja nem retornar silenciosamente ao cadastro livre.

SQLite permanece reservado para os proximos recortes de configuracao, cache,
sessoes operacionais, resultados e `outbox`. Ele nao recebe a credencial de
dispositivo em texto puro.

### Passo 6 - Criar a tela de PIN e manutencao

O primeiro acesso ao menu administrativo local usa o PIN provisório criado no
backoffice. Depois de validado, o operador deve trocar esse PIN. O menu fica
reservado para rede, camera, telas, brilho, orientacao, diagnostico,
calibracao e estado da sincronizacao.

Implementacao de software preparada neste passo:

- a rota local `PAIRED_SETUP` exige uma identidade de dispositivo restaurada
  pelo Electron antes de exibir manutencao;
- o PIN e validado apenas no backend, com comparacao `scrypt`, cinco tentativas
  antes de bloqueio por quinze minutos e troca obrigatoria do PIN provisorio;
- camera e captura usam permissao restrita a janela principal e exigem uma
  confirmacao visual do enquadramento;
- o Electron enumera monitores, resolucao, escala, rotacao e orientacao;
- a janela de teste do cliente abre somente na segunda tela, sem preload,
  Node.js ou acesso ao menu administrativo;
- touch, brilho e calibracao permanecem validacoes do equipamento fisico.

#### Testes reais pendentes em 18 de julho de 2026

O desenvolvimento deste passo foi feito remotamente, sem acesso a camera,
tela touch, mini PC ou monitor retrato da Torre. Portanto, os itens abaixo nao
estao homologados e nao podem ser considerados aprovados apenas porque o build
passou:

- consumir uma ativacao real e confirmar que ela nao pode ser reutilizada;
- fechar e reabrir o Electron e confirmar a restauracao da credencial pelo
  Windows;
- validar o PIN provisorio real, a troca obrigatoria, tentativas incorretas e o
  bloqueio temporario;
- abrir a camera real, conferir driver, permissao, resolucao, foco e captura;
- validar toque, alvos de toque e calibracao na tela principal;
- conectar a segunda tela, defini-la em retrato e confirmar que a janela do
  cliente abre no monitor correto, sem menus administrativos;
- conferir escala do Windows, brilho, cores, cortes, reinicializacao, kiosk,
  Wi-Fi, Ethernet e queda/retorno da internet.

Enquanto esses testes estiverem pendentes, a Torre permanece em
`PAIRED_SETUP`. A mudanca para `READY` depende de homologacao presencial e nao
sera feita automaticamente pelo software de diagnostico.

#### Identidade fisica permanente da Torre

Foi decidido que cada Torre devera possuir uma identidade fisica permanente,
independente da loja em que estiver instalada. Essa identidade ajudara em
garantia, manutencao, recolhimento, substituicao, historico tecnico e controle
do ciclo de vida do equipamento.

Essa funcionalidade foi incorporada antes do Passo 7. O campo
`tower_devices.id` continua identificando apenas o pareamento atual e nao deve
ser usado como identificador definitivo do equipamento fisico.

A entidade `tower_assets` representa o ativo permanente. Seu codigo publico
segue o formato `MBT-AAAA-NNNNNN`, por exemplo `MBT-2026-000001`.
`tower_devices` continua representando a instalacao, credencial e loja atual.
Assim, a mesma Torre pode ser retirada para manutencao e pareada novamente sem
perder sua identidade, enquanto uma substituta recebe outro codigo fisico.

O codigo impresso e deliberadamente publico e nao autentica o equipamento. A
autenticacao usa uma credencial aleatoria criada durante a preparacao do
Electron, armazenada somente como hash no servidor e protegida localmente pelo
`safeStorage` do Windows. Copiar a etiqueta nao permite clonar uma Torre.

Essa identidade nao implica geolocalizacao ou rastreamento. A decisao de
descartar o rastreamento de localizacao permanece valida.

#### Fluxo operacional no chao de fabrica

1. O administrador abre `/admin/torres/equipamentos` e gera um lote com a
   quantidade desejada. O servidor reserva uma faixa sequencial sem permitir
   codigos repetidos.
2. A pagina do lote monta etiquetas A4 com codigo legivel e QR publico. Ela
   pode ser impressa diretamente ou salva em PDF para envio a uma grafica. O
   QR permanente contem apenas a identificacao publica.
3. A etiqueta e colada na Torre correspondente. Nesse momento o ativo esta em
   `generated` ou `printed`, mas o Electron ainda nao possui a identidade.
4. Depois de instalar o aplicativo, o operador seleciona essa Torre na UI
   administrativa e usa `Preparar Electron`. A plataforma gera um QR e um
   codigo alternativo temporarios, validos por 24 horas.
5. Na primeira abertura, o Electron permanece em `FACTORY_SETUP`. O operador
   le o QR temporario ou informa `tower_id` e codigo alternativo. O backend
   confere se ambos pertencem ao mesmo ativo e consome a autorizacao uma unica
   vez.
6. O Electron recebe uma credencial fisica opaca, persiste-a com protecao do
   Windows e passa a mostrar o codigo publico da propria Torre. O ativo muda
   para `prepared` e pode ser marcado como `in_stock`.
7. Para enviar a Torre a uma loja, o administrador escolhe Torre X e loja Y na
   mesma UI. A plataforma gera uma ativacao direcionada, o codigo alternativo
   e o PIN provisorio de manutencao. Se ela estava associada a outra loja, a UI
   exige confirmacao e o vinculo anterior e revogado imediatamente, preservando
   apenas a identidade fisica.
8. Na loja, o Electron ja identificado entra em `READY_FOR_STORE`. O usuario
   le o QR da loja ou informa o codigo alternativo. O pareamento so e aceito se
   a identidade fisica for valida e, quando a ativacao for direcionada, se ela
   pertencer exatamente aquela Torre.
9. O pareamento cria um novo `tower_devices`, vincula ativo, tenant e loja e
   muda o ativo para `assigned`. Reinstalacoes geram novo pareamento sem trocar
   o codigo fisico.
10. Ao recolher o equipamento, o administrador marca `maintenance`; a
    credencial de loja ativa e revogada, mas a identidade fisica permanece. Em
    `retired`, tambem se revoga a identidade fisica e o ativo nao pode voltar a
    operar sem uma decisao administrativa futura explicita.

Estados do fluxo:

`generated -> printed -> FACTORY_SETUP -> prepared -> in_stock -> READY_FOR_STORE -> assigned -> maintenance`

O estado `retired` e terminal. O status do ativo e o estado de tela do Electron
sao conceitos relacionados, mas diferentes; os nomes em maiusculas acima sao
estados da aplicacao local.

#### Superficies entregues e validacao ainda pendente

- `/admin/torres/equipamentos`: lotes, status, preparacao do Electron,
  manutencao, aposentadoria e associacao Torre/loja;
- `/admin/torres/equipamentos/lotes/[batchId]/etiquetas`: impressao/PDF;
- `/torre/inicial`: registro fisico antes da ativacao da loja;
- APIs publicas limitadas para registro fisico, consulta da identidade e
  pareamento; todas recebem somente credenciais estreitas e nunca
  `service_role` no Electron;
- migrations ate `20260718102000_tower_physical_assets.sql` aplicadas no Supabase;
- migracao corretiva `20260718103000_harden_tower_asset_operations.sql`
  aplicada no Supabase em 18 de julho de 2026.

O fluxo completo ainda precisa ser testado em uma instalacao Windows real:
gerar uma unidade de teste,
imprimir sua etiqueta, registrar o Electron, reiniciar o computador, associar
a uma loja, recolher para manutencao e parear novamente. Ate essa homologacao,
o recurso nao deve ser tratado como pronto para producao.

#### Auditoria de seguranca concluida antes do Passo 7

Em 18 de julho de 2026, a auditoria dos Passos 1 a 6 e da identidade fisica
resultou nas seguintes correcoes:

- `assetCredential` e `deviceCredential` nao atravessam mais o preload nem sao
  entregues ao renderer. Registro fisico, pareamento, status e PIN passam por
  operacoes IPC estreitas; somente o processo principal descriptografa e usa
  as credenciais;
- todo IPC valida a janela principal, a origem e a rota exata do remetente;
- navegacao do shell fica restrita a `/torre/*`, e as rotas da Torre recebem
  Content Security Policy e Permissions Policy proprias;
- os envelopes protegidos pelo `safeStorage` sao gravados por arquivo
  temporario e troca atomica, reduzindo risco de corrupcao por desligamento;
- o rate limit saiu da memoria da instancia Next e passou a ser compartilhado
  no PostgreSQL, separado por IP e endpoint;
- impressao de lote passa a atualizar lote e ativos na mesma transacao;
- pareamento e reassociacao usam advisory locks na mesma ordem, identidade
  fisica e depois loja, para evitar ciclos de bloqueio concorrentes;
- apagar uma loja com Torre ainda associada passa a ser impedido por
  `ON DELETE RESTRICT`, em vez de produzir estado inconsistente;
- foram criados testes automatizados de contratos, PIN, fronteira do preload,
  IPC, CSP e invariantes da migracao;
- `fast-xml-parser`, `jsPDF`, `jspdf-autotable` e Next.js foram atualizados. O
  `npm audit --omit=dev` nao apresenta mais alertas criticos ou altos; restam
  apenas alertas moderados/baixos sem correcao disponivel na arvore atual;
- a migracao para Next.js 15.5.20 exigiu e recebeu a adaptacao mecanica das
  props dinamicas de paginas e rotas. `typecheck`, testes da Torre, lint do
  recorte da Torre e build de producao devem permanecer como gates.

Essas correcoes fecham os bloqueios de software encontrados pela auditoria,
mas nao promovem a Torre para `READY`. A migracao `20260718103000` foi aplicada
em 18 de julho de 2026; todos os testes presenciais listados acima continuam
obrigatorios.

### Passo 7 - Levar as experiencias da Torre para o Electron

Somente depois do pareamento, armazenamento seguro e manutencao estarem
validados, transportar para o Electron as experiencias de visagismo, heatmap,
medidas e mapa educativo. Cada experiencia deve continuar usando sessoes,
resultados e sincronizacao ligados ao mesmo `store_id`.

#### Recorte de software implementado em 18 de julho de 2026

O Electron agora consegue entrar nas rotas operacionais usando a propria
credencial do dispositivo, sem login humano e sem entregar essa credencial ao
renderer. O processo principal troca a credencial por uma sessao web assinada,
`HttpOnly`, com validade de quinze minutos e renovacao automatica. Cada acao de
sessao, heatmap ou medidas volta a conferir no servidor se o dispositivo ainda
esta ativo e se o `store_id`, `tenant_id`, ativo fisico e pareamento coincidem.
Antes da publicacao, o ambiente deve receber um
`TOWER_DEVICE_WEB_SESSION_SECRET` aleatorio e exclusivo. Durante o
desenvolvimento, o servidor aceita derivar a assinatura da chave de servico ja
existente, sem nunca envia-la ao Electron.

Foram liberadas para validacao de software em `PAIRED_SETUP`:

- menu isolado da Torre ligado ao `store_id` pareado;
- Visagismo, Campo Visual/heatmap e Medidas com suas sessoes e resultados;
- conteudos educativos ja existentes no menu de informacoes;
- abertura coordenada da tela do cliente pelo Electron;
- janela vertical simulada no monitor principal quando nao existe uma segunda
  tela, exclusivamente para desenvolvimento remoto;
- uso automatico do segundo monitor quando ele estiver conectado.

A URL da tela do cliente e validada pelo processo principal: deve pertencer a
mesma origem, a mesma loja pareada, estar dentro de `/torre/*` e conter
`client=1`. A janela do cliente continua sem preload, Node.js ou acesso ao menu
administrativo. A permissao de camera e aceita somente na janela principal ou
na janela cliente reconhecida pelo Electron.

Esse recorte nao altera o estado para `READY`. A janela simulada prova apenas
navegacao, sessao, comunicacao e composicao das telas. Camera real, touch,
orientacao, escala, desempenho, enquadramento e comportamento no segundo
monitor permanecem pendentes de homologacao presencial.

Durante todos os sete passos, o Supabase permanece a fonte canonica. O SQLite
local e uma camada de continuidade e sincronizacao, e nao uma nova identidade
para a loja.

### Passo 8 - Configuracao remota por loja

O primeiro contrato versionado de configuracao remota foi implementado em 18
de julho de 2026. A fonte canonica e
`stores.settings.tower_remote_config`, sempre vinculada ao mesmo `store_id` do
dispositivo. Nao foi criada uma tabela paralela de produtos, ofertas ou lojas.

A configuracao comercial nao exige conta, e-mail ou senha do MBoptical. O
fluxo aprovado separa os dois papeis:

1. na Torre, o responsavel abre `Configuracoes` e confirma o PIN administrativo
   local;
2. o Electron guarda em memoria uma autorizacao de manutencao valida por cinco
   minutos, sem expo-la ao renderer;
3. dentro da manutencao, o responsavel gera um QR/link persistente e um PIN
   comercial separado, exibido somente nessa geracao;
4. no celular ou computador, o QR abre `/torre/remota/[publicCode]`, onde apenas
   o PIN comercial e solicitado;
5. o PIN correto emite uma sessao HttpOnly de oito horas, limitada a uma unica
   loja; salvar publica a configuracao canonica dessa loja.

O link permanece valido e pode ser favoritado. Nao e preciso buscar um novo QR
a cada alteracao. `Regenerar acesso` troca simultaneamente o link e o PIN,
invalida o endereco anterior e deve ser usado somente em caso de perda,
revogacao ou troca de responsavel. O QR identifica o acesso, mas nunca contem o
PIN.

O contrato de versao 1 permite publicar:

- experiencias principais e conteudos do menu `Informacoes uteis`;
- visibilidade dos botoes de continuar atendimento e configuracoes locais;
- estrategia consultiva ou campanha, titulo, texto de apoio, chamada principal
  e oferta em destaque;
- permissao para uso do catalogo global ja liberado para a loja.

A Torre le essa configuracao somente depois de validar sua sessao curta e o
`store_id` pareado. Os menus e textos sao aplicados no Electron, e o botao
`Atualizar` busca a versao publicada sem reinstalar, reativar ou parear o
equipamento novamente. Se a consulta falhar, a interface informa a
indisponibilidade e usa a configuracao inicial segura, sem trocar a identidade
local.

A migracao `20260718104000_tower_remote_configuration.sql` cria a tabela
protegida `tower_remote_config_access` e as funcoes atomicas de rotacao,
tentativas de PIN e publicacao. Ela guarda somente o hash scrypt do PIN, aplica
bloqueio de quinze minutos depois de cinco erros, preserva os outros campos de
`stores.settings`, mantem compatibilidade com `tower_experiences` e restringe
tabelas e funcoes ao `service_role`. O rate limit compartilhado por origem
tambem se aplica antes da verificacao do PIN.

O login completo da Gestao Otica continua existindo apenas para lojas que
contratarem esse produto. Ele nao concede nem substitui o acesso comercial
remoto da Torre.

Esse passo nao promove o equipamento para `READY`. Touch, camera, escala,
desempenho, reinicializacao e comportamento final no hardware homologado
continuam dependendo dos testes presenciais ja descritos.

### Detalhamento operacional do roteiro

O roteiro acima sera executado com as seguintes validacoes praticas:

1. **Shell Electron:** criar o aplicativo desktop em uma pasta propria,
   carregar o Next.js local durante o desenvolvimento, testar abertura e
   fechamento e preparar tela cheia e modo kiosk. Nesta fase nao implementar
   pareamento, SQLite ou QR Code.
2. **Tela inicial `UNPAIRED`:** mostrar status da internet, `Conectar a
   internet`, `Ler QR Code`, `Nao consigo ler o QR Code` e o codigo alternativo.
   O botao de internet abre a configuracao nativa de redes do Windows; ao
   retornar, o Electron verifica novamente a conectividade. Ethernet deve ser
   detectada automaticamente.
3. **Ativacao:** ler o QR Code pela camera ou aceitar o codigo alternativo e
   enviar a tentativa ao backend. O servidor valida existencia, validade,
   pendencia e pertencimento ao `tenant_id` e `store_id` corretos. Nao permitir
   cadastro livre ou escolha de outra loja.
4. **Pareamento `PAIRING`:** associar o equipamento ao dispositivo, tenant e
   loja corretos e emitir uma credencial limitada. Nenhum dado da loja deve ser
   liberado antes da confirmacao. Nunca usar `service_role`, senha administrativa
   ou chave ampla do Supabase.
5. **Continuidade offline:** armazenar a credencial com protecao do Windows e
   usar SQLite somente para configuracao, cache, sessoes, resultados, recorte
   de catalogo/geometrias e `outbox`. Operacoes pendentes devem sincronizar de
   forma idempotente quando a internet voltar.
6. **`PAIRED_SETUP` e manutencao:** testar camera, captura, duas telas, tela
   principal, tela do cliente, orientacao, brilho quando possivel, rede,
   diagnostico, calibracao e sincronizacao. Criar ou trocar o PIN provisorio.
7. **`READY`:** liberar a operacao diaria. A tela do cliente fica restrita as
   experiencias visuais e o menu administrativo continua fora dela.
8. **Configuracao remota:** permitir que o responsavel autenticado altere
   catalogo, ofertas, estrategia comercial, modulos e botoes por computador ou
   celular. A Torre baixa e aplica os dados do mesmo `store_id`.
9. **Experiencias:** somente depois da base estar validada, levar ao Electron
   visagismo, campo visual/heatmap, medidas, mapa educativo e coordenacao das
   duas telas. Os calculos reutilizaveis nao dependem de rota Next ou browser.
10. **Empacotamento e homologacao:** gerar o instalador `.exe`, configurar
    inicializacao automatica e modo kiosk e testar no mini PC real com Wi-Fi,
    Ethernet, touch, segunda tela, camera, queda de internet, sincronizacao,
    desligamento e reinicializacao.

Os estados principais do Electron devem permanecer explicitos:

```text
UNPAIRED -> PAIRING -> PAIRED_SETUP -> READY -> MAINTENANCE
```

`UNPAIRED` exige internet e mostra ativacao; `PAIRING` valida o QR Code ou
codigo alternativo sem liberar dados; `PAIRED_SETUP` executa testes locais e
configura o PIN; `READY` libera a rotina diaria; `MAINTENANCE` permite somente
manutencao local protegida por PIN.

### Seguranca e alertas de dependencias

Os alertas do `npm audit` devem ser tratados como uma fila de risco, e nao
ignorados nem usados automaticamente como motivo para interromper todo o
desenvolvimento. A regra e separar o que ja possui mitigacao, o que exige
revisao antes da homologacao e o que bloqueia a publicacao.

Medidas ja aplicadas nesta etapa:

- o shell Electron usa `contextIsolation`, `sandbox`, `nodeIntegration: false`,
  bloqueio de navegacao fora da origem esperada, bloqueio de novas janelas,
  bloqueio de `webview` e negacao de permissoes nao necessarias;
- o Electron nao recebe `service_role`, senha administrativa nem chave ampla do
  Supabase;
- o Next.js foi atualizado para `15.5.20`; paginas e rotas dinamicas foram
  adaptadas ao contrato assincrono dessa versao;
- o processamento de XML fiscal limita o tamanho do arquivo, rejeita
  `DOCTYPE`, `ENTITY`, referencias de entidades nao permitidas e caracteres
  invalidos, preservando as entidades XML padrao;
- foram adicionados headers basicos e uma CSP especifica para `/torre/*`;
  a identificacao desnecessaria do framework permanece removida;
- o uso atual de jsPDF nao utiliza recursos conhecidos de incorporacao de
  JavaScript, formularios PDF ou HTML arbitrario. Isso reduz a superficie, mas
  nao substitui a atualizacao da dependencia.

Durante o desenvolvimento da Torre, os alertas restantes podem coexistir com
o trabalho do Electron desde que nao sejam introduzidas novas superficies de
risco. O build, o typecheck, o lint quando aplicavel e o teste do shell devem
continuar passando. Toda dependencia nova deve ser auditada antes de ser
adotada.

Antes da homologacao com o mini PC, e obrigatorio:

1. revisar os alertas moderados/baixos ainda presentes em dependencias
   transitivas e atualizar ou substituir quando houver correcao compativel;
2. confirmar que o parser XML continua rejeitando DTD, entidades externas,
   arquivos acima do limite e entradas malformadas sem quebrar XML fiscal
   valido;
3. revisar as permissoes e navegacoes do Electron depois que camera, QR Code,
   configuracoes do Windows e segunda tela forem adicionados;
4. executar novamente `npm audit --omit=dev --audit-level=high`, registrar os
   riscos sem correcao disponivel e testar os fluxos principais.

Antes da publicacao para clientes, nenhum alerta critico ou alto pode ser
aceito apenas porque o aplicativo funciona. Ele precisa estar corrigido,
substituido ou documentado com uma mitigacao demonstravel e aprovada. A
migracao para Next.js 15 ja foi executada como parte do endurecimento. Uma
nova atualizacao major exige novamente etapa propria e testes de regressao.

## Decisoes que precisam orientar o codigo agora

### 1. A avaliacao inicia a leitura visual

O heatmap nao pode continuar sendo uma sessao solta da loja. A avaliacao ja
conhece o cliente, a receita e a necessidade. Ela deve criar ou retomar uma
sessao de torre antes de abrir as telas de operador e cliente.

Pre-requisitos previstos para o primeiro uso do heatmap:

- cliente vinculado a avaliacao;
- receita de longe preenchida;
- adicao preenchida;
- necessidade definida como multifocal/progressiva;
- opcao de continuar sem mapa visual quando necessario.

Nesta fase, nao oferecer o mapa visual para visao simples ou ocupacional.

### 2. Cada leitura tem uma sessao persistida

Criar o conceito de `tower_session` ou `heatmap_session`, ligado a:

- `store_id`;
- `customer_id`;
- `evaluation_id`;
- status e datas;
- versao do algoritmo;
- cobertura e confiabilidade;
- amostras consolidadas ou resultado equivalente;
- resultado futuro do cruzamento com geometrias.

Um cliente pode ter varias sessoes. A avaliacao usa por padrao a ultima sessao
concluida, confiavel e vinculada a ela. Nunca sobrescrever uma leitura antiga.

Nao usar nome do cliente nem parametros como `client=1` como identidade de
produto. A aplicacao deve usar um identificador opaco de sessao.

### 3. BroadcastChannel e somente ferramenta de prototipo

O `BroadcastChannel` atual ajuda a sincronizar duas telas no mesmo navegador.
Ele nao deve virar a integracao definitiva entre avaliacao, torre e clientes.

O contrato futuro precisa ter operacoes explicitas:

```text
criar sessao
-> iniciar leitura
-> concluir ou cancelar
-> gravar resultado consolidado
-> recuperar resultado na avaliacao
-> cruzar candidatas com geometrias
```

### 4. O motor de recomendacao continua sendo a base

O heatmap nao e diagnostico e nao tem a ultima palavra. Ele reclassifica as
lentes multifocais ja elegiveis para o caso clinico e comercial.

Pipeline desejado:

```text
regras clinicas e semantica
-> 8 candidatas multifocais diversas
-> filtro de geometria valida
-> analise de compatibilidade com heatmap
-> 3 opcoes finais para vendedor e cliente
```

O numero inicial recomendado e 8 candidatas. O motor atual ja aceita `topN`
ate 10, embora a interface atual solicite 3.

O heatmap deve classificar cada candidata como:

- `ideal`;
- `compativel_com_sobra`;
- `compativel_com_adaptacao`;
- `nao_indicada`.

Exemplos de regra comercial:

- Campo maior que o exigido nao elimina uma lente premium.
- Com orcamento apertado, priorizar a opcao de menor custo que ainda seja
  compativel.
- Se nao houver opcao economica compativel, apresentar a mais proxima com
  aviso de adaptacao, e nao esconder esse fato.
- Sem preferencia financeira clara, entregar papeis distintos: equilibrio,
  maior conforto de campo e melhor valor.

### 5. Geometria e heatmap precisam usar a mesma coordenada

O cruzamento so sera confiavel se os campos de visao das geometrias e o
heatmap estiverem normalizados na mesma area de lente.

Para cada geometria multifocal, o sistema deve conseguir comparar pelo menos:

- zona de longe;
- zona intermediaria/corredor;
- zona de perto;
- margem lateral exigida pelo cliente.

Geometrias sem dados suficientes nao devem gerar conclusao forte de
compatibilidade.

### 6. O calculo deve ser independente da interface

Separar conceitualmente tres camadas:

```text
Calculo puro
  - projecao, heatmap, confiabilidade e compatibilidade com geometria

Experiencia da torre
  - camera, alvo, duas telas, animacoes e fluxo de operador/cliente

Plataforma
  - clientes, avaliacoes, catalogo, recomendacao, persistencia e permissoes
```

Nenhum calculo essencial do heatmap deve depender de rota Next, dashboard ou
detalhe de browser. Isso permite reaproveita-lo no Electron depois.

### 7. Privacidade, dispositivo e seguranca desde o inicio

Guardar apenas o necessario para a decisao comercial e auditoria:

- amostras consolidadas;
- resumo de cobertura e confiabilidade;
- versao do algoritmo;
- resultado da analise.

Nao guardar video ou landmarks faciais brutos como regra padrao.

A torre futura deve ser pareada como dispositivo da loja, com permissao
limitada. Ela nao equivale a um usuario administrador do sistema completo.
Nunca colocar credenciais administrativas, service role ou chaves de servidor
no mini PC.

O operador usa autenticacao comum da loja. A torre usa uma identidade propria
de dispositivo pareado. Esse limite protege os dados se o computador fisico
for perdido, trocado ou sofrer manutencao.

---

## Decisoes recentes da experiencia da Torre

Esta secao registra as decisoes tomadas durante o refinamento da interface da
Torre. Ela deve ser considerada parte do contrato de produto mesmo enquanto
algumas telas ainda forem mock ou prototipo.

### Fluxo de entrada e informacoes uteis

O fluxo da Torre deve permanecer simples e orientado pelo operador:

```text
Tela 1: Novo atendimento | Continuar atendimento
  -> Tela 2: Visagismo | Campo Visual | Medidas | Informacoes Uteis
```

`Informacoes Uteis` reune explicacoes didaticas que podem ser usadas fora de
qualquer roteiro fixo. O operador escolhe a explicacao conforme a duvida do
cliente. Os temas definidos ate aqui sao:

- Seu jeito de olhar;
- Tratamento AR;
- Opti Fog;
- Lentes polarizadas;
- Espessura das lentes.
- Comparativo de campos das lentes.

Quando uma experiencia ainda nao estiver pronta, a entrada e o menu devem
existir como placeholder funcional, sem fingir que o calculo ou hardware ja
esta implementado.

As telas abertas a partir de `Informacoes Uteis` devem voltar para esse menu,
e nao para a tela anterior generica do fluxo. O estado de navegacao precisa
preservar explicitamente esse contexto.

### Experiencias audiovisuais didaticas

As experiencias AR, polarizada e Opti Fog usam duas telas coordenadas: uma
tela do operador com controles e uma tela cheia para o cliente.

#### Tratamento AR

- `public/rua-ar.mp4` representa a versao sem AR, com reflexos;
- `public/rua.mp4` representa a versao com tratamento AR;
- o operador controla uma divisoria horizontal por um slider;
- a tela do cliente mostra mais ou menos de cada video conforme a divisoria;
- a visibilidade da comparacao tambem pode ser ligada ou desligada pelo
  operador.

#### Lentes polarizadas

- `public/rua-sem-polarizada.mp4` representa a versao sem polarizacao;
- `public/rua.mp4` representa a versao com polarizacao;
- a interacao usa a mesma logica de divisoria e sincronizacao dos videos;
- nao usar uma faixa decorativa fixa no centro para simular a divisao.

#### Opti Fog

- `public/cha.mp4` e a cena base;
- o efeito de embaçamento e uma camada CSS sobre o video, limitada pela
  divisoria;
- na abertura, a area ate a divisoria pode ser preparada de forma invisivel e
  o fog aparece depois com uma transicao gradual;
- depois da abertura, ao mover a divisoria, o preenchimento pode ter o atraso
  natural de renderizacao, desde que a experiencia continue controlavel pelo
  operador.

Essas experiencias sao demonstrativas. Nao devem ser descritas como medicao,
diagnostico ou prova fisica de desempenho optico.

### Comparativo de campos das lentes

O comparativo usa exclusivamente as geometrias salvas em
`global_lens_geometry`. A tela do operador oferece dois seletores
independentes: `Lente de cima` e `Lente de baixo`. Cada seletor deve mostrar
uma miniatura da mesma geometria que sera exibida ao cliente.

A tela do cliente apresenta as duas lentes em divisao vertical, uma acima da
outra, com as zonas de longe, corredor e perto desenhadas a partir dos `pins`
da geometria selecionada. A finalidade e comparar o desenho optico, nao
prometer desempenho clinico individual ou substituir a recomendacao baseada em
avaliacao.

O desenho deve reutilizar o mesmo renderizador do visualizador de lentes do
dashboard: foto dentro da lente, nitidez/desfoque conforme as zonas calibradas
e linhas de referencia. As cenas de demonstracao (Praia, Escritorio, Livro e
Cidade) sao escolhidas somente na tela do funcionario e a selecao e
sincronizada para o cliente. Nao colocar esses botoes na tela do cliente.

Enquanto o prototipo usar duas janelas, a selecao pode ser sincronizada por
`BroadcastChannel`; o carregamento dos dados, porem, deve continuar vindo das
tabelas globais e nao de uma lista mock local.

### Didatica de espessura das lentes

A tela de espessura e uma experiencia didatica, nao uma previsao definitiva da
lente do cliente. Todos os controles ficam na mesma tela do operador; nao ha
roteiro obrigatorio. O operador usa somente a explicacao relevante para a
conversa.

Os controles e relacoes que devem permanecer disponiveis sao:

1. tamanho da lente/armação;
2. indice de refracao;
3. eixo do cilindro;
4. tipo de montagem: aro fechado, fio de nylon ou parafusada;
5. DNP/centro optico;
6. altura do centro optico;
7. curva base 0, +2, +4 ou +6;
8. giro da lente em torno do centro optico;
9. templates de receitas didaticas.

O calculo usa a curva base selecionada como superficie frontal. Alterar o
indice ou a curva base deve modificar a espessura calculada sem deslocamentos
arbitrarios da lente. O eixo deve alterar a distribuicao aparente da espessura
nas bordas, sem sugerir que a lente inteira mudou de lugar.

O tamanho da armação deve ampliar a area cortada e revelar mais borda, sem
mudar o plano optico do corte visual. O mapa frontal deve preencher todo o
contorno da lente sem falhas de rasterizacao; a malha visual nao pode alterar
os extremos ou o calculo fisico usado para a didatica.

O calculo tambem considera um anel periferico amostrado ao redor de todo o
contorno. O perfil lateral da `Borda externa na direcao observada` mostra as
duas superficies calculadas da lente vistas de cima, percorrendo a largura A
de ponta a ponta, sem usar um corte interno que atravesse o centro. A face que
fecha a borda entre essas superficies deve ser reta; sulco de nylon, saliencia
de encaixe, bisel e polimento ficam fora desta didatica. Para lentes positivas,
a borda respeita a espessura minima segura da montagem e o volume cresce em
direcao ao centro; para lentes negativas, o comportamento principal se
concentra na periferia.

No modo de receita real, o modal permite escolher uma armacao salva no
Visagismo/Gabarito. O contorno interno e sua calibracao em milimetros alimentam
o calculo de A, B e da maior distancia entre o centro optico e a borda. Quando
o gabarito nao possui pontos internos utilizaveis, a experiencia usa o oval de
referencia. O giro 2D acontece ao redor do centro optico e atualiza, em tempo
real, o mapa frontal e o perfil da lateral externa observado naquele angulo.
A escolha da armacao e visual: um carrossel mostra somente o aro interno de
cada gabarito para o funcionario comparar o formato da lente. O nome permanece
como identificacao secundaria e nao como mecanismo principal de busca.

O componente atual deve continuar separado do `LensThicknessLab` original ate
que exista uma decisao explicita de unificar os dois. A comunicacao atual por
`BroadcastChannel` e valida para o prototipo de duas telas, mas segue a regra
geral deste documento: nao e o contrato definitivo da Torre nem do Electron.

#### Receita real dentro da didatica

A tela mantém cinco templates didáticos sempre disponíveis. O sexto cartão,
`Lente real do cliente`, é opcional: ao ser acionado, usa o cliente e a receita
já existentes na `tower_session`; se ainda não houver contexto, abre um modal
para identificar o cliente e informar a receita de longe OD/OE, incluindo a
adição. A adição não participa do cálculo de espessura, mas é persistida para
que a Indicação/Avaliação receba a receita completa.

No modo real, esfera, cilindro e eixo são dados da receita e ficam travados na
demonstração (é permitido alternar OD/OE). Índice, tipo/tamanho da armação e
posição do centro óptico continuam como controles didáticos. Ao clicar em
qualquer template, a tela sai do modo real e volta ao modo didático — a receita
permanece salva na sessão, mas não passa a ser obrigatória.

O contexto compartilhado da Torre inclui `customer_id` e um snapshot de receita
em `tower_sessions.prescription_snapshot`. Ele deve acompanhar a mesma URL de
sessão entre Espessura, Campo Visual e Indicação/Avaliação. Quando uma avaliação
óptica é vinculada, seu grau também atualiza esse snapshot. `BroadcastChannel`
continua apenas para sincronizar operador e tela do cliente, nunca para
persistir esse contexto.

#### Estado fechado desta etapa

A experiencia atual esta fechada como didatica de espessura com cinco receitas
de demonstracao e uma opcao separada de receita real. Nos templates didaticos,
a barra de tamanho parte do oval de referencia de 52 x 38 mm e o escala
proporcionalmente. No modo real, ela parte do aro interno e das medidas A x B
da armacao escolhida no carrossel do Visagismo/Gabarito e escala esse mesmo
contorno proporcionalmente.

O tipo de montagem nao altera o formato nem o tamanho gerado pela barra: ele
somente define a espessura minima usada no calculo (borda para aro/nylon e
centro para parafusada). A calibracao por regua de 50 mm permanece disponivel
para aproximar a escala fisica na tela do cliente.

Esta conclusao nao substitui nem antecipa o trabalho futuro de desenhar a
armacao com haste e inserir a lente calculada em uma vista fixa de perspectiva;
essa implementacao permanece pendente na secao seguinte.

### Modelo didatico de armação com haste - decisão para implementação futura

Para ensinar que uma armação de aro mais grosso pode esconder melhor uma lente
espessa, criar um modelo derivado de uma armação frontal já existente no
visagismo/gabarito. A armação original não deve ser alterada.

O novo modelo será salvo separadamente e usado somente na experiência de
espessura das lentes. Ele deve acrescentar:

- haste;
- ponto de dobradiça;
- profundidade/largura física do aro;
- posição de encaixe da lente;
- perfil lateral em perspectiva;
- relação entre o aro e a borda visível da lente.

O editor pode reutilizar a lógica visual do `FrameTemplateEditor`: desenho em
SVG, pontos editáveis, espelhamento quando aplicável, calibração em milímetros
e salvamento de um novo registro. Os caminhos frontais existentes (`outer`,
`inner`, ponte e construção) servem como base, mas não devem ser interpretados
como se já contivessem a haste ou a profundidade lateral.

Para não exigir o desenho completo de uma haste para cada formato, a primeira
versão pode usar perfis laterais reutilizáveis, por exemplo:

- acetato/aro grosso;
- aro médio;
- metal/aro fino;
- fio de nylon;
- parafusada.

O campo estético `visualWeight` do visagismo não substitui uma medida física do
aro. A experiência de espessura deve possuir um parâmetro próprio para a
largura/profundidade do aro, pois é esse parâmetro que determina quanto da
borda da lente fica escondido.

Na tela do cliente, a composição esperada e uma vista fixa em perspectiva
controlada: frente da armação, lente calculada inserida no aro e haste visível.
Nao oferecer giro livre ou controles de modelagem 3D. A finalidade e mostrar
claramente que a mesma espessura pode ficar mais ou menos aparente conforme a
armação, e não criar um visualizador técnico de produtos.

### Escala física aproximada nos monitores da Torre - trabalho futuro

Quando a Torre precisar mostrar uma lente em escala física aproximada, não
confiar na unidade `mm` do navegador. A conversão precisa usar um perfil do
monitor que determine pixels físicos por milímetro.

A estratégia escolhida para escala industrial é homologar no máximo três ou
quatro modelos de monitor para a Torre. Cada perfil deve registrar pelo menos:

- modelo do monitor;
- resolução nativa;
- escala do sistema operacional e orientação usadas na instalação;
- pixels por milímetro horizontal e vertical.

Na instalação, o técnico seleciona o modelo presente e a Torre aplica o perfil
automaticamente. Deve existir também uma conferência opcional de cerca de 30
segundos: uma régua de 50 mm aparece em tela cheia, é medida com régua física
e pode receber ajuste fino. Esse ajuste fica salvo por dispositivo/tela.

Oferecer dois modos visuais quando a funcionalidade existir:

- **Escala real (1:1):** 1 mm calculado da lente corresponde a 1 mm físico no
  monitor calibrado;
- **Escala didática:** a lente pode ser ampliada para facilitar a conversa,
  sempre indicando a ampliação aplicada.

Comunicar a saída como “representação em escala aproximada, calibrada para o
monitor da Torre”. Ela serve para comparar tamanho, espessura e quanto o aro
esconde a lente; o cálculo e a conferência final do laboratório continuam
sendo a referência de produção.

---

## Estado atual do heatmap

- O modelo atual usa alvo conhecido e movimento de cabeca para estimar a
  demanda visual restante dentro da lente.
- Olhos reais nao sao a base da decisao nesta fase; a premissa e que o cliente
  acompanha o alvo instruido pelo operador.
- Cada alvo gera uma amostra consolidada, usada tanto pelo heatmap quanto pela
  auditoria.
- O roteiro atual usa 19 alvos balanceados: 9 longe, 6 intermediario e 4 perto.
- Os cantos inferiores ficam livres para respeitar a logica de ampulheta das
  multifocais, mas a parte inferior central continua sendo sensivel para leitura.
- A tela do cliente pinta progressivamente o mapa e move as linhas de campo de
  visao conforme a cobertura acumulada.

Consultar `HEATMAP_HEAD_SANDBOX_STATUS.md` antes de mexer em calibracao,
projecao de cabeca, eixos ou significado clinico/comercial do resultado.

---

## Decisoes que podem esperar

Nao bloquear o desenvolvimento atual por estas decisoes:

- Electron versus outra tecnologia de desktop;
- modelo final de camera e PC;
- formato de instalacao e atualizacao da torre;
- desenho final das telas da torre;
- funcionamento sem o sistema completo de Gestao Otica.

Quando essas decisoes chegarem, elas devem respeitar o Supabase como fonte
canonico, o `store_id` imutavel, as sessoes persistidas, as camadas separadas e
os contratos definidos neste documento.

---

## Passo 9 - persistencia local e sincronizacao

O Passo 9 foi concluido em 20/07/2026 com a primeira fatia operacional. O
Electron cria automaticamente `tower-local.v1.sqlite3` dentro de
`app.getPath('userData')`; nao existe preparacao manual de banco por mini PC.
O schema e versionado no proprio arquivo e usa WAL, chaves estrangeiras e
transacoes `BEGIN IMMEDIATE`.

O contrato implementado e local-first:

1. uma sessao, cliente provisório ou medicao e gravado primeiro no SQLite;
2. na mesma transacao, a operacao cria um evento em `tower_outbox`;
3. o processo principal do Electron tenta sincronizar imediatamente e a cada
   30 segundos;
4. falhas usam retry com espera exponencial e nao apagam o dado local;
5. o servidor autentica a credencial protegida do dispositivo e deriva
   `tenant_id` e `store_id` do pareamento ativo;
6. `apply_tower_device_sync_event_v2` aplica o dado e registra o recibo do evento
   atomicamente, tornando reenvios idempotentes.

A credencial permanente do dispositivo continua no arquivo cifrado por
`safeStorage`. Ela nao entra no SQLite, no preload ou no renderer. Dados
pessoais do cliente e payloads da outbox tambem ficam protegidos pelo
`safeStorage` quando persistidos no equipamento. O preload expoe somente
operacoes delimitadas de sessao, cliente, medicao e estado da fila.

A integracao cobre criacao/retomada de `tower_sessions`, cliente provisório e
salvamento de `tower_measurement_results`. O cliente nasce com UUID local e,
quando sincronizado, `tower_device_customer_mappings` registra sua relacao com
o BIGINT canonico de `customers`. Eventos posteriores da sessao usam esse mapa,
sem aceitar `tenant_id`, `store_id` ou `customer_id` arbitrarios do renderer.
Nome e telefone iguais podem reutilizar o cliente da mesma loja; conflito de
nome ou telefone nao e unido silenciosamente.

As migracoes `20260720100000_tower_offline_sync.sql` e
`20260720101000_tower_offline_customer_fallback.sql` foram aplicadas no
Supabase. A primeira cria o contrato geral de sincronizacao; a segunda cria a
reconciliacao segura do cliente provisório com `customers.id`.

A tentativa de sincronizacao acontece logo apos a gravacao. Os 30 segundos sao
somente o ciclo de repeticao quando a tentativa imediata nao conclui. Enquanto
o cliente permanece provisório, a sessao pode continuar localmente, mas a
avaliacao e as recomendacoes que dependem de ID remoto aguardam a reconciliacao.

Os testes automatizados, o typecheck e o build de producao foram executados com
sucesso. O proximo passo e a validacao funcional no Electron, primeiro online e
depois simulando uma queda de internet durante o cadastro de cliente e o
salvamento de medidas.

Esta etapa tambem nao promete partida completamente offline depois de reiniciar
o Windows. O Electron atual ainda carrega a interface Next por URL. Empacotar a
interface para inicializacao sem rede, instalar no mini PC e homologar o ciclo
completo pertencem ao Passo 10. Com a interface ja carregada, sessoes e medidas
integradas podem ser preservadas localmente durante uma queda de comunicacao.

---

## Atualização - fluxo de avaliação, sincronização e configuração remota

O fluxo validado da Torre deve permanecer independente do login do sistema
completo. Depois do campo visual, o botão de continuar leva o funcionário para
`/torre/[storeId]/avaliacao` usando a sessão pareada do dispositivo. Essa rota
não pode exigir usuário Supabase humano nem redirecionar a tela touch para
`/login`; quando a autorização da Torre falhar, deve retornar ao menu da Torre.

A busca e o cadastro rápido de clientes pertencem ao fluxo operacional da
Torre. O cadastro pode nascer no SQLite como cliente provisório, entrar na
outbox e ser reconciliado com `customers.id` depois. A função SQL de
sincronização deve manter a associação por `device_id` e UUID local, tratar
reenvios como idempotentes e evitar ambiguidades entre nomes de variáveis
PL/pgSQL e colunas SQL. A correção está registrada em
`20260720110000_fix_tower_sync_customer_mapping_ambiguity.sql`.

O catálogo usado pela tela de avaliação deve ser carregado por uma leitura
operacional autorizada pela Torre, sem depender da autenticação comercial do
dashboard. A configuração remota precisa evoluir para ser a fonte de verdade
por loja para dois blocos relacionados:

1. importação, disponibilidade, versionamento e ativação do catálogo global;
2. configuração comercial das indicações de lentes, incluindo famílias,
   tratamentos, prioridades, regras de recomendação e apresentação ao cliente.

Esses blocos devem ser baixados pelo Electron somente após validar o
dispositivo e o `store_id` pareado, aplicados localmente com versão e estado
explícitos e sincronizados novamente quando houver conectividade. A Torre não
deve depender do dashboard completo para indicar lentes, embora o dashboard
possa continuar sendo a interface administrativa dessas configurações.

---

## Regra de retomada

## Status verificado em 21/07/2026

- A rota de avaliacao ja usa a autorizacao operacional do dispositivo pareado,
  sem exigir login humano, e a busca de clientes usa o contexto da loja.
- A configuracao remota ja possui consulta e ativacao de versoes do catalogo
  global por loja, alem da edicao das prioridades comerciais das sugestoes de
  lentes.
- A recomendacao de lentes aceita o acesso autorizado da Torre e a tela do
  cliente pode ser aberta com a recomendacao usando estado local e canal de
  mensagens.
- A protecao contra reenvio e duplicidade foi implementada no fluxo de sync,
  mas a migration adicionada declara `apply_tower_device_sync_event_v2` e a
  rota atualmente chama `apply_tower_device_sync_event_v3`. Os nomes precisam
  ser alinhados e a migration precisa ser confirmada no ambiente remoto.
- Nao foi comprovado neste ciclo que o Electron ja baixa, persiste, aplica e
  sincroniza os dois blocos de configuracao com versionamento local. Isso
  continua como validacao pendente, assim como desativacao explicita do
  catalogo.

---

Ao iniciar um novo contexto, informar:

> Leia `TOWER_DEVELOPMENT_DECISIONS.md`, `TOWER_AND_TABLET_VISION_CONTEXT.md`
> e `HEATMAP_HEAD_SANDBOX_STATUS.md` antes de propor ou alterar codigo da torre.

Antes de alterar codigo, responder internamente:

1. Isto pertence ao calculo reutilizavel, a experiencia da torre ou ao
   backoffice?
2. Esta alteracao preserva o vinculo futuro entre cliente, avaliacao e sessao?
3. Ela depende indevidamente de `BroadcastChannel`, rota Next ou dashboard?
4. Ela permite seguir sem heatmap quando a sessao nao for confiavel?

Se a resposta indicar acoplamento prematuro, parar e revisar a arquitetura
antes de implementar.
