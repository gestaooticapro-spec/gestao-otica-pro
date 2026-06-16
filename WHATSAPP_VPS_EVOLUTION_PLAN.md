# WhatsApp na VPS com Evolution API

## Objetivo

Documentar uma frente futura para usar a VPS ja criada para a `nuvem-local-fiscal` como base de uma camada adicional de comunicacao com clientes via WhatsApp.

A ideia central nao e misturar tudo dentro da API fiscal, e sim aproveitar a existencia da VPS, do ambiente server-side e do contexto multi-loja para criar um servico de notificacoes e atendimento simples.

Este documento existe para servir como base de implementacao futura, possivelmente em uma branch dedicada.

## Resumo executivo

Hoje o sistema ja possui varios pontos em que o operador consegue abrir o WhatsApp do cliente com uma mensagem pre-montada.

Exemplos reais ja presentes no projeto:

- aviso de `oculos prontos`
- lembrete de `parcela vencendo hoje ou amanha`
- contatos em cobranca
- mensagens em historico do cliente
- contatos em assistencia, pos-venda e laboratorio

O que existe hoje e um fluxo manual:

1. o sistema monta a mensagem
2. abre `wa.me` ou `api.whatsapp.com`
3. o usuario envia manualmente

O que esta ideia propoe e evoluir isso para um fluxo semi-automatico ou automatico:

1. o sistema detecta um evento
2. registra uma notificacao
3. envia via `Evolution API`
4. salva historico, status e tentativas
5. opcionalmente responde mensagens simples recebidas

## Decisao principal de arquitetura

### Nao acoplar WhatsApp dentro da API fiscal

A `nuvem-local-fiscal` deve continuar focada em:

- autenticacao
- compatibilidade fiscal
- certificados
- SEFAZ
- XML/PDF
- eventos fiscais

Mesmo que rode na mesma VPS, o componente de WhatsApp deve nascer como servico separado.

Motivos:

- evita que falha de sessao do WhatsApp afete emissao fiscal
- permite deploy independente
- reduz risco operacional
- facilita desligar ou reiniciar apenas o canal de mensagens
- deixa mais clara a responsabilidade de cada sistema

### Direcao sugerida

Arquitetura recomendada:

- `gestao-otica-pro` continua sendo a origem dos eventos de negocio
- `nuvem-local-fiscal` continua isolada como servico fiscal
- novo servico `whatsapp-notifications` roda na mesma VPS ou em outro container
- `Evolution API` faz a ponte com o WhatsApp

## O que ja existe no sistema e pode ser reaproveitado

### 1. Mensagens operacionais ja mapeadas

O projeto ja tem varios pontos onde o texto da mensagem esta praticamente resolvido.

Isso e importante porque reduz bastante o trabalho do v1.

Casos ja identificados:

- `Entrega`: mensagem de oculos prontos aguardando retirada
- `Consultas / vencimentos`: mensagem de parcela vencendo
- `Cobranca`: contato com cliente inadimplente
- `Aniversariantes`: mensagem promocional ou de relacionamento
- `Assistencia / Pos-venda / Gaveta / Laboratorio`: contatos contextuais

### 2. Telefones de clientes ja fazem parte do dominio

Ja existe uso amplo de:

- `customers.fone_movel`
- fallback para `phone` em alguns fluxos

Isso permite pensar em centralizar validacao e normalizacao de telefone para envio automatizado.

### 3. Multi-loja ja e parte natural do sistema

O projeto ja trabalha com `storeId` como contexto real de quase tudo.

Isso combina bem com o modelo sugerido de:

- uma sessao/instancia WhatsApp por loja
- templates e regras por loja
- historico e auditoria por loja

## Escopo sugerido do v1

O v1 deve ser propositalmente pequeno.

Objetivo do v1:

- enviar notificacoes automaticas ou semi-automaticas
- registrar historico de envio
- receber mensagens simples
- responder apenas casos basicos

O que entra no v1:

- aviso de `oculos prontos`
- lembrete de `parcela vence amanha`
- lembrete de `parcela vence hoje`
- cobranca leve de `parcela vencida`
- resposta automatica simples de:
  - horario
  - endereco
  - pedido de retorno humano
  - identificacao da loja

O que fica fora do v1:

- atendimento inteligente amplo
- respostas longas com IA para qualquer assunto
- negociacao automatica de cobranca
- bot conversacional complexo
- mistura com regras fiscais
- dependencia de um unico numero para todas as lojas

## Modelo operacional sugerido

### Um numero por loja

Direcao sugerida:

- cada loja usa seu proprio numero de WhatsApp
- cada loja possui sua propria sessao/instancia na `Evolution API`
- cada envio sempre nasce com `storeId`

Vantagens:

- contexto claro para o cliente
- menor risco de mistura de conversas
- horario, endereco e equipe coerentes com a loja
- historico mais limpo
- viabiliza desligar uma loja sem afetar as outras

Desvantagens:

- mais sessoes para administrar
- onboarding um pouco mais trabalhoso
- mais cuidado com monitoramento de conexao

Mesmo assim, para o seu dominio, parece a topologia correta.

## Casos de uso principais

### 1. Oculos prontos

Evento de negocio:

- uma OS ou item vai para um status equivalente a `pronto`, `montado` ou `aguardando retirada`

Comportamento esperado:

1. sistema detecta a transicao
2. cria evento de notificacao
3. valida telefone do cliente
4. monta a mensagem com nome do cliente, paciente e loja
5. envia via `Evolution API`
6. salva status do envio
7. evita reenvio duplicado acidental

Variantes uteis:

- enviar automatico no momento da mudanca de status
- ou deixar em fila para confirmacao do operador

### 2. Parcela vencendo

Evento de negocio:

- existem parcelas com vencimento em `amanha`
- existem parcelas com vencimento em `hoje`

Comportamento esperado:

1. job diario roda por loja
2. busca parcelas elegiveis
3. aplica trava para nao enviar duplicado
4. envia lembrete amigavel
5. registra historico

Mensagem ideal do v1:

- tom leve
- sem ameaca
- sem juridiquese
- com nome da loja
- com opcao de o cliente responder pedindo chave Pix

### 3. Parcela vencida

Evento de negocio:

- parcela passou do vencimento e segue aberta

Comportamento esperado:

- usar uma regua simples e conservadora
- por exemplo, dia 1, dia 3 e dia 7
- nunca disparar em excesso
- permitir bloqueio manual do cliente

### 4. Respostas simples recebidas

Cenarios do v1:

- `qual o horario?`
- `qual o endereco?`
- `pode me mandar a chave pix?`
- `quero falar com alguem`

Comportamento sugerido:

- tentar classificar a intencao em poucas categorias
- responder com texto fixo ou semi-fixo
- se a mensagem fugir disso, marcar para humano

## Fluxo tecnico sugerido

### Fluxo de saida

1. evento nasce no `gestao-otica-pro`
2. evento vira uma solicitacao de notificacao
3. servico de notificacao valida:
   - `storeId`
   - telefone
   - template
   - idempotencia
   - opt-out
4. servico chama `Evolution API`
5. salva:
   - payload
   - resposta
   - horario
   - tentativa
   - status

### Fluxo de entrada

1. cliente manda mensagem para o numero da loja
2. `Evolution API` entrega webhook
3. servico identifica a loja e o contato
4. persiste mensagem inbound
5. classifica intencao simples
6. responde automaticamente apenas se estiver dentro de regra segura
7. senao, marca para retorno humano

## Separacao em camadas

### Camada 1 - Origens de evento no Gestao Oitica

Responsavel por descobrir que algo aconteceu.

Exemplos:

- OS ficou pronta
- parcela vence amanha
- parcela venceu
- cliente pediu contato

### Camada 2 - Servico de notificacao

Responsavel por:

- receber pedido de envio
- deduplicar
- validar elegibilidade
- montar mensagem final
- chamar `Evolution API`
- persistir historico

### Camada 3 - Provedor WhatsApp

No desenho atual:

- `Evolution API`

No futuro, isso pode mudar sem obrigar reescrita completa do sistema, desde que exista uma camada adaptadora.

## Por que usar camada adaptadora

Mesmo que o v1 use `Evolution API`, vale criar um contrato interno proprio.

Exemplo de interface conceitual:

```ts
type SendMessageInput = {
  storeId: number
  to: string
  templateKey: string
  variables: Record<string, string | number | null>
  contextType?: 'service_order' | 'installment' | 'collection' | 'generic'
  contextId?: string | number
  idempotencyKey: string
}
```

Assim:

- a aplicacao nao fica espalhando detalhes da `Evolution API`
- fica mais facil trocar de provedor no futuro
- testes ficam mais simples

## Estrutura de dados sugerida

### 1. Configuracao por loja

Tabela sugerida: `whatsapp_store_channels`

Campos sugeridos:

- `id`
- `store_id`
- `provider`
- `instance_name`
- `phone_number`
- `status`
- `is_active`
- `last_connection_at`
- `last_error`
- `created_at`
- `updated_at`

### 2. Templates

Tabela sugerida: `whatsapp_templates`

Campos sugeridos:

- `id`
- `store_id` nullable para permitir template global
- `key`
- `name`
- `body`
- `is_active`
- `created_at`
- `updated_at`

Templates iniciais sugeridos:

- `delivery_ready`
- `installment_due_tomorrow`
- `installment_due_today`
- `installment_overdue_day_1`
- `installment_overdue_day_3`
- `simple_auto_reply_hours`
- `simple_auto_reply_address`
- `simple_auto_reply_human`

### 3. Fila/historico de envios

Tabela sugerida: `whatsapp_notifications`

Campos sugeridos:

- `id`
- `store_id`
- `customer_id`
- `phone`
- `template_key`
- `context_type`
- `context_id`
- `message_preview`
- `status`
- `provider_message_id`
- `provider_payload`
- `provider_response`
- `attempt_count`
- `last_attempt_at`
- `sent_at`
- `delivered_at`
- `failed_at`
- `error_message`
- `idempotency_key`
- `created_at`
- `updated_at`

### 4. Mensagens recebidas

Tabela sugerida: `whatsapp_inbound_messages`

Campos sugeridos:

- `id`
- `store_id`
- `channel_id`
- `phone`
- `customer_id` nullable
- `provider_message_id`
- `message_text`
- `message_type`
- `received_at`
- `intent`
- `handled_by`
- `handled_status`
- `response_notification_id` nullable
- `raw_payload`
- `created_at`

### 5. Opt-out e bloqueios

Tabela sugerida: `whatsapp_contact_prefs`

Campos sugeridos:

- `id`
- `store_id`
- `customer_id` nullable
- `phone`
- `allow_notifications`
- `allow_collection`
- `allow_marketing`
- `blocked_reason`
- `updated_at`

## Regras de negocio importantes

### 1. Idempotencia obrigatoria

Sem isso, o sistema pode mandar mensagem duplicada quando:

- a tela for aberta duas vezes
- a action rodar novamente
- um cron falhar e repetir
- um deploy reiniciar processamento

Exemplos de chave:

- `delivery-ready:{storeId}:{osId}:{statusTimestamp}`
- `installment-due:{storeId}:{parcelaId}:{yyyy-mm-dd}:{templateKey}`

### 2. Trava anti-spam

Mesmo com idempotencia, vale ter janela minima por assunto.

Exemplos:

- nao reenviar `oculos prontos` dentro de 48h sem acao humana
- nao reenviar `parcela vencendo hoje` no mesmo dia
- nao mandar cobranca mais que X vezes em Y dias

### 3. Opt-out e bloqueio

Precisa existir forma de impedir envio para:

- cliente sem permissao
- cliente que pediu para nao receber
- telefone invalido
- cliente problematico para cobranca automatica

### 4. Diferenciar transacional de marketing

`oculos prontos` e `parcela vencendo` sao mais proximos de notificacao operacional.

Ja mensagens promocionais precisam de mais cuidado.

O sistema deve nascer preparado para separar:

- transacional
- cobranca
- marketing

## Eventos de negocio sugeridos

### Eventos de saida

- `service_order.ready_for_delivery`
- `installment.due_tomorrow`
- `installment.due_today`
- `installment.overdue`
- `customer.manual_followup_requested`

### Eventos de entrada

- `whatsapp.message.received`
- `whatsapp.connection.updated`
- `whatsapp.message.delivery.updated`

## Pontos de integracao no sistema atual

### 1. Entrega

Fluxo atual:

- existe mensagem pronta na tela de entrega
- operador clica em `Avisar`
- link do WhatsApp e aberto

Evolucao futura:

- manter botao manual
- adicionar opcao de `enviar automatico`
- ou gerar fila de notificacao ao marcar a OS como pronta

### 2. Vencimentos

Fluxo atual:

- widget mostra vencimentos hoje/amanha
- operador clica e abre WhatsApp manualmente

Evolucao futura:

- cron por loja consulta vencimentos elegiveis
- cria notificacoes automaticamente
- widget passa a mostrar tambem status de envio

### 3. Cobranca

Fluxo atual:

- contato e manual e contextual

Evolucao futura:

- historico centralizado de tentativas
- regras de cadencia
- bloqueio de reenvio excessivo

### 4. Mensagens avulsas

Mesmo depois da automacao, ainda vale manter:

- botao manual para operador
- abertura direta do WhatsApp em fluxos sensiveis

Nem tudo precisa virar automatismo.

## Sugestao de APIs internas

### API de solicitacao de envio

`POST /api/whatsapp/notifications/send`

Payload conceitual:

```json
{
  "storeId": 1,
  "customerId": 123,
  "phone": "5544999999999",
  "templateKey": "delivery_ready",
  "contextType": "service_order",
  "contextId": 21158,
  "variables": {
    "customerFirstName": "Maria",
    "patientName": "Joao",
    "storeName": "Otica Prisma"
  },
  "idempotencyKey": "delivery-ready:1:21158:2026-06-13T10:00:00Z"
}
```

### Webhook de entrada

`POST /api/whatsapp/webhooks/evolution/[storeId]`

Responsabilidades:

- validar autenticidade basica
- persistir payload
- extrair mensagem
- identificar contato
- disparar tratamento

### Consulta de historico

`GET /api/whatsapp/notifications/history?storeId=1`

Uso futuro:

- auditoria
- suporte
- tela administrativa

## Tela administrativa futura

Uma UI simples ajudaria muito.

Escopo inicial sugerido:

- status da conexao do WhatsApp por loja
- QR Code ou estado da sessao quando aplicavel
- ultimas mensagens enviadas
- falhas recentes
- templates ativos
- ligas/desligas de automacao:
  - avisar oculos prontos
  - avisar parcelas vencendo
  - avisar parcelas vencidas

## Jobs agendados

### Job 1 - Parcelas vencendo amanha

Horario sugerido:

- todos os dias pela manha

Responsabilidade:

- buscar por loja
- montar fila
- respeitar opt-out e idempotencia

### Job 2 - Parcelas vencendo hoje

Horario sugerido:

- inicio da manha

### Job 3 - Parcelas vencidas

Horario sugerido:

- uma vez ao dia

Regra:

- cadencia conservadora

### Job 4 - Healthcheck de conexoes WhatsApp

Responsabilidade:

- verificar instancias desconectadas
- alertar administrador

## Respostas simples automatizadas

O v1 nao deve tentar ser atendente completo.

A proposta segura e trabalhar com um classificador pequeno.

Intencoes iniciais:

- `horario`
- `endereco`
- `pix`
- `humano`
- `status_pedido`

Possivel comportamento:

- se a mensagem bater com uma regra clara, responde
- se houver baixa confianca, nao improvisa
- marca para humano

## Onde IA pode entrar depois

IA pode ser adicionada no futuro, mas nao precisa estar no primeiro corte.

Boas aplicacoes futuras:

- classificar mensagem recebida
- sugerir resposta para operador
- resumir conversas
- priorizar cobranca

Maus usos no inicio:

- deixar IA prometer prazo
- deixar IA negociar valores
- deixar IA inventar status de pedido
- deixar IA responder livremente sem trilha de auditoria

## Riscos e cuidados

### 1. Dependencia de sessao

Se a `Evolution API` depender de sessao conectada, pode haver:

- desconexao
- QR expirado
- perda de sessao

Isso exige monitoramento e tela de status.

### 2. Mensagem duplicada

Risco alto se nao houver:

- idempotencia
- trava de cadencia
- historico persistido

### 3. Mistura entre lojas

Como o projeto e multi-loja, esse e um risco serio.

O sistema nao pode:

- enviar mensagem da loja A com template da loja B
- responder cliente da loja errada
- usar numero errado

### 4. Conteudo sensivel em cobranca

Mensagens de cobranca precisam ser:

- claras
- respeitosas
- nao agressivas
- sem excesso de insistencia

### 5. Acoplamento com a fiscal

Mesmo com a mesma VPS, nunca tratar esse modulo como parte do core fiscal.

## Branch futura sugerida

Nome possivel:

- `feature/whatsapp-evolution-vps`

Ou, se quiser separar por fase:

- `feature/whatsapp-notifications-v1`
- `feature/whatsapp-inbound-simple-replies`

## Fases de implementacao sugeridas

### Fase 0 - Preparacao documental e arquitetura

- definir servico separado
- decidir se fica no mesmo repo ou repo proprio
- documentar envs e segredos
- mapear instancias por loja

### Fase 1 - Infra minima

- subir `Evolution API`
- criar servico backend de notificacoes
- persistir canais por loja
- healthcheck basico

### Fase 2 - Historico e envio manual server-side

- criar tabela de notificacoes
- endpoint interno de envio
- trocar um fluxo manual por envio real controlado
- comecar por `oculos prontos`

### Fase 3 - Automacao de parcelas

- criar jobs diarios
- lembrete de amanha
- lembrete de hoje
- regua leve de vencidas

### Fase 4 - Entrada e respostas simples

- webhook inbound
- persistencia das mensagens recebidas
- classificador simples
- respostas fixas para poucos casos

### Fase 5 - Painel administrativo

- status das instancias
- ultimos envios
- erros
- ligas/desligas por loja

## Estrategia de validacao

### Validacoes tecnicas

- envio unitario manual
- entrega de webhook
- persistencia correta
- idempotencia funcionando
- isolamento por `storeId`

### Validacoes operacionais

- uma loja piloto
- um numero real
- um caso real de oculos prontos
- um caso real de parcela vencendo
- teste de desconexao e reconexao

### Validacoes de negocio

- mensagem nao pode soar robotica demais
- nome da loja deve estar correto
- nome do paciente/cliente deve estar correto
- nao pode mandar mensagem para telefone vazio ou mal formatado

## Decisoes recomendadas desde ja

Mesmo antes de implementar, vale registrar estas direcoes:

- manter `nuvem-local-fiscal` separada da frente WhatsApp
- usar `storeId` como chave principal de contexto
- adotar `um numero por loja`
- comecar por notificacoes transacionais
- deixar atendimento inteligente amplo para depois
- exigir historico e idempotencia antes de automacao total

## Conclusao

A ideia e viavel e conversa muito bem com o que o sistema ja faz hoje.

O maior ganho imediato nao esta em criar um bot super sofisticado, e sim em transformar mensagens que ja existem no frontend em uma camada server-side confiavel, auditavel e multi-loja.

O caminho mais seguro parece ser:

1. manter a parte fiscal isolada
2. criar um servico separado de notificacoes
3. usar `Evolution API` como provedor inicial
4. comecar por `oculos prontos` e `parcelas`
5. adicionar respostas simples de inbound apenas depois de historico e roteamento estarem firmes

Se isso for feito com cuidado, a VPS deixa de ser apenas um host da API fiscal e passa a ser um ponto central de operacao da loja com potencial real de ganho no atendimento, cobranca e retirada.
