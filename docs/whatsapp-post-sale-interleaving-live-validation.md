# Validação ao vivo: continuidade do pós-venda

Data: 01/10/2026. Escopo: Loja 1, conversa de teste autorizada, após o deploy informado pelo usuário. Este registro documenta um cenário específico; não declara concluída a etapa 5 do redesign.

## Cenário executado

1. O cliente recebeu o acompanhamento de pós-venda e adiou a resposta para perguntar sobre uma OS própria.
2. Em seguida, consultou uma OS de dependente.
3. Voltou ao assunto dos óculos retirados e informou que estava se adaptando bem; a IA pediu uma nota de 1 a 5.
4. Antes de dar a nota, perguntou se poderia retirar a OS própria naquele dia. A IA informou o estado atual da OS.
5. O cliente voltou à avaliação e informou explicitamente a nota 5.

Os protocolos, nomes, telefones e IDs internos usados na conversa e no banco foram omitidos deste documento.

## Conferência no banco e no WhatsApp

Uma consulta somente de leitura confirmou:

- o follow-up de pós-venda foi registrado como enviado;
- as mensagens do cliente neste cenário foram processadas;
- as respostas de consulta de OS, o pedido de avaliação e a confirmação da nota foram registradas como enviadas, cada uma associada à mensagem recebida correspondente;
- o registro de pós-venda associado à OS de teste ficou `Concluido`, com `avaliacao_cliente = 5`;
- foram gravadas interações para a resposta positiva ao acompanhamento e para a nota 5;
- a trilha da confirmação da nota indica a ação `record_post_sale_rating`, com validação semântica aceita.

O usuário confirmou que as mensagens chegaram ao WhatsApp. Portanto, neste caso, o estado de envio do banco e a conversa observada no aparelho concordam; a verificação do banco isoladamente não seria prova de entrega ao aparelho.

## Interpretação e limites

- O cenário passou: mudar para assuntos de OS não descartou a avaliação pendente, e a nota explícita posterior foi persistida.
- A pergunta sobre retirada no mesmo dia recebeu o estado atual da OS, sem resposta binária nem promessa de prazo. Isso é intencional: a lente ainda pode chegar ao longo do dia, então tanto “sim” quanto “não” poderiam ficar incorretos.
- O teste cobre um único número autorizado e um caminho positivo de adaptação/nota. Não prova todos os enunciados possíveis nem o comportamento após expiração do contexto.
- O teste cobriu uma única OS. Não verificou um follow-up que agrupe duas ou mais OSs do mesmo beneficiário. Embora o disparo mantenha a lista das OSs cobertas e crie acompanhamento para cada uma, o contexto conversacional inspecionado aparenta guardar somente a OS representativa. É necessário verificar se resposta positiva, nota, conclusão, handoff e interações são refletidos corretamente em cada OS do grupo, inclusive quando há mudança de assunto.
- Ainda não foram validados neste registro: adaptação negativa/reclamação e handoff, nota baixa, resposta ambígua, `PARAR`/opt-out ou lembrete de parcela intercalado com outros assuntos.
- Esse resultado aprova somente o recorte de continuidade do pós-venda. Não conclui a etapa 5 (consultas operacionais de OS/retirada) nem a migração geral do redesign.

## Próximo passo

Validar o recorte de lembrete de parcelas, mantendo fora do disparo quem já escolheu `PARAR`: testar uma resposta ao lembrete, uma mudança temporária de assunto e a retomada do assunto financeiro; verificar no banco a mensagem recebida, a decisão/ação, a resposta enviada e a preferência de lembretes. Testar a reclamação/adaptação negativa como cenário separado antes de considerar o comportamento de pós-venda completo.
