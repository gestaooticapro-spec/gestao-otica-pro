# Alterações pendentes para o próximo deploy

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
