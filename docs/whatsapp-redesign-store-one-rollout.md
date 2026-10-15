# Redesign completo — Loja 1

## Escopo

O modo `redesign`, com `safe_replies_enabled=true`, usa a decisão do redesign
como autoridade de roteamento da Loja 1. Reutiliza as ações de domínio já
implantadas; uma decisão indisponível é registrada e suprimida, sem seguir
para o menu ou agente genérico anterior. As demais lojas conservam seus fluxos.

Os lembretes, confirmação/opt-out, consultas de OS, pendências para atendente,
anexos e ações especializadas existentes continuam disponíveis. Valores de
parcelas continuam exigindo atendente. O modo completo não libera ferramentas
financeiras adicionais.

Nenhuma conversa é apagada ou reiniciada. A ingestão atualiza o modo da conversa
quando chega a próxima mensagem, preservando histórico, assunto e controles.
Uma pendência para atendente permite mudança de assunto. Mensagem manual
confirmada do lojista mantém a pausa por duas horas desde a última atividade.

## Publicação e ativação

1. Aplicar `20261001120000_whatsapp_inbound_processing_trace.sql`, se ainda
   ausente, e `20261003150000_whatsapp_store_one_full_redesign.sql`.
2. Publicar os arquivos desta implementação na aplicação principal.
3. Executar `node scripts/manage-whatsapp-full-redesign.mjs status`.
4. Executar `node scripts/manage-whatsapp-full-redesign.mjs activate`.

O script exige acesso local ao banco e credencial interna, lê o endpoint
autenticado `/api/whatsapp/redesign/capabilities` e só ativa após confirmar que
a produção contém o código compatível. Verifica canal conectado, automação/IA,
horário, trilha operacional, estado de handoff e RPC. Altera exclusivamente
`stores.id=1`, preservando todas as outras configurações. Não dispara mensagens,
reprocessa filas nem remove pausas humanas. O cache de captura vence em até 60s.

## Reversão

`node scripts/manage-whatsapp-full-redesign.mjs rollback` retorna somente a
Loja 1 ao piloto `shadow` com respostas seguras. Não apaga a memória nem altera
os controles humanos. A migração é compatível com ambos os modos.

## Validação

### Continuidade após a auditoria de 03/10/2026

No modo completo, um turno `ready`/`processing` sem decisão disponível deixa o
inbound em `received`, com marcador persistido `payload.redesignDeferred`.
O scheduler existente de `process-shadow` retoma uma entrada por execução,
com lease atômico de dois minutos e reavaliação dos controles atuais. Reutiliza
turnos já processados e a proteção existente de um outbound por inbound.
O envio da saída pendente usa a reconciliação já existente da VPS.

Em 03/10/2026, a leitura da VPS confirmou cron ativo a cada cinco minutos,
apontando para `process-shadow` com `storeId=1`, e execuções recentes com
HTTP 200 (17:55, 18:00, 18:05 e 18:10, horário de Brasília). Essa evidência
confirma o agendamento, sem comprovar uma retomada de mensagem adiada.

Mensagens substituídas por nova entrada do cliente, pendências com mais de
30 minutos ou cinco tentativas são encerradas com motivo na trilha. Falhas de
retomada mantêm a entrada disponível após vencer o lease. O caminho depende
do scheduler e da reconciliação ativos; não exige mudança no serviço da VPS.
Entradas antigas já `ignored` não são reabertas por esta correção.

Assuntos confiáveis intercalados durante um acompanhamento entram na decisão
do redesign; avaliações explícitas e reclamações mantêm suas ações próprias.
Handoffs desse caminho preservam o contexto pendente.

Reclamações confiáveis e pedidos de atendente entram no handoff do redesign
antes do bloqueio final, atualizando o acompanhamento para `handoff` e registrando
a interação sem criar pausa humana. Avaliações explícitas continuam no escritor
especializado. No texto canônico de horário, o expediente previsto é distinguido
da disponibilidade atual e inclui os intervalos oficiais do dia quando aplicáveis.

A resposta canônica de horário é permitida somente no modo completo, baseada
na decisão e agenda oficiais, se o provedor falhar ou omitir os horários
obrigatórios. Outros motivos de supressão e assuntos mantêm a política atual.

## Redução de logs de 14/10/2026

Esta redução deixa a resposta e a recuperação mais lentas. Não deixa de gravar
mensagem recebida nem evento de webhook. O webhook continua sendo o caminho
imediato. A reversão restaura os intervalos e as leituras repetidas; não apaga
conversa, handoff, inbound nem outbound.

Continua igual: janela de agregação de 20 segundos, espera de cumprimento de
60 segundos, inserção em `whatsapp_inbound_messages` e
`whatsapp_webhook_events`, cron de `process-shadow` e a consulta da maquininha
Pix. A segunda leitura de estado que acontece depois de gravar a decisão, perto
do fim de `resolveCustomerStatusInternal`, também permanece.

O ambiente efetivo do worker na VPS fica em `automation.env`, carregado pelo
Compose do serviço `whatsapp-automation`. Esse arquivo prevalece sobre o padrão
do código. Em 14/10/2026, às 19:01 no horário de São Paulo, as quatro chaves
abaixo foram gravadas nesse arquivo e somente o container `whatsapp_automation`
foi recriado, sem rebuild. O backup desse momento é
`automation.env.before-log-cut-20261014T220155Z`. O backup de 01/10/2026,
`automation.env.before-reconciliation-20261001T230748Z`, continua no mesmo
diretório e ainda tem o intervalo de 5 minutos. A imagem em execução nessa
recriação era a anterior; os intervalos novos entram por essas variáveis. O
aviso sonoro e os caches de 60 segundos continuam dependendo do deploy do app.

O aviso sonoro e os caches de 60 segundos entram com o deploy do app na Vercel.
O worker da VPS não os aplica.

### O que mudou

| Peça | Antes | Agora |
| --- | --- | --- |
| Reconciliação | a cada 5 minutos (`300000`), relendo 24 horas (`86400000`) | a cada 30 minutos (`1800000`), relendo 3 horas (`10800000`) |
| Vigilante da conexão | a cada 1 minuto (`60000`) | a cada 5 minutos (`300000`) |
| Lista de canais ativos | a cada 1 minuto (`60000`) | a cada 5 minutos (`300000`) |
| Aviso sonoro do painel | a cada 30 segundos, e a cada 2 minutos com a aba oculta | a cada 3 minutos, somente com a aba visível |
| Canal e ficha da loja no atendimento | lidos de novo em cada mensagem | reaproveitados por até 60 segundos |
| Estado da conversa no mesmo atendimento | lido duas vezes antes de decidir | a segunda leitura usa a primeira |
| Memória do redesign no mesmo processamento | cada fragmento busca a conversa de novo | a busca vale para os fragmentos daquela execução |
| Nova tentativa depois de falha | podia refazer o atendimento | se a resposta já estiver gravada, só entrega essa resposta |

A janela da reconciliação nunca fica menor que o dobro do intervalo. O piso de
30 segundos permanece, então o ambiente ainda pode acelerar de propósito. Uma
mensagem perdida pelo webhook continua dentro da varredura seguinte, desde que
o lookback não seja encurtado abaixo desse dobro. O que demora mais é perceber
essa perda, perceber queda de conexão, ouvir o aviso sonoro e aplicar uma
mudança de configuração da loja ou do canal.

O cache de conversas do redesign vive só na instância criada para aquela
execução (`captureWhatsAppShadowInbound` ou o atendimento que carrega o turno).
Não é um cache global de 60 segundos. Lista vazia não fica memorizada, para uma
inserção concorrente (`23505`) ainda achar a conversa. Troca de modo e conflito
de inserção apagam a chave.

### Como reverter

Reverter os cinco blocos juntos. Reverter só o intervalo e deixar o lookback
de 3 horas pode fazer uma mensagem perdida sair da janela se alguém voltar o
intervalo para um valor maior que 90 minutos. O teste
`tests/whatsapp-reconciliation-interval.test.mjs` compara o texto exato das
constantes e do exemplo; ele precisa voltar junto com `server.mjs`.

1. No worker, voltar o exemplo
   `services/whatsapp-automation/deploy/whatsapp-automation.env.example`, o
   `automation.env` da VPS e os padrões de `services/whatsapp-automation/server.mjs`:

```text
WHATSAPP_WATCHDOG_INTERVAL_MS=60000
WHATSAPP_RECONCILIATION_INTERVAL_MS=300000
WHATSAPP_RECONCILIATION_LOOKBACK_MS=86400000
WHATSAPP_ACTIVE_CHANNELS_REFRESH_MS=60000
```

   As linhas anteriores do código, sem o piso de duas vezes o intervalo, são:

```js
const WATCHDOG_INTERVAL_MS = Math.max(30000, Number(process.env.WHATSAPP_WATCHDOG_INTERVAL_MS || 60000))
const RECONCILIATION_INTERVAL_MS = Math.max(30000, Number(process.env.WHATSAPP_RECONCILIATION_INTERVAL_MS || 300000))
const RECONCILIATION_LOOKBACK_MS = Math.max(60000, Number(process.env.WHATSAPP_RECONCILIATION_LOOKBACK_MS || 24 * 60 * 60 * 1000))
const ACTIVE_CHANNELS_REFRESH_MS = Math.max(30000, Number(process.env.WHATSAPP_ACTIVE_CHANNELS_REFRESH_MS || 60000))
```

   Recriar somente o serviço `whatsapp-automation`. O log de subida deve
   mostrar `interval_ms=300000` na reconciliação, `lookback_ms=86400000` e
   `interval_ms=60000` no vigilante.

2. No painel, em `src/components/whatsapp/WhatsAppSoundAlertMonitor.tsx`,
   restaurar as duas constantes e a escolha pela visibilidade:

```tsx
const VISIBLE_POLL_INTERVAL_MS = 30_000
const HIDDEN_POLL_INTERVAL_MS = 120_000
```

   Remover o retorno antecipado quando `visibilityState !== 'visible'`. O
   intervalo volta a ser:

```tsx
const timer = window.setInterval(
  checkForNewMessage,
  visibilityState === 'visible' ? VISIBLE_POLL_INTERVAL_MS : HIDDEN_POLL_INTERVAL_MS,
)
```

3. Em `src/lib/whatsapp/customer-status.ts`, remover
   `ACTIVE_CHANNEL_CACHE_MS`, `activeChannelCache`, `STORE_PROFILE_CACHE_MS` e
   `storeProfileCache`. `findActiveChannel` volta a `return data ?? null`.
   `loadStoreProfile` volta a `return data as StoreProfileRow`.
   `loadStoreWhatsAppSettings` volta a ler só `stores.settings`, sem passar
   pelo perfil. Na decisão, depois de `optionFromMessage`, voltar:

```ts
let state = await findConversationState(channel.id, normalizedPhone)
```

   `preferenceState` continua existindo para o comando de lembrete; não apague
   essa primeira leitura. A leitura posterior, depois que o atendimento grava
   estado, também fica. Não remova o import de
   `WHATSAPP_OPENAI_ORDER_STATUS_MODEL` nem a troca de modelo em
   `writeWhatsAppToolAgentReply`: isso é outra alteração no mesmo arquivo.

4. Em `src/lib/whatsapp/redesign/store.ts`, remover o campo
   `equivalentConversations`, o método `equivalentKey` e as chamadas
   `delete`/`set` em `getOrCreateConversation`. Em
   `findEquivalentConversations`, voltar a retornar o array filtrado direto,
   sem consultar nem gravar o mapa.

5. Em `processInboundWithRetry`, em `services/whatsapp-automation/server.mjs`,
   remover o bloco `if (attempt > 1)` que chama `/api/whatsapp/pending-reply`
   antes de `processInbound`, inclusive a variável `outboundAlreadySaved`. A
   tentativa volta a entrar no atendimento. A recuperação que já existia dentro
   de `processInbound` e em `recoverPendingReply` permanece.

## Pausa da resposta com a loja aberta

Com a loja aberta, o atendimento automático não responde assunto geral. A
mensagem recebida continua gravada. Continuam ativos o pedido de nota, a
conversa de quem está nesse pós-venda, o lembrete de vencimento e o comando
de sair ou voltar a receber lembrete. Fora do expediente o atendimento segue
como antes. Loja sem horário configurado também segue como antes.

A pausa acontece em `resolveCustomerStatusInternal`, em
`src/lib/whatsapp/customer-status.ts`, depois de gravar a mensagem e de tratar
o comando de lembrete. Se não há contexto de pós-venda na conversa nem um
pedido de nota enviado nos últimos 30 dias, a função retorna sem capturar a
memória do redesign. Se o turno seguinte seria o atendimento geral, ela
também retorna, em `useStoreOnePilot` e em `continueWithoutHoursOverride`.

### Como reverter

Remover os três retornos com o motivo `store_open_general_reply_paused` e a
função `hasRecentSentPostSaleFollowup`. Voltar a capturar a memória do
redesign logo depois do evento `inbound`, antes de ler o estado da conversa.
O envio do pedido de nota e o cron de vencimento não fazem parte desta pausa.

`npm run typecheck` e `npm run test:whatsapp-redesign` cobrem o código.
`supabase/tests/whatsapp_full_redesign_validation.sql` verifica a RPC em
transação revertida: mudança de assunto, preservação de pendência, pausa manual
de duas horas, reversão, isolamento de loja e proibição de envio pelo
processador de decisões. Não usa IA nem envia WhatsApp.
