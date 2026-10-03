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

`npm run typecheck` e `npm run test:whatsapp-redesign` cobrem o código.
`supabase/tests/whatsapp_full_redesign_validation.sql` verifica a RPC em
transação revertida: mudança de assunto, preservação de pendência, pausa manual
de duas horas, reversão, isolamento de loja e proibição de envio pelo
processador de decisões. Não usa IA nem envia WhatsApp.
