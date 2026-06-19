# WHATSAPP_FAKE_MODAL_SPEC

## Status Atual em 2026-06-18

Este documento nasceu como spec de implementacao. A partir daqui ele passa a acumular tambem o estado real do que ja foi entregue e o que ainda precisa ser ajustado.

### Ja implementado

- card de WhatsApp no `Radar Operacional` abrindo modal dedicado
- modal operacional em `src/components/modals/WhatsAppOperatorModal.tsx`
- leitura de threads reais por `store_id`
- unificacao de inbound, outbound e estado atual da conversa
- busca por telefone e por cliente
- envio real pelo operador usando o servico de automacao
- simulacao sem trafego real para o cliente
- painel tecnico com:
  - intent
  - confidence
  - provider/model
  - tokens
  - metadata de estado
- persistencia de override por cliente via `whatsapp_customer_control`
- gate para o card/modal aparecer apenas quando o WhatsApp da loja estiver conectado/configurado
- rolagem interna nas colunas principais do modal
- abertura da thread com foco no fim da conversa

### Ajustes recentes ja aplicados

- corrigido bug em que o modal nao abria a partir do card
- removida dependencia de coluna inexistente `customers.whatsapp`
- corrigido resumo tecnico para carregar `confidence` no fluxo de `order_status`
- corrigido fallback de cliente no modal usando `lastKnownCustomerId` quando o match por telefone falha
- adicionado vinculo persistente `telefone WhatsApp -> customer_id` para estabilizar o nome do cliente na central operacional
- removida tentativa de auto-refresh/realtime por polling que causava piscada da tela

### Pendente relevante

- revisar a semantica operacional dos overrides `IA` e `Humano`
- explicitar no radar quantos numeros estao presos em modo humano persistente
- melhorar a memoria de contexto da IA apenas durante a sessao automatica ativa
- definir estrategia de faxina/retencao para evitar crescimento excessivo das conversas e logs de WhatsApp
- manter este documento sincronizado com o comportamento real do modulo

## Resumo

Este documento define a implementacao de um novo recurso interno do `gestao-otica-pro`: um modal de atendimento de WhatsApp aberto a partir do `Radar Operacional`.

A ideia nao e colocar um "WhatsApp fake" fixo na home. O radar continua existindo como radar. O card atual de WhatsApp vira um gatilho para abrir um modal de atendimento e depuracao.

Esse modal deve servir a dois objetivos ao mesmo tempo:

1. operar o atendimento real de WhatsApp de forma mais controlada
2. funcionar como ferramenta de depuracao do fluxo automatico e da IA

O modal deve mostrar o historico real da conversa, permitir busca por cliente ou numero, permitir envio real de mensagem pelo operador, permitir simulacao sem trafego real, e exibir informacoes internas do sistema abaixo da conversa.

## Objetivo de Produto

Substituir o widget atual de pendencias de WhatsApp no `Radar Operacional` por uma experiencia melhor de atendimento, com mais controle do que o WhatsApp Business nativo.

A nova experiencia deve permitir que a loja:

- veja as conversas reais do WhatsApp dentro do sistema
- acompanhe pendencias que hoje aparecem no radar
- envie mensagens reais para o cliente a partir do sistema
- teste respostas e fluxos da IA sem disparar mensagem real
- escolha se um cliente deve seguir em atendimento por IA ou por humano
- visualizar informacoes internas que nao devem ser enviadas ao cliente, como:
  - extracao de comprovante
  - leitura de imagem ou PDF
  - intencao classificada
  - confianca
  - provider/modelo
  - tokens por interacao
  - motivo de handoff ou silencio

## Estado Atual Relevante

Hoje o sistema ja possui a base tecnica necessaria para sustentar esse recurso:

- `whatsapp_inbound_messages`
  guarda mensagens recebidas
- `whatsapp_outbound_messages`
  guarda mensagens enviadas
- `whatsapp_conversation_states`
  guarda estado vivo da conversa, incluindo `human_pause` e `waiting_human_after_attachment`
- `whatsapp_ai_logs`
  guarda logs de IA por interacao
- `getWhatsAppPendencias(storeId)`
  alimenta o card do radar com pendencias de handoff humano
- existe endpoint interno para marcar conversa iniciada pela loja:
  `/api/whatsapp/store-initiated`
- existe envio real via servico de automacao:
  `/admin/messages/send`
- o fluxo atual ja consegue extrair dados internos de comprovantes e anexos
- o servico da VPS ja imprime logs tecnicos de IA e tokens no SSH

Ou seja: nao se trata de inventar um sistema paralelo. A implementacao deve aproveitar a infraestrutura atual.

## Decisoes Ja Fechadas

### Entrada no fluxo

- O recurso nao ficara fixo na tela.
- O card atual de WhatsApp no `Radar Operacional` deve virar um botao/card que abre o modal.

### Escopo do modal

O modal deve combinar:

- lista de pendencias reais
- busca manual por cliente ou telefone
- conversa real
- simulacao
- painel tecnico interno

### Historico

- O historico principal exibido no modal deve ser o historico real persistido no banco.
- A conversa nao deve ser "fake" no sentido de ser isolada. Ela deve refletir o que aconteceu de verdade com aquele numero.

### Modo de operacao

O composer do modal deve ter dois modos:

- `Real`
- `Simulacao`

### Modo real

- A mensagem enviada pelo operador deve poder ser enviada ao cliente real, usando o canal real ja conectado.
- Esse envio deve ser tratado como atendimento humano e deve pausar a automacao para aquele cliente.

### Modo simulacao

- Deve existir uma forma de testar uma entrada sem enviar nada ao cliente real.
- A simulacao nao deve gravar em `whatsapp_inbound_messages` nem em `whatsapp_outbound_messages`.
- O resultado da simulacao deve aparecer dentro do modal como linha de debug separada do historico real.

### Override por cliente

O operador deve poder escolher para cada cliente:

- `auto`
- `force_ai`
- `force_human`

Esse controle deve:

- ficar persistido
- valer ate mudanca manual
- ser visivel no topo da conversa
- influenciar o motor do WhatsApp nas proximas mensagens reais

Observacao:
essa era a regra original da spec. Ela foi util para viabilizar o V1, mas a regra de produto foi refinada e mudou. Ver a secao `Decisoes Operacionais Recentes`.

## Decisoes Operacionais Recentes

### 1. Memoria de contexto da IA

Decisao atual:

- a IA nao deve carregar contexto longo de conversas antigas apos handoff humano
- uma nova retomada dias depois deve comecar do zero
- se o cliente mandar algo vago como `quero sim`, `sobre aquele oculos`, `pode fazer`, a IA nao deve adivinhar o assunto antigo
- nesses casos a IA deve responder de forma segura e acionar humano, sem fingir que entendeu o contexto completo

Direcao de implementacao desejada:

- manter memoria curta apenas durante a sessao automatica ativa
- essa memoria deve existir do inicio da interacao automatica ate o momento em que a IA entrega para humano
- ao entrar em `human_pause`, o contexto util para IA deve ser considerado encerrado
- retomadas futuras devem ser interpretadas somente pela mensagem nova

Importante:

- o campo `preview` existente hoje nao cumpre esse papel de memoria conversacional
- no desenho atual ele funciona mais como rastro tecnico de algumas transicoes
- se houver evolucao de memoria, ela deve ser feita de forma explicita e separada do `preview`

### 2. Semantica nova do override `IA`

Decisao atual:

- quando o lojista marcar `IA`, isso nao deve significar automacao persistente eterna
- o significado correto e: `quero que a IA atenda a proxima chamada desse cliente`
- se, durante essa proxima chamada, a IA concluir que precisa passar para humano, essa decisao do motor e mais importante do que o override momentaneo
- nesse momento o sistema deve:
  - entregar para humano
  - respeitar `human_pause`
  - retirar o override especial de IA
  - voltar o cliente para `auto`

Em outras palavras:

- `IA` passa a ser override temporario de arranque da proxima conversa
- o handoff automatico da IA tem prioridade sobre esse override

### 3. Semantica nova do override `Humano`

Decisao atual:

- quando o lojista marcar `Humano`, esse modo deve continuar persistente
- a ideia e permitir que a loja reserve aquele numero para acompanhamento humano por dias, se quiser
- porem isso cria risco operacional de o cliente ficar esquecido para sempre em humano

Por isso, alem do modo persistente, o radar operacional precisa ganhar visibilidade explicita dessa fila.

Direcao desejada:

- o radar deve mostrar quantos numeros estao atualmente em `force_human`
- esse numero deve aparecer de forma operacionalmente obvia no card de WhatsApp
- a intencao e lembrar a loja de revisar esses casos e devolver para `auto` quando o assunto acabar

### 4. O que isso significa para o V1 atual

Hoje o modulo ja permite escolher `auto`, `force_ai` e `force_human`, com persistencia em banco.

Porem, o comportamento desejado a partir desta conversa passa a ser:

- `auto`
  - comportamento normal do motor
- `IA`
  - override temporario para a proxima chamada
  - depois do handoff automatico da IA, voltar sozinho para `auto`
- `Humano`
  - override persistente ate mudanca manual
  - contar no radar como cliente em acompanhamento humano especial

Isso implica revisao do fluxo atual, porque hoje `force_ai` e persistente como os outros modos.

### 5. Faxina operacional e retencao de historico

Decisao em aberto, mas necessidade ja confirmada:

- o banco nao deve acumular conversas de WhatsApp indefinidamente sem estrategia de retencao
- sem isso, a loja e o sistema acabam herdando listas longas demais e custo operacional desnecessario

Objetivo:

- manter o modulo util para atendimento e debug
- sem transformar `whatsapp_inbound_messages`, `whatsapp_outbound_messages`, `whatsapp_ai_logs` e estados antigos em um historico infinito

Direcoes aceitas para implementacao:

- faxina automatica a cada `x` dias
- e/ou botao/manual trigger na UI administrativa ou operacional
- e/ou combinacao dos dois modos

Requisitos desejados:

- nao apagar conversa viva ou pendencia humana ativa por engano
- preservar apenas o que ainda tem valor operacional recente
- permitir politica diferente para:
  - mensagens inbound/outbound
  - logs de IA
  - estados expirados
  - controles persistentes por cliente

Regra de seguranca sugerida:

- limpar primeiro:
  - `whatsapp_ai_logs` antigos
  - `whatsapp_conversation_states` expirados
  - mensagens antigas que nao tenham pendencia humana ativa nem override humano persistente
- evitar apagar:
  - clientes em `force_human`
  - threads com handoff humano ainda em aberto
  - conversas muito recentes

Direcao de produto:

- essa faxina deve ser encarada como parte do modulo operacional, nao como tarefa solta de manutencao tecnica
- idealmente o sistema deve combinar:
  - retencao automatica segura
  - mais um recurso visivel para revisao/limpeza manual quando a loja quiser

## UX Desejada

## 1. Card no Radar Operacional

No `Radar Operacional`, o bloco atual de WhatsApp deixa de expandir uma lista fixa e passa a funcionar como um card-botao.

Esse card deve mostrar apenas um resumo operacional, por exemplo:

- titulo WhatsApp
- quantidade de pendencias
- sinal de atencao quando houver handoff humano pendente
- CTA implicito de abrir o modal

Ao clicar, abre o modal de WhatsApp.

## 2. Estrutura do modal

O modal deve ser largo e dividido em tres zonas:

### Coluna lateral esquerda

Responsavel por contexto operacional e selecao da conversa.

Deve conter:

- lista de pendencias reais do radar
- busca por numero
- busca por cliente
- possibilidade de abrir uma conversa sem pendencia previa
- indicacao visual do estado do cliente:
  - IA
  - humano
  - automatico
  - pendencia
  - anexo recebido

### Area central

Responsavel pela conversa em si.

Deve conter:

- bubbles de mensagens reais inbound/outbound
- diferenciacao clara entre:
  - cliente
  - sistema
  - operador
  - simulacao
- topo da thread com:
  - telefone
  - nome do cliente, quando houver
  - modo atual `auto / IA / humano`
  - status de conexao/utilidade operacional
- composer com:
  - input de texto
  - seletor `Real / Simulacao`
  - botao de enviar

### Painel inferior ou lateral de contexto interno

Responsavel por tudo que o sistema sabe mas o cliente nao deve ver.

Deve exibir, de preferencia baseado na ultima interacao ou na mensagem selecionada:

- intent
- confidence
- provider
- model
- input/output/total tokens
- nota interna de handoff
- dados extraidos de comprovante
- leitura de PDF/imagem quando houver
- motivo de silencio
- motivo do handoff
- route final do orquestrador

Esse painel deve existir abaixo da conversa ou como subpainel tecnico do modal. A informacao deve ser claramente interna.

## Comportamento esperado

## 1. Abrir pelo radar

- O operador clica no card de WhatsApp no radar.
- O modal abre.
- A lateral mostra as pendencias reais primeiro.
- O operador pode abrir uma thread de pendencia ou buscar um cliente diferente.

## 2. Ver historico real

Ao selecionar um numero, o modal carrega:

- inbound real
- outbound real
- estado atual da conversa
- logs de IA relacionados
- ultima informacao tecnica disponivel

## 3. Enviar mensagem real

Se o operador usar o modo `Real`:

- a mensagem deve ser enviada ao cliente real
- o envio deve entrar no historico real
- o sistema deve registrar que a loja assumiu o atendimento humano
- o cliente deve ficar pausado para IA ate mudanca manual ou override diferente

## 4. Rodar simulacao

Se o operador usar o modo `Simulacao`:

- a mensagem nao deve ser enviada ao cliente
- o sistema deve passar essa entrada pelo mesmo motor de decisao do WhatsApp
- a resposta, a intencao e os dados internos devem voltar para o modal
- o modal deve mostrar isso como linha de debug
- essa linha nao deve poluir as tabelas reais de mensagens

## 5. Override por cliente

No topo da conversa deve existir controle explicito para:

- Automatico
- IA
- Humano

Regra:

- `auto`
  usa o comportamento padrao do sistema
- `force_ai`
  no desenho original da spec, priorizava o fluxo automatico com IA de forma persistente
- `force_human`
  impede resposta automatica e mantem o atendimento em humano ate nova mudanca

Esse controle deve ser persistente e sobreviver ao fechamento do modal.

Atualizacao de regra:

- `force_ai` nao deve mais ser interpretado como persistente no produto final
- a persistencia em banco pode continuar existindo como detalhe tecnico do V1 atual, mas o comportamento desejado e de override temporario para a proxima chamada
- `force_human` continua persistente

## Mudancas tecnicas necessarias

## 1. UI

### No dashboard

Trocar o widget atual `WidgetWhatsAppPendencias` por um gatilho de abertura do modal.

Arquivos provaveis:
- `src/components/dashboard/ActionMenuDashboard.tsx`
- `src/components/consultas/WidgetWhatsAppPendencias.tsx`

### Novo modal

Criar um modal dedicado de WhatsApp operacional.

Sugestao de nome:
- `src/components/modals/WhatsAppOperatorModal.tsx`

Esse modal deve ser usado pelo dashboard operacional, nao pela aba de configuracao.

## 2. Leitura de historico

Criar action de leitura de threads de WhatsApp.

Ela deve:

- listar threads por `store_id`
- mesclar inbound e outbound
- permitir filtro por `remote_phone`
- permitir busca por cliente
- carregar estado atual e resumo tecnico

O DTO de thread deve conter:

- identificacao do cliente/numero
- mensagens normalizadas para a UI
- estado atual
- override atual
- pendencia atual
- resumo interno

## 3. Envio real pelo operador

Criar action de envio real do modal.

Essa action deve:

- validar `store_id`, `remote_phone` e `message_text`
- descobrir o `instance_key` da loja
- criar outbound real
- enviar pelo canal real usando a infraestrutura existente
- marcar a conversa como iniciada/assumida pela loja
- refletir isso na thread imediatamente

Importante:
nao depender apenas do eco `fromMe` do webhook. O sistema deve registrar explicitamente a intencao de atendimento humano ao enviar pelo modal.

## 4. Simulacao

Criar uma action ou route propria para simulacao de conversa.

Essa simulacao deve:

- aceitar `store_id`, `remote_phone`, `message_text`
- opcionalmente aceitar anexo fake para testes futuros
- reutilizar o motor de decisao do WhatsApp
- nao persistir em inbound/outbound reais
- devolver um DTO com:
  - shouldReply
  - texto que seria enviado
  - intent
  - confidence
  - route escolhida
  - provider/model
  - tokens
  - dados internos relevantes

Se necessario, extrair parte do motor atual para um nivel mais reutilizavel, separando:
- interpretacao/decisao
- persistencia
- envio real

## 5. Override por cliente

Criar persistencia nova para controle operacional por cliente.

Sugestao de tabela:
`whatsapp_customer_control`

Campos minimos:
- `id`
- `tenant_id`
- `store_id`
- `channel_id`
- `remote_phone`
- `mode` com valores `auto | force_ai | force_human`
- `updated_by`
- `updated_at`

Essa tabela deve ser consultada pelo motor real antes de decidir se responde ou silencia.

Atualizacao:

- a tabela continua valida para o V1 entregue
- porem o uso de `force_ai` precisa ser revisto para suportar override temporario
- uma possibilidade e manter `force_human` persistido nessa tabela e tratar o pedido de `IA` como override consumivel na proxima entrada relevante
- essa decisao ainda precisa ser implementada no codigo

## 6. Painel tecnico interno

Criar uma forma estruturada de compor o painel tecnico do modal.

A fonte deve vir de:
- `whatsapp_conversation_states.metadata`
- `whatsapp_ai_logs`
- `whatsapp_outbound_messages.payload`
- dados extraidos de comprovante
- dados de simulacao em memoria da sessao do modal

Nao enviar nada disso para o cliente.

## Integracao com o motor atual

O motor atual de WhatsApp ja concentra muita logica em `customer-status.ts`.
Para esse recurso, a implementacao deve evitar duplicar esse comportamento.

Direcao recomendada:

- extrair um nucleo reutilizavel de orquestracao/decisao
- deixar a rota real continuar persistindo e enviando
- deixar a simulacao chamar esse mesmo nucleo em modo sem persistencia
- devolver um DTO de debug padronizado tanto para log quanto para UI

Objetivo:
uma unica verdade de decisao para:
- WhatsApp real
- simulacao no modal
- logs tecnicos

## Requisitos de dados mostrados ao operador

Na conversa:
- mensagens reais
- mensagens reais enviadas pelo operador
- linhas de simulacao separadas visualmente

No painel interno:
- intent
- confidence
- provider/model
- input_tokens
- output_tokens
- total_tokens
- route final
- handoff note
- ai_extracted_receipt
- leitura de PDF/imagem quando houver
- motivo de no_reply

## Fora de escopo do V1

Nao implementar agora:

- envio real de anexo pelo operador no modal
- transcricao de audio do operador
- sincronizacao de media outbound do operador
- multiatendente em tempo real com presenca online
- edicao retroativa de mensagens reais
- simulacao persistida em tabelas reais
- calculo de custo em reais
- dashboard analitico completo de performance do WhatsApp
- rotina completa de retencao/faxina com UI administrativa dedicada

Observacao:
mesmo ficando fora do V1 inicial, a necessidade ja foi confirmada e deve orientar as proximas etapas do modulo

## Cenarios de teste

### Fluxo do modal
- abrir o modal pelo card do radar
- badge de pendencias consistente com os dados reais

### Historico real
- selecionar numero com historico real
- ver inbound e outbound em ordem correta
- ver estado atual da conversa

### Busca
- buscar por numero sem pendencia atual
- buscar por cliente por nome
- abrir thread correta

### Envio real
- operador envia mensagem em modo real
- mensagem chega ao cliente
- historico atualiza
- conversa entra em modo humano

### Simulacao
- operador envia mensagem em modo simulacao
- nada e enviado ao cliente
- linha de debug aparece no modal
- intent/tokens/resposta tecnica aparecem no painel interno
- nada e gravado em inbound/outbound reais

### Override
- mudar para `force_human`
- cliente enviar mensagem real
- sistema nao responder automaticamente
- mudar para `force_ai`
- cliente enviar mensagem real
- sistema tentar automacao conforme regras

### Override temporario de IA
- operador marcar `IA`
- cliente mandar a proxima mensagem real
- sistema tentar atender automaticamente
- se a IA fizer handoff para humano, o controle deve voltar sozinho para `auto`
- uma mensagem futura nao deve continuar presa em `IA` por causa desse override antigo

### Radar de humanos persistentes
- marcar alguns clientes em `force_human`
- card do radar refletir quantos numeros estao nesse modo
- devolver um cliente para `auto`
- contador do radar diminuir sem depender de interpretacao manual

### Anexos reais
- cliente mandar imagem/PDF/comprovante
- dados internos aparecem no painel tecnico
- nada interno e exposto como mensagem ao cliente

## Arquivos provaveis a tocar

Sem limitar a implementacao a estes nomes, os pontos mais provaveis sao:

- `src/components/dashboard/ActionMenuDashboard.tsx`
- `src/components/consultas/WidgetWhatsAppPendencias.tsx`
- novo modal em `src/components/modals/`
- actions de consulta em `src/lib/actions/consultas.actions.ts`
- novas actions de WhatsApp em `src/lib/actions/whatsapp.actions.ts`
- nucleo de decisao em `src/lib/whatsapp/customer-status.ts`
- possivel extracao de funcoes compartilhadas para `src/lib/whatsapp/`
- nova migration para o override por cliente

## Assuncoes

- O operador principal desse recurso e a equipe da loja, nao o admin tecnico.
- O modal sera acessado a partir da home operacional da loja.
- O historico real ja persistido no banco e suficiente para o v1.
- O modo simulacao deve ficar claramente separado do historico real, mesmo aparecendo na mesma interface.
- O controle `Humano` por cliente continua persistente e manual.
- O controle `IA` nao deve permanecer para sempre; ele deve ser tratado como override temporario da proxima chamada.
- O painel tecnico abaixo da conversa e parte essencial do produto, nao so ferramenta provisoria de debug.
- A memoria da IA deve existir apenas dentro da sessao automatica ativa e deve ser encerrada no handoff para humano.
