# WhatsApp — fluxos de IA que precisam de correção

Registro iniciado em **06/10/2026**, a partir dos prints fornecidos pelo usuário e de consulta somente de leitura ao banco para o caso do Thiago.

Objetivo: guardar os casos para correção posterior, com evidência, comportamento esperado e critérios de validação. Este documento não representa correções implementadas.

### Atualização de implementação — 07/10/2026

As evidências históricas abaixo continuam preservadas. Foram preparadas correções locais para publicação:

- WA-01: classificação complementar de ajuste simples e encaminhamento com nota interna proporcional, sem registrar automaticamente adaptação ruim.
- WA-02 e WA-03: reconhecimento das confirmações dos prints quando o lembrete de parcela é a última interação relevante; perguntas, comprovantes e retirada explícita seguem outros caminhos.
- WA-04: reconstrução do texto no disparo, com dias atuais e revalidação de OSs/beneficiário. Contatos fora de 30 dias são cancelados. Mantida a proteção já existente para rejeição `exists: false`.
- WA-05 e WA-06: recuperação de acompanhamento aberto com contato confirmado até 30 dias e associação única; cumprimento retoma a pergunta sem marcar satisfação. A avaliação positiva seguinte usa a etapa de pós-venda, sem exigir encaminhamento humano.
- WA-07: status de envio visível no histórico normal. Pausas e bloqueios recebem justificativa em português; o código original fica nos detalhes técnicos.

A validação usa testes locais de contexto, decisões e respostas simuladas. Ainda é necessário acompanhar as conversas após a publicação; não houve envio real nem alteração de registros históricos para validar estes casos. Se houver vários acompanhamentos possíveis, a retomada automática não escolhe um deles. As causas históricas exatas de José, Carlos e Pamela continuam dependendo dos registros originais.

## Como ler as evidências

- **CLIENTE:** mensagem recebida do cliente.
- **OPERADOR:** mensagem escrita pela equipe, conforme esclarecimento do usuário. Não atribuir essas respostas à IA.
- **SISTEMA:** registro de saída automática no painel. A presença da bolha não comprova que a mensagem chegou ao WhatsApp; conferir o status de envio.
- **Alerta interno ou diagnóstico de bloqueio:** evidência de uma decisão do sistema, mas não revela sozinho toda a classificação, a memória ou a causa técnica.

Os casos de setembro podem ter ocorrido antes de alterações recentes. Antes de corrigir, reproduzir cada cenário no fluxo atualmente publicado e verificar o que já foi resolvido. Distinguir sempre decisão da IA, validação, automação de disparo e resposta humana.

Nenhuma credencial, telefone ou documento pessoal foi incluído. Os identificadores internos do caso do Thiago foram mantidos para permitir investigação posterior. Horários abaixo seguem Brasília, como nos prints.

## Visão geral

| Caso | Fluxo | Problema observado | Evidência e situação |
| --- | --- | --- | --- |
| WA-01 | Pós-venda / ajuste | Avaliação positiva com ajuste simples marcada como reclamação/adaptação ruim | Alerta do sistema visível; classificação completa ainda não consultada |
| WA-02 | Parcela / visita à loja | Continuidade do assunto financeiro não aparece; equipe responde sobre retirada/agendamento | Print; decisão da IA ainda precisa ser consultada |
| WA-03 | Parcela / confirmação | Cliente confirma que vai providenciar; equipe precisa continuar o atendimento | Print; decisão da IA ainda precisa ser consultada |
| WA-04 | Disparo / recuperação de pós-venda | Nova tentativa reutiliza texto antigo com tempo de retirada desatualizado | Confirmado no banco para o Thiago |
| WA-05 | Pós-venda / saudação | Resposta genérica abandona o assunto de adaptação | Resposta do SISTEMA visível no caso da Pamela |
| WA-06 | Pós-venda / avaliação positiva | Resposta bloqueada por exigência de encaminhamento humano | Diagnóstico visível no caso da Pamela |
| WA-07 | Painel / status de envio | Saídas com falha aparecem como mensagens comuns, sugerindo contato efetivo | Confirmado no banco para as três saídas do print do Thiago |

## WA-01 — ajuste simples tratado como adaptação ruim

**Cliente:** Clóvis. **Data:** 15/09/2026.

### Sequência observada

1. SISTEMA, 10:48:06: pergunta como está a adaptação, após informar que os óculos foram retirados há 6 dias.
2. CLIENTE: “Bom dia”.
3. CLIENTE, 10:56:44: “Está bom, / Só vo leva ele Pra da uma ajustada aperta mais um pouco”.
4. Alerta interno: “Cliente sinalizou reclamacao/adaptacao ruim no pos-venda automatico.”
5. OPERADOR, 10:57:11: pede desculpas e informa encaminhamento com prioridade. Essa resposta é da equipe.

### O que precisa melhorar

O cliente afirma que está bom e menciona um ajuste da armação. A leitura mais provável é adaptação positiva com necessidade de ajuste simples. O alerta apresentado não preserva essa nuance e pode orientar a equipe a tratar a conversa como reclamação.

Não há no trecho uma queixa explícita de visão ruim, dor, tontura ou insatisfação com as lentes. A causa técnica do alerta ainda deve ser conferida nos registros.

### Comportamento esperado e validação

- Reconhecer a avaliação positiva e o pedido de ajuste na mesma mensagem.
- Responder de forma proporcional e contextual, oferecendo continuidade para o ajuste sem inventar agendamento ou prioridade.
- Não marcar automaticamente adaptação ruim apenas por palavras como “ajustar” ou “apertar”.
- Preservar encaminhamento humano quando houver reclamação real, dúvida que exija avaliação da equipe ou pedido explícito de atendente.
- Testar “Está bom, só precisa apertar a armação” e comparar com “Não consigo enxergar direito” e “Está me dando tontura”. As situações não devem receber a mesma classificação.

## WA-02 — resposta a lembrete de parcela perde o assunto financeiro

**Cliente:** José. **Data:** 07/09/2026.

### Sequência observada

1. SISTEMA, 09:30:50: lembrete da parcela 1/4, com vencimento em 08/09/2026.
2. CLIENTE, 11:35:54: “Amanhã vou passar aí.ok 👋”.
3. OPERADOR, 11:36:19: “Certo! Vou acionar a equipe para verificar sua retirada/agendamento. Um momento.”

### O que está comprovado e o que falta investigar

A resposta de retirada/agendamento foi escrita pela equipe. O print não comprova que a IA classificou a mensagem dessa maneira, nem permite afirmar por que não aparece uma resposta automática entre a mensagem do cliente e a intervenção humana.

No contexto do lembrete, a interpretação mais provável é uma intenção de comparecer à loja relacionada à parcela. Isso não equivale a pagamento realizado, nem a retirada de óculos confirmada.

### Comportamento esperado e validação

- Usar o lembrete financeiro como contexto para compreender a visita mencionada pelo cliente.
- Reconhecer a intenção sem afirmar que a parcela foi paga ou que um agendamento foi criado.
- Não trocar para retirada/OS sem evidência de mudança de assunto.
- Consultar o registro da mensagem recebida, o controle humano vigente e a eventual decisão da IA antes de atribuir uma causa.
- Reproduzir “Amanhã vou passar aí” após um lembrete de parcela e comparar com “Amanhã vou passar aí buscar meus óculos”.

## WA-03 — confirmação simples de parcela não tem continuidade automática visível

**Cliente:** Carlos. **Data:** 04/09/2026.

### Sequência observada

1. SISTEMA, 09:30:27: lembrete da parcela 4/4, com vencimento em 06/09/2026.
2. CLIENTE, 10:57:27: “Vou providenciar”.
3. OPERADOR, 10:57:42: informa que encontrou o financeiro relacionado ao número e que chamará a equipe.

### O que precisa melhorar

A mensagem do cliente é uma confirmação curta, coerente com o lembrete anterior. O print não mostra uma pergunta financeira, pedido de atendente ou comprovante de pagamento que, por si só, justifique encaminhamento.

A mensagem seguinte é humana. Ainda falta verificar se a IA ficou em silêncio, foi bloqueada por controle humano, propôs encaminhamento ou teve outra decisão.

### Comportamento esperado e validação

- Reconhecer a confirmação no contexto da parcela e concluir naturalmente esse turno, sem procurar um novo assunto.
- Não dar baixa, confirmar recebimento ou criar uma promessa formal de pagamento com base apenas em “Vou providenciar”.
- Não exigir atendimento humano para toda resposta a lembrete financeiro.
- Reproduzir “Vou providenciar”, “Pode deixar” e “Obrigado pelo aviso”; testar separadamente “Já paguei, segue o comprovante”, que exige outro tratamento.

## WA-04 — Thiago: recuperação de contato antigo com texto desatualizado

**Loja:** 1. **Cadastro consultado:** 6087. **Consulta:** 06/10/2026.

### Vendas e OSs confirmadas no banco

| Venda | Data da venda | OSs | Beneficiário | Entrega registrada |
| --- | --- | --- | --- | --- |
| 13598 | 02/09/2026 | 865 e 866 | Thiago, titular | Ambas em 15/09/2026, 12:16 |
| 13931 | 06/10/2026 | 1079 | Bernardo, dependente | Sem entrega registrada na consulta |

O pós-venda consultado é o registro **539**, criado em 22/09/2026, com OS representante **866** e cobertura **[866, 865]**. Ele está vinculado à venda antiga e aos dois pares do titular. A OS 1079 não faz parte desse agrupamento.

### Saídas do print conferidas no banco

| Registro de saída | Data e hora | Origem / assunto | Status consultado | Confirmação de envio |
| --- | --- | --- | --- | --- |
| 15269 | 22/09/2026, 09:48:51 | Pós-venda 539, OSs 865 e 866 | `failed` | `sent_at` vazio e sem identificador de mensagem do provedor |
| 18875 | 06/10/2026, 11:34:30 | Aviso manual da equipe sobre os óculos do Bernardo | `failed` | `sent_at` vazio e sem identificador de mensagem do provedor |
| 18983 | 06/10/2026, 14:51:56 | Nova tentativa do mesmo pós-venda 539 | `failed` | `sent_at` vazio e sem identificador de mensagem do provedor |

O pós-venda 539 guarda `recoveryAttempts = 1` e `recoveryAt = 06/10/2026, 14:41:26`. Na consulta, estava em `failed`, apontando para a saída 18983, sem `sent_at`. Seu texto permanece:

> Olá, THIAGO! Aqui é da ótica.
>
> Já faz 6 dias que seus 2 pares de óculos foram retirados e queríamos saber como está a adaptação.

O campo `daysSinceDelivery` também permanece em **6**. Em 06/10, a entrega de 15/09 já tinha aproximadamente **21 dias**.

Nas saídas de pós-venda **15269** e **18983**, o erro registrado contém resposta do provedor com **`exists: false`**. Isso confirma a rejeição da tentativa pelo provedor, não uma conclusão independente sobre a situação atual do WhatsApp do cliente. A saída manual **18875** também falhou, mas não contém esse mesmo marcador; sua causa específica permanece para investigação.

Não foram encontradas interações de contato em `post_sales_interactions` para os acompanhamentos **542** e **543**, ambos em `Em Acompanhamento` na consulta.

### Conclusão sustentada pela consulta

- Não foi encontrada mistura da venda nova com o agrupamento desse pós-venda: as OSs cobertas são as antigas.
- Os dois registros automáticos correspondem ao mesmo acompanhamento, com evidência de recuperação, e reutilizam o texto antigo.
- Não há envio confirmado nos três registros consultados. Portanto, não registrar o caso como duas mensagens de pós-venda efetivamente entregues ao cliente.
- O aviso manual da equipe e o pós-venda antigo aparecem na mesma conversa, mas tratam de beneficiários e pedidos diferentes. A continuidade precisa distinguir esses assuntos.

### Pontos para corrigir ou confirmar

- Recalcular o tempo desde a entrega ao preparar uma nova tentativa; se o contato já estiver fora da janela adequada, cancelar ou reformular conforme a regra de negócio.
- Tratar a rejeição de destinatário registrada pelo provedor antes de repetir a tentativa; encaminhar a pendência para revisão ou confirmação cadastral.
- Conferir a versão publicada e o histórico da recuperação. O código local já contém uma proteção para respostas do provedor com `exists: false`; não presumir que essa proteção estava publicada nas tentativas observadas.
- Preservar o vínculo por OS, venda e beneficiário; uma venda nova não deve reiniciar o pós-venda das OSs antigas.
- Não confundir falha de entrega ou recuperação de fila com falha de interpretação da IA.

### Critérios de validação

- Uma tentativa em 06/10 referente à entrega de 15/09 não informa “há 6 dias”.
- Uma saída sem confirmação não conclui contato nem é apresentada como enviada.
- Uma saída confirmada não é reenviada como primeiro contato.
- Falha definitiva de destinatário interrompe novas tentativas e vira pendência para revisão cadastral.
- A OS 1079, ainda sem entrega registrada, não entra no acompanhamento de adaptação das OSs 865 e 866.

## WA-05 — Pamela: saudação reinicia uma conversa de pós-venda

### Sequência observada

1. SISTEMA, 21/09/2026, 11:18:50: pergunta sobre a adaptação após informar a retirada há 7 dias.
2. CLIENTE, 06/10/2026, 12:27:51: “Ola / Todo Bom ? / Tudo bom gracas a Deus”.
3. SISTEMA, 12:28:11: “Olá! Que bom saber que tudo está bem. Como posso ajudar você hoje na Ótica Prisma Guaira?”

### O que precisa melhorar

A saudação do cliente, isoladamente, é ambígua. A resposta automática, porém, abre um atendimento genérico sem aproveitar a pergunta anterior sobre adaptação. O intervalo de 15 dias deve ser considerado na investigação da memória e da associação ao pós-venda.

Não concluir automaticamente que “Tudo bom” avalia os óculos. Quando houver um acompanhamento pendente identificável, a IA pode cumprimentar e retomar a pergunta de adaptação de forma natural. Se houver mais de um acompanhamento possível, esclarecer a referência antes de registrar uma avaliação.

### Critérios de validação

- Cumprimentar sem apagar o assunto pendente identificável.
- Não marcar adaptação positiva apenas por “Tudo bom”.
- Testar resposta imediata e resposta 15 dias depois, conferindo a política de memória e a associação com a OS correta.
- Preservar uma mudança explícita de assunto, caso o cliente faça uma pergunta nova.

## WA-06 — Pamela: avaliação positiva bloqueada por exigência de encaminhamento

### Sequência observada

Após a sequência do WA-05, CLIENTE, 06/10/2026, 12:28:24:

> Súper bem a adaptação

O painel mostra “RESPOSTA AUTOMÁTICA NÃO ENVIADA” e o motivo:

> a resposta não informou que um atendente continuará o atendimento.

### O que está comprovado e o que falta investigar

Há uma avaliação explicitamente positiva da adaptação e um bloqueio por falta de informação de encaminhamento humano. O trecho não mostra um pedido de atendente ou uma reclamação.

O diagnóstico é compatível com desencontro entre intenção, ação aprovada e validação da resposta. Ele não comprova se a classificação, a decisão de encaminhar ou a validação estava errada. Essa causa precisa ser identificada nos registros.

### Comportamento esperado e validação

- Reconhecer a avaliação positiva, preservar a OS associada e continuar a etapa de pós-venda apropriada.
- Se a etapa exigir nota e ela ainda não tiver sido coletada, pedir a avaliação; se já estiver concluída, reconhecer sem repetir perguntas.
- Exigir informação de continuidade humana somente quando houver encaminhamento válido.
- Preservar controle humano vigente. Se ele impedir a resposta automática, registrar esse motivo de forma coerente.
- Reproduzir o diálogo inteiro, incluindo saudação, resposta genérica e “Super bem a adaptação”; não testar apenas a frase final isolada.
- Conferir intenção, ação, autoridade de resposta, estado anterior e motivo do bloqueio para localizar o desencontro.

## WA-07 — painel precisa distinguir tentativa de envio e contato confirmado

O caso do Thiago comprova que três bolhas comuns do print correspondem a saídas com falha, sem confirmação de envio. Esse problema interfere na investigação: quem lê a conversa pode interpretar uma tentativa como algo que o cliente recebeu.

### Comportamento esperado e validação

- Mostrar de forma clara mensagens pendentes, enviando, com falha e canceladas, incluindo saídas manuais da equipe.
- Distinguir origem da mensagem de resultado do envio: “SISTEMA” e “OPERADOR” não são status de entrega.
- Reservar confirmação de entrega/leitura para evidência específica do provedor; `sent` não comprova leitura.
- Permitir que a equipe entenda uma falha sem precisar abrir todos os detalhes técnicos.
- Usar as saídas 15269, 18875 e 18983 como referência de investigação para validar a apresentação de falhas.

## Ordem sugerida para as próximas correções

1. **WA-04 e WA-07:** evitar texto antigo em recuperação e tornar falhas de envio visíveis. A consulta ao banco já sustenta esses problemas.
2. **WA-06:** localizar o desencontro que bloqueia uma avaliação positiva.
3. **WA-01 e WA-05:** preservar nuances e continuidade do pós-venda.
4. **WA-02 e WA-03:** consultar decisões e controle humano antes de atribuir falha à IA; validar respostas curtas após lembretes de parcela.

## Referências para investigação

- `src/lib/whatsapp/post-sale-followups.ts`: agrupamento de OSs, montagem do texto, disparo e recuperação.
- `src/lib/whatsapp/customer-status.ts` e `src/lib/whatsapp/redesign/`: interpretação, memória, decisão e validação da resposta.
- `src/lib/whatsapp/installment-reminders.ts` e `src/lib/whatsapp/automated-conversation-context.ts`: contexto de lembretes financeiros.
- `src/lib/actions/whatsapp-operator.actions.ts` e `src/components/modals/WhatsAppOperatorModal.tsx`: origem e status exibidos no histórico.
- Banco: `service_orders`, `vendas`, `whatsapp_post_sale_followups`, `whatsapp_outbound_messages`, `whatsapp_inbound_messages`, `whatsapp_ai_logs` e registros do redesign.

As consultas desta análise foram somente de leitura. Nenhum dado, fluxo, envio, versão ou registro de release foi alterado para produzir este documento.
