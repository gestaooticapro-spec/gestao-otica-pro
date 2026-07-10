# Torre - Decisoes de Desenvolvimento e Contexto Obrigatorio

## Como usar este documento

Antes de iniciar ou retomar qualquer trabalho relacionado a torre, visagismo,
heatmap, medidas ou recomendacao visual, leia nesta ordem:

1. `TOWER_DEVELOPMENT_DECISIONS.md` (este arquivo)
2. `TOWER_AND_TABLET_VISION_CONTEXT.md`
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
