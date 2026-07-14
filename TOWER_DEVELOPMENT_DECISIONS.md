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

---

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
- detalhes de implementacao do SQLite e da outbox;
- protocolo tecnico de sincronizacao e politica de conflitos por entidade;
- modelo final de camera e PC;
- formato de instalacao e atualizacao da torre;
- desenho final das telas da torre;
- funcionamento sem o sistema completo de Gestao Otica.

Quando essas decisoes chegarem, elas devem respeitar o Supabase como fonte
canonico, o `store_id` imutavel, as sessoes persistidas, as camadas separadas e
os contratos definidos neste documento.

---

## Regra de retomada

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
