# Alterações pendentes para o próximo deploy

- Na Loja 1, consultar a OS de outra pessoa não troca a identificação associada ao telefone; o vínculo automático exige correspondência única com o telefone cadastrado.
- Na Loja 1, perguntas sobre o andamento dos óculos consultam o pedido e mantêm o contexto quando o cliente informa o número ou CPF. Havendo até duas OS, a resposta informa o número, o nome do dependente ou do cliente cadastrado e a situação de cada uma; sem nome disponível, não atribui a OS a um titular genérico. Se o pedido informado não for localizado, a equipe continua a verificação sem repetir a pergunta.
- Quando uma resposta automática é suprimida por segurança ou pausa humana, o WhatsApp Operacional informa o motivo na própria mensagem.
- Na Loja 1, um acompanhamento de pós-venda permanece pendente enquanto a conversa trata de outros assuntos; mensagens ambíguas são silenciadas sem criar pausa humana, e a nota só é gravada quando explícita na etapa de avaliação.
- Handoffs automáticos do WhatsApp ficam como pendência para a equipe e não silenciam novas mensagens do cliente. `human_pause` só é ativado por mensagem manual confirmada do lojista e expira duas horas após a última mensagem; fila operacional, retenção e elegibilidade do pós-venda seguem a mesma regra.
- A OS fictícia 1043 da Loja 1 pode iniciar um disparo de teste isolado, confirmado pelo telefone cadastrado, mesmo fora do expediente; os disparos normais continuam respeitando o horário da loja.
