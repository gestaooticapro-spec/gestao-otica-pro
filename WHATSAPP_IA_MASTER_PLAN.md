# Plano Mestre — IA na Frente da Automação de WhatsApp

## Resumo

Implementar uma camada de IA **na entrada e na saída** do fluxo de WhatsApp, mantendo a **decisão operacional dentro do sistema**. A IA não executa regras de negócio nem toma decisões finais; ela:

1. interpreta a mensagem do cliente e retorna **JSON estruturado**
2. recebe a resposta canônica do sistema e a transforma em uma resposta **mais humana e simpática**

A memória da conversa, o estado do atendimento, o histórico de anexos, as travas de segurança e a decisão de **automatizar vs encaminhar para humano** ficam no sistema.

A solução deve ser **provider-agnostic** desde o início, para permitir trocar Gemini/OpenAI no meio do processo sem refatoração estrutural.

## Decisões Centrais

- A IA será tratada como **classificador/extrator/redator**, não como agente autônomo.
- Toda mensagem inbound passa primeiro por um **orquestrador do sistema**.
- O orquestrador decide se:
  - ignora
  - processa anexo
  - chama IA para interpretar
  - responde automaticamente
  - transfere para humano
- A memória da conversa fica persistida no sistema, não no contexto do modelo.
- O modelo sempre responde em **JSON validado por schema**.
- O sistema sempre produz uma **resposta canônica estruturada** antes da etapa de humanização.
- Anexos `jpg/png/pdf` não entram no fluxo de resposta por IA no primeiro momento; eles entram em fluxo próprio do sistema.
- Reclamações, orçamento aberto, adaptação, garantia e negociação sensível devem cair em **handoff humano**, com IA apenas ajudando a classificar e redigir.
- O fluxo precisa funcionar com múltiplos providers e múltiplas chaves, com política clara de rotação/fallback.

## Objetivo do V1

Criar um fluxo híbrido em que o cliente perceba mais humanidade, mas o sistema continue seguro e previsível.

### O que o V1 deve automatizar

- Status do óculos / OS
- Horário de funcionamento
- Localização / endereço
- Informações objetivas sobre pagamento / parcela / Pix, desde que já existam no sistema e não exijam negociação
- Resposta padrão de handoff para atendente

### O que o V1 não deve automatizar até decisão posterior

- Orçamento livre
- Precificação de lente/armação
- Reclamação com diagnóstico
- Adaptação/garantia com resolução automática
- Agendamento real se não houver agenda integrada
- Qualquer promessa comercial, prazo manual ou tratativa financeira fora das regras codificadas

## Arquitetura Proposta

### Camadas

1. **Canal WA / Evolution**
   - continua recebendo webhook e entregando ao backend
   - não concentra lógica de negócio
   - continua como ponte de transporte

2. **Orquestrador de Conversa**
   - novo núcleo do fluxo
   - recebe inbound bruto
   - carrega canal, loja, estado, histórico curto e anexos recentes
   - decide qual pipeline usar
   - aplica regras de segurança e elegibilidade

3. **Motor de Intenção IA**
   - recebe contexto resumido e a mensagem
   - retorna JSON de intenção
   - nunca responde texto final diretamente ao cliente

4. **Motor de Regras do Sistema**
   - interpreta a intenção
   - consulta OS, loja, financeiro, config, anexos e estado
   - decide ação final
   - produz resposta canônica estruturada

5. **Humanizador IA**
   - opcional por intent elegível
   - transforma resposta canônica em texto amigável
   - não pode mudar facts, decisão nem policy

6. **Memória / Estado**
   - persistida no banco
   - guarda sessão curta, contexto, handoff, último anexo, última intenção, último status, última ação automática

## Modelo de Fluxo

### Pipeline inbound

1. webhook recebe evento
2. sistema deduplica por `provider_message_id`
3. sistema detecta se há mídia/anexo
4. sistema carrega memória e estado da conversa
5. sistema aplica travas globais:
   - canal ativo
   - fluxo geral ativo
   - pausa humana ativa
   - janela de silêncio
6. sistema decide pipeline:
   - `attachment_pipeline`
   - `intent_pipeline`
   - `ignore_pipeline`
7. sistema produz ação:
   - `auto_reply`
   - `human_handoff`
   - `no_reply`
8. sistema registra tudo
9. se houver resposta, envia via Evolution

### Pipeline attachment

- Se a mensagem contiver `image/pdf/document`:
  - registrar anexo
  - marcar conversa como `waiting_human_after_attachment`
  - não pedir interpretação à IA no primeiro momento
  - não responder com texto clínico/comercial
  - responder uma mensagem fixa do sistema, sem IA:
    - recebimento confirmado
    - atendimento humano será chamado
- Se uma mensagem textual vier logo após anexo recente:
  - sistema identifica contexto de anexo pendente
  - responde handoff humano
  - não tenta automatizar status/preço

### Pipeline intent

- Se não houver anexo:
  - IA recebe mensagem + contexto resumido
  - retorna JSON
  - sistema valida schema
  - sistema decide:
    - automação segura
    - handoff humano
    - resposta padrão
  - se elegível, humaniza com IA
  - envia

## Intenções do V1

### Intents principais

- `order_status`
- `store_hours`
- `store_location`
- `payment_info`
- `budget_request`
- `prescription_submission`
- `complaint_or_adaptation`
- `pickup_or_scheduling`
- `human_agent_request`
- `unknown`

### Entidades mínimas extraídas

- `customer_goal`
- `mentioned_order_number`
- `mentioned_cpf`
- `mentioned_customer_name`
- `mentioned_patient_name`
- `wants_pix`
- `has_urgency`
- `tone`
- `contains_complaint`
- `contains_price_request`
- `contains_attachment_reference`

### Confiança

A IA deve retornar:

- `intent`
- `confidence`
- `entities`
- `automation_candidate`
- `reasoning_tags` curtas e controladas

O sistema **não** usa texto livre de justificativa para decisão; usa apenas campos estruturados.

## Contrato JSON da IA

### Saída do classificador de intenção

```json
{
  "intent": "order_status",
  "confidence": 0.93,
  "automation_candidate": true,
  "entities": {
    "order_number": null,
    "cpf": null,
    "customer_name": null,
    "patient_name": null,
    "wants_pix": false,
    "mentions_attachment": false,
    "complaint_type": null
  },
  "reasoning_tags": ["status", "delivery", "safe_automation"]
}
```

### Regras do schema

- `intent` deve ser enum fechado
- `confidence` entre `0` e `1`
- `automation_candidate` é sugestão, não decisão final
- `entities` só com campos conhecidos
- `reasoning_tags` só com valores permitidos
- se o JSON vier inválido:
  - retry com fallback provider
  - se continuar inválido, handoff humano ou fluxo conservador

### Entrada para humanização

```json
{
  "intent": "store_hours",
  "tone": "friendly",
  "store_name": "Loja Centro",
  "facts": {
    "today_hours": "08:30 às 18:00"
  },
  "policy": {
    "must_not_add_information": true,
    "must_keep_short": true
  },
  "canonical_reply": "Hoje a Loja Centro atende das 08:30 às 18:00."
}
```

### Saída do humanizador

```json
{
  "reply_text": "Oi! Hoje a Loja Centro atende das 08:30 às 18:00. Se quiser, posso chamar alguém da equipe para continuar por aqui."
}
```

## Memória no Sistema

### Objetivo

A memória deve permitir continuidade operacional sem depender de contexto grande no modelo.

### Memória mínima por conversa

- `channel_id`
- `remote_phone`
- `current_state`
- `last_intent`
- `last_intent_confidence`
- `last_action`
- `last_outbound_type`
- `last_attachment_at`
- `last_attachment_kind`
- `human_handoff_active_until`
- `last_known_customer_id`
- `last_known_service_order_id`
- `context_snapshot_json`

### Estados sugeridos

- `idle`
- `waiting_identifier`
- `human_pause`
- `silent`
- `waiting_human_after_attachment`
- `auto_status_recently_sent`

### Janela curta de contexto para IA

Enviar ao classificador apenas:

- última mensagem do cliente
- até 3 últimas mensagens relevantes
- resumo estruturado do estado atual
- indicadores objetivos como `has_recent_attachment`, `has_open_os`, `handoff_active`

Não enviar histórico bruto longo.

## Matriz de Automação por Intenção

### `order_status`

- pode automatizar
- usa dados reais de OS
- se não encontrar cliente por telefone:
  - pedir CPF/número/nome
- se ainda não encontrar:
  - handoff humano

### `store_hours`

- pode automatizar
- responder a partir de configuração da loja
- o ideal é existir uma configuração persistente própria de atendimento da loja, preferencialmente na UI de `config/whatsapp` ou configuração geral da loja
- essa configuração deve permitir distinguir:
  - horário normal de funcionamento
  - intervalo de fechamento no mesmo dia, como almoço
  - fechamento excepcional
  - abertura excepcional
  - feriados e exceções de calendário
- se não existir horário estruturado no sistema:
  - handoff humano ou resposta padrão conservadora

### `store_location`

- pode automatizar
- responder endereço/localização cadastrado da loja
- se faltar dado:
  - handoff humano

## Agenda Operacional da Loja

Para o WhatsApp responder corretamente sobre atendimento, o sistema deve preferir uma fonte persistente de agenda operacional da loja, em vez de depender de prompt solto ou texto livre.

### Objetivo

Permitir que o motor determine com precisão:

- se a loja está aberta agora
- se está fechada por ainda não ter aberto
- se está fechada por intervalo operacional, como almoço
- se está fechada por exceção, feriado ou evento específico
- se está aberta excepcionalmente em um dia fora do padrão
- qual é o próximo horário real de abertura

### Local preferido

- UI de `config/whatsapp`, ou configuração persistente equivalente da loja

### Estrutura sugerida

- `weekly_schedule`
- `break_windows`
- `special_closures`
- `special_openings`
- `timezone`

### Saída canônica esperada do motor

- `is_open_now`
- `closure_reason`
- `next_open_at`
- `today_hours_text`

### Uso esperado no WhatsApp

- `store_hours` pode responder com mais precisão e humanidade sem inventar motivo
- o roteador pode decidir melhor quando manter automação e quando cair para handoff
- outros fluxos podem reaproveitar a mesma lógica, não só o WhatsApp

### `payment_info`

- automatizar apenas consultas objetivas:
  - parcela pendente
  - chave Pix já cadastrada
  - instrução de pagamento já definida
- não automatizar negociação, desconto, promessa ou cobrança sensível
- se houver ambiguidade:
  - handoff humano

### `budget_request`

- não automatizar
- IA classifica
- sistema envia handoff humano

### `prescription_submission`

- se vier anexo:
  - processar via attachment pipeline
  - handoff humano
- se vier só texto dizendo que quer enviar:
  - responder instrução objetiva do sistema
  - opcionalmente orientar que pode mandar a receita
  - depois anexou -> pipeline de anexo

### `complaint_or_adaptation`

- não automatizar solução
- IA classifica
- sistema envia handoff humano acolhedor

### `pickup_or_scheduling`

- se for pergunta simples de retirada e existir status objetivo:
  - pode responder status/retirada
- se for agendamento real sem agenda estruturada:
  - handoff humano

### `human_agent_request`

- sempre handoff humano
- ativar pausa humana

### `unknown`

- resposta conservadora curta
- se baixa confiança, handoff humano

## Tratamento de Anexos

### Tipos do V1

- `image/jpeg`
- `image/png`
- `application/pdf`

### Regras

- anexo nunca dispara resposta clínica/comercial automática
- ao receber anexo:
  - salvar metadados
  - opcionalmente salvar mídia/url de referência
  - marcar necessidade de humano
- se o sistema conseguir identificar que é receita:
  - marcar `attachment_kind = prescription_candidate`
- OCR/document parsing pode existir como processamento interno, mas não muda a regra de handoff no V1

### Regra pedida pelo produto

Se uma mensagem vier após `jpg/pdf`, o sistema deve responder que o atendimento humano será chamado. Isso deve prevalecer sobre a IA.

## Providers, Rotação e Fallback

### Objetivo

Permitir trocar de IA no meio do processo sem quebrar o fluxo.

### Abstração única

Criar uma interface interna única, por exemplo:

- `classifyIntent(input) => IntentJson`
- `humanizeReply(input) => ReplyJson`

O resto do sistema nunca chama Gemini/OpenAI diretamente.

### Provider adapter

Ter adaptadores separados:

- `GeminiAdapter`
- `OpenAIAdapter`

### Estratégia inicial

- classificador: Gemini como default
- humanizador: Gemini como default
- fallback: OpenAI
- fallback secundário: próxima chave do mesmo provider
- se todos falharem:
  - usar resposta canônica direta do sistema
  - ou handoff, conforme intent

### Rotação de chaves

- manter pool configurável por provider
- policy round-robin simples por tentativa
- registrar provider/chave lógica usada em log, sem expor segredo
- bloquear retry infinito
- limite sugerido:
  - 2 tentativas no provider primário
  - 1 tentativa no provider alternativo
  - fallback final para resposta não-humanizada ou handoff

### Requisitos operacionais

- timeout por chamada
- log de latência
- log de falha por provider
- métricas por intent, provider e resultado

## Mudanças de Interface / Tipos

### Novos componentes lógicos

- serviço de classificação de intenção
- serviço de humanização
- orquestrador de conversa WhatsApp com IA
- repositório de memória conversacional
- processador de anexos

### Tipos públicos internos importantes

- `WhatsAppIntent`
- `IntentClassificationResult`
- `ConversationMemoryState`
- `SystemDecisionResult`
- `HumanizationRequest`
- `HumanizationResult`

### Tipos sugeridos

- enum fechado de intents
- enum de estados de conversa
- enum de resultado operacional:
  - `auto_replied`
  - `handed_off`
  - `ignored`
  - `awaiting_human`
  - `attachment_received`

## Persistência

### Tabelas existentes a reutilizar

- `whatsapp_inbound_messages`
- `whatsapp_outbound_messages`
- `whatsapp_conversation_states`
- `whatsapp_store_channels`

### Estruturas novas ou extensões necessárias

- memória conversacional expandida
- log de classificação IA por mensagem
- log de humanização IA por outbound
- metadados de anexo por inbound

### Campos úteis para auditoria

- `intent`
- `intent_confidence`
- `automation_candidate`
- `system_action`
- `ai_provider`
- `ai_model`
- `fallback_count`
- `attachment_kind`
- `handoff_reason`

## Regras de Segurança

- IA nunca executa ação diretamente
- IA nunca escolhe preço, desconto, prazo ou política de garantia
- IA nunca deve responder com informação ausente do `canonical_reply`
- anexos não entram em resposta automática de negócio
- qualquer incerteza relevante cai para humano
- baixa confiança em intent sensível deve cair para humano
- JSON inválido ou provider indisponível não pode quebrar o webhook; deve cair para resposta conservadora

## Estratégia de Implementação

### Etapa 1

Criar a infraestrutura provider-agnostic:

- contratos
- adapters
- schema validator
- rotação/fallback
- logs

### Etapa 2

Substituir o menu heurístico atual por classificador IA apenas para intents simples:

- `order_status`
- `store_hours`
- `store_location`
- `human_agent_request`

### Etapa 3

Introduzir `payment_info` com automação parcial e conservadora

### Etapa 4

Introduzir attachment pipeline:

- `pdf/jpg`
- memória de anexo
- handoff automático

### Etapa 5

Introduzir intents de handoff:

- `budget_request`
- `complaint_or_adaptation`
- `pickup_or_scheduling`

### Etapa 6

Adicionar humanização IA em cima da resposta canônica

## Testes e Cenários

### Classificação

- “meu óculos chegou?”
- “meu pedido ficou pronto?”
- “que horas fecha hoje?”
- “onde vocês ficam?”
- “me manda o pix”
- “quanto tá a lente?”
- “meu óculos tá embaçado”
- “quero falar com atendente”

### Anexos

- envio de jpg sozinho
- envio de pdf sozinho
- envio de jpg + texto depois
- envio de pdf + “recebeu?”
- envio de anexo durante `human_pause`

### Segurança

- IA retorna JSON inválido
- Gemini falha, OpenAI assume
- todas as chaves falham
- intent com baixa confiança
- intent conflitante com anexo recente

### Estado e memória

- cliente pede status, recebe resposta, repete em seguida
- cliente manda anexo, depois texto
- cliente pede atendente, depois insiste
- cliente muda de assunto dentro da mesma janela

### Aceite funcional

- nenhuma decisão operacional sensível depende de texto livre da IA
- toda resposta automática auditável deve ter:
  - inbound
  - classificação
  - decisão do sistema
  - outbound
- handoff deve ser previsível e rastreável
- fallback entre providers não deve alterar o contrato do sistema

## Observabilidade

- log por mensagem com:
  - intent
  - confidence
  - provider
  - latência
  - ação final
- contadores por intent
- taxa de handoff
- taxa de fallback
- taxa de JSON inválido
- taxa de mensagens com anexo
- taxa de automação bem-sucedida por categoria

## Assumptions e Defaults

- V1 não resolve comercial/garantia/orçamento sem humano.
- V1 usa IA apenas em texto; anexos têm pipeline próprio.
- A memória principal fica no banco já usado pelo WhatsApp.
- O sistema atual de canal/Evolution permanece como transporte.
- Gemini é default e OpenAI é fallback inicial.
- Resposta canônica do sistema é a única fonte de verdade para facts.
- Se o deploy precisar ser retomado por outra IA/agente, esta arquitetura deve ser mantida: **IA na borda, sistema no comando**.

## Progresso da Branch

### Entregue na branch `feature/whatsapp-ia-orchestrator`

- Criada a base provider-agnostic em `src/lib/whatsapp/ai.ts`.
- Definidos tipos, enums e schemas Zod para:
  - classificação de intenção
  - humanização de resposta
- Implementado fallback inicial `Gemini -> OpenAI`.
- Implementada rotação simples de chaves por provider.
- Implementado parser conservador para extrair JSON retornado pelos modelos.
- Expostos os helpers:
  - `classifyWhatsAppIntent(...)`
  - `humanizeWhatsAppReply(...)`
  - `isWhatsAppIntentSafeForAutomaticHandling(...)`
- Conectada a classificação IA ao fluxo real de `src/lib/whatsapp/customer-status.ts` para mensagens de texto.
- Neste primeiro encaixe, a IA já pode destravar automaticamente:
  - `order_status`
  - `store_hours`
  - `store_location`
  - `human_agent_request`
- Mantido fallback conservador para o menu/heurística anterior quando:
  - a IA falha
  - a confiança vem baixa
  - a intenção sai do recorte seguro
  - faltam dados estruturados da loja para responder horário/localização
- Adicionada trava inicial para anexos no `customer-status`:
  - detecta `image/document/pdf` de forma conservadora no `payload`
  - pausa automação por IA nesses casos
  - responde com handoff humano fixo ao receber arquivo
  - se vier texto logo depois do arquivo, mantém encaminhamento para humano
- Criado helper central `src/lib/whatsapp/inbound-payload.ts` para ler payload inbound do WhatsApp.
- O fluxo agora tenta aproveitar texto/caption vindo do próprio payload quando `messageText` vier vazio.
- Metadados básicos do anexo passam a ser registrados no estado e no outbound:
  - `attachmentKind`
  - `mimeType`
  - `fileName`
  - `caption`
- O parser foi alinhado com o formato real do serviço `services/whatsapp-automation/server.mjs`, incluindo wrappers comuns da Evolution/Baileys:
  - `ephemeralMessage`
  - `viewOnceMessage`
  - `viewOnceMessageV2`
  - `viewOnceMessageV2Extension`
  - `documentWithCaptionMessage`
  - `editedMessage`
- Adicionado script de verificação `scripts/test_whatsapp_inbound_payload.ts` para travar regressões do parser.
- O estado da conversa agora passa a carregar snapshot curto do último inbound:
  - `lastInboundAt`
  - `lastInboundProviderMessageId`
  - `lastInboundText`
  - `lastInboundHasAttachment`
  - `lastInboundAttachmentKind`
  - `lastInboundMimeType`
  - `lastInboundFileName`
  - `lastInboundCaption`
- Quando uma OS é localizada com sucesso, o estado também passa a guardar:
  - `lastKnownCustomerId`
  - `lastKnownServiceOrderId`
- A classificação da IA já considera esse contexto recente para saber se houve anexo antes de tentar automação.
- As principais transições agora também persistem resumo da decisão operacional:
  - `lastIntent`
  - `lastIntentConfidence`
  - `lastAction`
  - `lastOutboundType`
  - `lastDecisionAt`
- O classificador de intenção já passa a receber contexto resumido da conversa anterior, derivado do estado persistido:
  - última ação
  - última intenção
  - último outbound
  - sinal de anexo recente
  - última mensagem útil do cliente, quando diferente da atual
  - indicação de que já existe OS conhecida no contexto recente
- O roteador também começou a usar histórico resumido antes da IA em desvios conservadores:
  - preserva handoff humano recente quando há contexto de anexo ainda quente
  - retoma tentativa de localizar OS por CPF/nome/número quando o último passo recente foi pedir identificador
- Os principais outbounds agora também passam a carregar um bloco `canonical` no payload, preparando a futura humanização por IA sem mudar o texto atual:
  - `intent`
  - `action`
  - `outboundType`
  - `canonicalReply`
  - `facts`
- A camada canônica foi extraída para `src/lib/whatsapp/canonical.ts`, reduzindo acoplamento no `customer-status` e preparando reaproveitamento nas próximas etapas.
- A camada canônica já começou a ser reutilizada fora do `customer-status`, incluindo a rota de delivery para enriquecer o contexto do outbound enviado.
- As heurísticas de roteamento por histórico foram extraídas para `src/lib/whatsapp/routing-heuristics.ts`, reduzindo acoplamento do `customer-status`.
- A decisão pré-IA do roteador também já foi centralizada em helper puro, reduzindo o acoplamento das bifurcações conservadoras dentro do `customer-status`.
- A decisão pós-classificação segura também já foi centralizada em helper puro, facilitando cenários offline de fluxo.
- A camada canônica já está sendo usada para uma primeira humanização controlada por flag `WHATSAPP_AI_HUMANIZE_ENABLED`.
- Recorte inicial da humanização:
  - `store_hours`
  - `store_location`
  - `human_agent_request` vindo da própria classificação IA
- Escopo já ampliado para mais um handoff seguro:
  - `order_status` quando o sistema cai em `human_handoff` por não localizar identificador
- Escopo ampliado também para handoffs humanos genéricos com `intent = null` e `outboundType = human_handoff`, mantendo anexos sensíveis fora da humanização.
- A humanização não altera o `canonicalReply`; ela só troca o texto final enviado e grava metadados de sucesso/erro no payload.
- A lógica de decisão/aplicação da humanização foi extraída para helper próprio, permitindo testar offline:
  - flag ligada/desligada
  - elegibilidade do outbound
  - fallback quando a IA falha
  - sucesso quando a IA retorna texto humanizado
- Adicionado script `scripts/test_whatsapp_canonical.ts` para validar build/extract/elegibilidade da camada canônica.
- Adicionado script `scripts/test_whatsapp_routing_scenarios.ts` para validar cenários offline do roteador sem tocar na Evolution.
- Adicionado script `scripts/test_whatsapp_pre_ai_routing.ts` para validar a matriz de decisões pré-IA do roteador.
- Adicionado script `scripts/test_whatsapp_customer_status_flow.ts` para validar cenários “quase completos” do fluxo `customer-status` com stubs locais, sem chamar IA real nem Evolution.
- Adicionado script `scripts/test_whatsapp_humanization.ts` para validar a camada de humanização offline.

### Próxima etapa planejada

- Se possível, validar o parser contra payloads capturados da VPS/produção.
- Separar melhor os estados `attachment_received` e `human_pause`.
- Decidir se a humanização deve expandir para outros handoffs seguros ou continuar restrita.
- Começar a desenhar a resposta canônica estruturada para futura humanização por IA.
- Expandir o uso do histórico resumido no roteador para outros cenários seguros.

### Ainda fora do fluxo real nesta etapa

- humanização final da resposta
- memória expandida além do que já existe hoje
- automação de `payment_info`
- trilha completa de auditoria por provider no banco
