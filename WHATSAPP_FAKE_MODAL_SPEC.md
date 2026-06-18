# WHATSAPP_FAKE_MODAL_SPEC

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
  prioriza o fluxo automatico com IA para aquele numero
- `force_human`
  impede resposta automatica e mantem o atendimento em humano ate nova mudanca

Esse controle deve ser persistente e sobreviver ao fechamento do modal.

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
- O controle humano vs IA por cliente precisa ser persistente e manual, nao temporario.
- O painel tecnico abaixo da conversa e parte essencial do produto, nao so ferramenta provisoria de debug.
