# Redesign como padrao do WhatsApp

O redesign completo e o motor padrao do programa em todas as lojas. A loja
escolhe se utiliza o WhatsApp, a automacao e a IA nas configuracoes existentes;
nao escolhe entre redesign, sombra ou fluxo anterior. Nenhuma opcao de automacao,
IA, campanha, agenda ou dado oficial e ligada ou copiada por esta entrega.

## Configuracao e atendimento

- `whatsapp_automation.enabled=false` continua desligando a automacao.
- `ai_responder.enabled=true` continua sendo necessario para atendimento por IA.
- Os campos antigos `ai_redesign.mode` e `safe_replies_enabled` permanecem no
  cadastro como historico, mas nao determinam o motor. Ausencia de campos,
  `legacy`, `shadow` e flags desativadas passam a usar o redesign quando o
  atendimento estiver habilitado.
- Uma conversa existente muda seu modo persistido na proxima captura, mantendo
  memoria e controles. Turnos antigos de sombra ainda podem ser calculados;
  o processador de decisoes nunca envia mensagens por conta propria.
- O motor usa agenda, fuso, endereco, razao social, Pix, prompt e respostas de OS
  da propria loja. Pix ausente nunca usa chave de outra loja.
- `os_on_demand.enabled=false` continua impedindo consulta automatica de OS.
  Consultas aprovadas nao exigem ligar o agente generico `tools_enabled`.
- Lembretes e primeiros contatos de pos-venda mantem suas opcoes individuais;
  acompanhamentos confirmados preservam o contexto. Valores de parcelas exigem equipe.
- Pausas humanas e `force_human` continuam bloqueando o atendimento. Mantem-se
  a pausa de assuntos gerais com loja aberta e as excecoes existentes de
  acompanhamento/lembretes. Encaminhamentos usam a abertura da propria loja.
- Consulta por nome completo exige cadastro unico na mesma loja e nao troca o
  titular do WhatsApp. Telefone ambiguo nao e associado automaticamente.

## Configuracoes conferidas em 30/10/2026

A consulta foi somente de leitura. A publicacao nao altera esses controles:

| Loja | Efeito do padrao apos a publicacao |
| --- | --- |
| 1 | Continua no redesign com IA e canal conectado. |
| 2 | Continua com automacao desligada e sem IA habilitada. |
| 3 | Usa o redesign automaticamente com a IA e canal ja habilitados; sem chave Pix cadastrada, nao informa chave oficial. |
| 4 | Continua com IA e consultas de OS desligadas e canal desconectado. |
| 5 | Continua com automacao/IA desligadas, canal desconectado e sem agenda. |
| 7 | Continua sem canal, agenda ou configuracao de atendimento. |

Novas lojas usam o mesmo motor quando configurarem seu WhatsApp e habilitarem
seu atendimento, sem configuracao adicional de redesign.

## Publicacao

1. Aplicar `20261030120000_whatsapp_full_redesign_all_stores.sql`, preservando as
   migrations anteriores. A RPC aceita decisoes de outras lojas sem mudar
   configuracoes, memorias ou controles humanos.
2. Publicar o app. O endpoint autenticado de capacidades informa
   `decisionProcessorVersion=3`, `fullRoutingScope=all_stores`,
   `defaultAttendanceEngine=redesign` e `requiresStoreRedesignActivation=false`.
3. Ajustar o scheduler existente para chamar `/api/whatsapp/redesign/process-shadow`
   sem `storeId=1`, ou abranger todas as lojas atendidas separadamente.
   Com `storeId`, a chamada continua limitada a essa loja.
4. Conferir canal e configuracoes e fazer a verificacao operacional do atendimento.

Nao ha etapa de ativacao de redesign por loja. O script
`node scripts/manage-whatsapp-full-redesign.mjs status <storeId>` e somente uma
consulta de requisitos. `activate` e `rollback` sao recusados antes de acessar o
banco. O script antigo do piloto tambem recusa `enable`/`disable`.
Para desligar o atendimento, usar os controles de WhatsApp/automacao/IA existentes.
Uma reversao de software pertence ao deploy, sem transformar o motor em escolha
por loja. Os caches das configuracoes operacionais continuam com ate 60 segundos.
A reconciliacao e o envio pendente existentes devem continuar ativos; nao e
necessaria alteracao do servico de automacao nesta entrega.

## Recuperacao e validacao

A retomada consulta as opcoes atuais de automacao/IA e confirma canal, loja e
tenant da entrada. Flags antigas de redesign nao bloqueiam a recuperacao.
O lease atomico e a protecao de uma saida por inbound permanecem. A retomada
reavalia pausas e horarios; entradas superadas ou expiradas seguem a politica
existente. Mesmo telefone/ID do provedor em duas lojas nao mistura memorias.

Validacoes: `npm run typecheck`, `npm run test:whatsapp-redesign` e `npm test`.
Os testes incluem configuracoes ausentes, flags antigas, WhatsApp/IA desligados,
dados oficiais diferentes, horarios, pausas, filas e recuperacao concorrente.
`supabase/tests/whatsapp_full_redesign_validation.sql` cobre a RPC em duas lojas,
preservacao das memorias/pausas e proibicao de envio pelo processador.
A validacao SQL foi executada com a migration em transacao revertida; a migration
continua pendente de aplicacao definitiva. Nao houve envio real nesta tarefa.

## Arquivos da entrega

- Atendimento: `src/lib/whatsapp/customer-status.ts`,
  `src/lib/whatsapp/customer-link-policy.ts`, `src/lib/whatsapp/ai.ts` e
  `src/lib/store-modules.ts`.
- Motor em `src/lib/whatsapp/redesign/`: `rollout-policy.ts`,
  `safe-replies-pilot.ts`, `shadow-ingestion.ts`, `shadow-processor.ts`,
  `store.ts`, `system-decision.ts`, `order-status-live.ts` e `deferred-replies.ts`.
- Rotas: `src/app/api/whatsapp/redesign/capabilities/route.ts` e
  `src/app/api/whatsapp/redesign/process-shadow/route.ts`.
- Operacao: `scripts/manage-whatsapp-full-redesign.mjs`,
  `scripts/manage-whatsapp-redesign-stage4.ts` e
  `supabase/migrations/20261030120000_whatsapp_full_redesign_all_stores.sql`.
- Testes: `tests/whatsapp-redesign-multi-store.test.ts`,
  `tests/whatsapp-conversation-redesign-contract.test.ts`,
  `tests/whatsapp-redesign-safe-replies-pilot.test.ts`,
  `supabase/tests/whatsapp_full_redesign_validation.sql` e `package.json`.
- Documentacao e entrega: `README.md`, este guia,
  `docs/whatsapp-redesign-store-one-rollout.md` e `src/lib/release-history.ts`
  (somente um novo item em `PENDING_RELEASE_CHANGES`).
