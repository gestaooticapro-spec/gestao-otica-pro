# Auditoria da etapa 5: continuidade de OS

Data: 26/09/2026. Escopo: Loja 1, piloto de OS/retirada. O plano canônico continua sendo `WHATSAPP_IA_REDESIGN_PLAN.md`; este documento registra a distância entre o plano e o código, sem redefinir etapas.

## Evidência observada

- Sequência real: a pergunta sobre óculos pronto recebeu pedido de número; a resposta `OS 1017` recebeu outro pedido de CPF/número/nome. A OS existia na Loja 1.
- No turno `OS 1017`, o planejador de ferramentas falhou ao produzir JSON válido. A classificação posterior reconheceu `order_status`, mas o fluxo caiu no roteador legado e produziu `identifier_prompt`. Portanto, havia contexto textual, mas não houve execução bem-sucedida da consulta.
- Para a mesma conversa, a memória do redesign mostrava `activeTopic=order_status`, `humanControl=human_pending`, `pendingAction=awaiting_human`; o estado legado que governa a resposta real mostrava `waiting_identifier`. Essas duas leituras não são intercambiáveis.

## Lacunas de arquitetura

1. A decisão canônica do redesign ainda trata `order_status` como `human_handoff`; não possui ação operacional de consultar OS ou solicitar identificador. O piloto desvia dessa decisão para um agente de ferramentas, enquanto a memória pode continuar refletindo outro caminho.
2. Quando o agente falha, o processamento normal pode alcançar o roteador legado. Isso permite repetir uma solicitação já atendida pelo cliente. A contingência implementada nesta revisão limita esse caso para **OS numérica explícita**, mas não unifica a arquitetura.
3. A memória operacional mínima prevista no plano (busca já tentada, identificadores recebidos, tentativas e pergunta pendente) não está inteiramente representada/consumida como fonte única no caminho ao vivo.
4. O estado `silent`, `waiting_identifier` e as pausas do legado ainda participam do atendimento ao vivo. A conclusão da etapa 4 não significa que a etapa 5 ou a migração da etapa 6 estejam prontas.

## Decisão de continuidade

Continuar o redesign faz sentido **somente** se a etapa 5 passar a usar a mesma decisão e memória operacional tanto para escolher a ferramenta quanto para registrar o resultado enviado. Não ampliar para outras lojas nem declarar a etapa 5 concluída com base apenas no teste de uma OS. O conserto pontual desta revisão é uma rede de segurança, não o critério de aprovação.

Critérios para liberar a etapa 5: uma sequência completa de pergunta por telefone → pedido de identificador → identificador informado → consulta → resposta deve ser testada; a mesma sequência com OS inexistente não pode pedir o mesmo dado novamente; erro de JSON/tempo da IA precisa usar contingência explícita; após cada resposta, decisão, memória e estado efetivamente usado pelo envio devem concordar. As saídas devem ser humanas via IA no caminho normal; texto fixo só na contingência de falha real. Testes devem usar dados descartáveis ou telefone de teste autorizado, sem expor credenciais ou dados do cliente.

## Implementação posterior à auditoria

A ação `lookup_order_status` substitui o handoff proposto para uma classificação confiável de OS. A IA ainda escolhe a ferramenta aprovada; o sistema determina a transição a partir da consulta e usa a redação final controlada. O resultado de `request_identifier` ou `auto_reply` só entra no resumo após a confirmação de envio, por uma função SQL idempotente. O próximo turno usa essa pendência na memória para interpretar uma resposta curta. A migração precisa preceder o deploy do código. O piloto ao vivo ainda precisa confirmar a sequência completa antes de encerrar a etapa 5.
