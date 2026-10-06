# Alterações pendentes para o próximo deploy

- O pós-venda pelo WhatsApp recupera os contatos recentes ainda não realizados e permite o primeiro contato de acompanhamentos abertos sem interação registrada. Os envios seguem a fila gradual, o horário da loja e as preferências do cliente; atendimentos já iniciados e casos concluídos são preservados.

- Na Loja 1, reclamações e pedidos de atendente durante um acompanhamento recebem encaminhamento pelo redesign e preservam o contexto. Respostas oficiais de horário distinguem o expediente previsto da situação atual da loja e informam os intervalos cadastrados.

- Na Loja 1, decisões de WhatsApp ainda em processamento permanecem pendentes para retomada, respeitando mensagens mais recentes e o atendimento humano. Perguntas intercaladas durante um acompanhamento seguem o redesign sem perder a pendência anterior. Se a redação da IA falhar em uma resposta de horário, o cliente recebe o horário oficial confirmado pelo sistema.

- A Loja 1 pode usar o redesign como roteador completo do WhatsApp, preservando a memória da conversa, os tratamentos já implantados e a pausa de duas horas após a última mensagem manual do lojista. A ativação é exclusiva dessa loja.

- O pagamento da mensalidade exibe o QR Code no celular e informa com clareza quando os dados Pix ainda não estão disponíveis.
- Os recibos de parcela enviados pelo WhatsApp mostram somente o valor recebido naquela operação, sem incluir pagamentos anteriores da mesma parcela.
- Os resumos financeiros enviados em imagem ou PDF incluem pagamentos parciais, mostram o saldo de cada parcela, consideram valores transferidos ou renegociados nos totais em aberto e mantêm todos os carnês completos no PDF.

- Mensagens de WhatsApp que o webhook não entregar passam a ser recuperadas em cerca de cinco minutos.
- Na Loja 1, consultar a OS de outra pessoa não troca a identificação associada ao telefone; o vínculo automático exige correspondência única com o telefone cadastrado.
- Na Loja 1, perguntas sobre o andamento dos óculos consultam o pedido e mantêm o contexto quando o cliente informa o número ou CPF. Havendo até duas OS, a resposta informa o número, o nome do dependente ou do cliente cadastrado e a situação de cada uma; se a IA omitir um nome confirmado, ele é incluído na frase da OS correspondente e a resposta é validada novamente. Sem nome disponível, não atribui a OS a um titular genérico. Se o pedido informado não for localizado, a equipe continua a verificação sem repetir a pergunta.
- Quando uma resposta de status da Loja 1 é suprimida ou precisa de revisão, os logs da função registram o texto tentado e o motivo da validação, sem expor telefone ou CPF.
- Quando uma resposta automática é suprimida por segurança ou pausa humana, o WhatsApp Operacional informa o motivo na própria mensagem.
- Na Loja 1, um acompanhamento de pós-venda permanece pendente enquanto a conversa trata de outros assuntos; mensagens ambíguas são silenciadas sem criar pausa humana, e a nota só é gravada quando explícita na etapa de avaliação.
- O processamento das mensagens do WhatsApp mantém uma trilha operacional consultável, permitindo identificar em qual etapa uma resposta foi decidida, validada, enfileirada ou enviada.
- Handoffs automáticos do WhatsApp ficam como pendência para a equipe e não silenciam novas mensagens do cliente. `human_pause` só é ativado por mensagem manual confirmada do lojista e expira duas horas após a última mensagem; fila operacional, retenção e elegibilidade do pós-venda seguem a mesma regra.
- A OS fictícia 1043 da Loja 1 pode iniciar ou repetir um disparo de teste isolado, confirmado pelo telefone cadastrado, mesmo fora do expediente; a resposta informa que o provedor aceitou o envio, sem afirmar que a mensagem chegou ao aparelho. Os disparos normais continuam respeitando o horário da loja.
- A parcela reservada para teste da Loja 1 pode receber um lembrete por disparo isolado, após conferência do telefone cadastrado, sem processar nem despachar outras parcelas da fila global; o envio continua sujeito à elegibilidade e ao horário comercial.

- O texto de Visagismo explica somente os formatos e as proporcoes das armacoes, sem recomendacoes de cores.
- Encaminhamentos automáticos do WhatsApp enviam uma confirmação identificada da IAra ao cliente e permanecem pendentes para a equipe, sem ativar pausa humana.
- Respostas sobre o horário da loja informam o horário perguntado, seja a abertura, o fechamento ou o expediente completo.
- A Loja 1 pode enviar uma mensagem unica, identificada como teste, para validar o contexto de conversa do lembrete de cobranca da parcela reservada; o disparo confirma telefone, elegibilidade, opt-out e pausa humana sem alterar o registro normal do lembrete.
- A memória do redesign usa o horário do WhatsApp em cada mensagem agrupada, sem depender do relógio da VPS.
