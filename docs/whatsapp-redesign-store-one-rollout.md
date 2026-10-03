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

`npm run typecheck` e `npm run test:whatsapp-redesign` cobrem o código.
`supabase/tests/whatsapp_full_redesign_validation.sql` verifica a RPC em
transação revertida: mudança de assunto, preservação de pendência, pausa manual
de duas horas, reversão, isolamento de loja e proibição de envio pelo
processador de decisões. Não usa IA nem envia WhatsApp.
