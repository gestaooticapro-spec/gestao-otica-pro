# Alterações pendentes para o próximo deploy

- A troca imediata com produto cadastrado pede o PIN do funcionário responsável e registra ticket, baixa e histórico juntos. Mantém estoque negativo e impede duplicar a mesma tentativa na janela aberta; produtos externos permanecem em triagem sem baixa automática.

- A confirmação de entrega salva a data, libera os envelopes NFC vinculados e registra o histórico em uma única operação, evitando entrega confirmada com envelope preso após falha intermediária.

- Vendas iniciadas pelo Receituário ou tabela de lentes usam a loja da tela, com cliente, vendedor e acesso conferidos. Os itens ficam vinculados à loja da venda, inclusive quando um administrador opera outra loja da mesma empresa.

- O recebimento de parcelas identifica o cliente pelo nome cadastral e preserva a anotação da parcela separadamente. A busca de clientes do Receituário e da Expressa também encontra celular e telefone com ou sem máscara, respeitando a loja autorizada.

- O aviso de excedente no recebimento de parcelas explica a validação do saldo do carnê e o possível abatimento de várias parcelas, sem prometer amortização antes da confirmação.

- O recebimento manual de parcelas usa a data local, evitando registrar o dia seguinte à noite. A mesma data é usada no pagamento e na identificação da tentativa.

- A sugestão do primeiro vencimento do carnê mantém o dia correto no calendário local, inclusive à noite, na virada do ano e em meses mais curtos.

- A observação informada na renegociação do carnê é salva junto ao acordo, com autor e data, preservando os registros anteriores. Se o texto não puder ser gravado, a renegociação também não é confirmada.

- O carnê da Venda Expressa usa o cliente selecionado para completar documento e celular e seguir à autorização por PIN. Ao sair depois de criar a venda, a operação continua no mesmo registro pela Venda Experimental e a cesta da Expressa é limpa.

- A alteração da forma ou do parcelamento no Livro Caixa refaz os recebíveis pendentes junto com o pagamento, preservando o histórico. Lançamentos já recebidos ou conciliados exigem revisão financeira, e carteira, Pix integrado e carnê mantêm seus fluxos próprios.

- Finalizar uma venda exige que pagamentos e carnê cubram todo o valor, mesmo quando falta apenas um centavo. Parcelas futuras do carnê não impedem fechar uma venda cujo saldo já está coberto.

- A Venda Experimental bloqueia pagamentos acima de A Receber, e a Venda Expressa exige o total exato da cesta. Inclusive em dinheiro, o valor registrado deve ser líquido, sem o troco devolvido. A geração do Pix também respeita o saldo sem tolerância de um centavo excedente.

- Remover um pagamento direto comum atualiza seus recebíveis e o saldo da venda em uma única operação, preserva o histórico do lançamento e bloqueia exclusões de pagamentos Pix vinculados à conciliação integrada.

- A devolução integral de venda quitada e sem carnê confirma estoque, Crédito em Loja e comissões pendentes juntos, considera o desconto e impede devolução duplicada. Devoluções parciais, vendas com carnê e estorno em dinheiro ficam indisponíveis nesse fluxo.

- O uso de Crédito em Loja confirma o pagamento e o débito juntos; a adição de crédito grava saldo e extrato juntos. Repetir a mesma tentativa não duplica o lançamento, e pagamentos em crédito respeitam o saldo da carteira e da venda.

- Remover um pagamento em Crédito em Loja devolve o valor uma única vez à carteira de quem pagou, registra o estorno no extrato e atualiza o saldo da venda.

- A Venda Expressa bloqueia pagamentos inferiores ao total da cesta e orienta usar a Venda Experimental para pagamentos parciais.

- A NFC-e usa nome e contato somente quando o documento corresponde ao cadastro do cliente da venda. Documentos informados apenas para a nota são enviados sem os dados pessoais desse cliente e não alteram seu cadastro.
- A emissão de NFC-e exige sessão e acesso à loja, preserva o destinatário de tentativas já preparadas e permite informar CPF ou CNPJ somente para a nota, independentemente do tipo do cliente da venda.

- O sistema, as prévias compartilhadas e os documentos gerados passam a se apresentar como MB Optical.
- A ajuda por IA explica estoque, cadastros, XML, etiquetas e as telas de gestão, respeitando o perfil e os módulos da loja.
- A ajuda por IA explica o pós-venda, a assistência e os envios de WhatsApp, sem tratar tentativa de envio como mensagem lida pelo cliente.
- A ajuda por IA explica o laboratório, a gaveta e a entrega, inclusive quando a OS não aparece ou a venda ainda precisa ser fechada.
- A ajuda por IA explica como incluir produtos e preencher a OS na venda de óculos, distinguindo a ficha embutida da ficha separada conforme o botão da loja.
- A ajuda por IA explica como iniciar e retomar a venda de óculos, inclusive quando o botão está desabilitado, há avaliação aberta ou a loja está bloqueada.
- A ajuda por IA distingue recebimento de parcela, reversão, Pix pendente e contato de cobrança, sem tratar lembrete ou WhatsApp como pagamento.
- A ajuda por IA explica como gerar e renegociar o carnê, inclusive a entrada pedida depois de uma venda a prazo, sem registrar o mesmo valor duas vezes.
- A ajuda por IA orienta o pagamento direto da venda rápida e da venda experimental, a diferença para a parcela do carnê e a correção do valor sem usar o Livro Caixa para apagar o recebimento.
- A Central de Operações oferece ajuda por IA sobre o uso do sistema, com conversa contextual, atalhos e uma opção para relatar respostas que não ajudaram ou estão erradas.

- O painel da loja atualiza somente os handoffs do WhatsApp a cada 30 segundos. Alertas, aniversários, vencimentos e retornos permanecem até a próxima navegação.
- A lista de OS do tablet deixa de atualizar sozinha e passa a ter o botão Buscar OSs sem medidas.
- A abertura da venda deixa de baixar o catálogo completo de lentes, armações e tratamentos. A busca de produto na inclusão do item continua igual.

- Pontos de Atenção fica temporariamente pausado para medir o consumo de logs; os relatórios existentes são preservados e as análises retomam automaticamente em 17/10.

- O pós-venda pelo WhatsApp recupera os contatos recentes ainda não realizados e permite o primeiro contato de acompanhamentos abertos sem interação registrada. Os envios seguem a fila gradual, o horário da loja e as preferências do cliente; atendimentos já iniciados e casos concluídos são preservados.

- Na Loja 1, reclamações e pedidos de atendente durante um acompanhamento recebem encaminhamento pelo redesign e preservam o contexto. Respostas oficiais de horário distinguem o expediente previsto da situação atual da loja e informam os intervalos cadastrados.

- Na Loja 1, decisões de WhatsApp ainda em processamento permanecem pendentes para retomada, respeitando mensagens mais recentes e o atendimento humano. Perguntas intercaladas durante um acompanhamento seguem o redesign sem perder a pendência anterior. Se a redação da IA falhar em uma resposta de horário, o cliente recebe o horário oficial confirmado pelo sistema.

- O novo atendimento do WhatsApp passa a ser o padrão de todas as lojas. Cada loja continua decidindo se usa a automação e a IA, com seus próprios dados, horários e pausas de atendimento.

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
- Todas as chamadas de IA via API da OpenAI passam a usar o GPT-5.4 mini.
- Clientes Sumidos permite ajustar o período da última compra, classificar por nome, cidade, data da última compra e valor comprado, filtrar por telefone e situação no SPC, consultar dados do cliente, abrir o dossiê e retirar ou restaurar pessoas da lista; o dossiê retorna à tela de origem.
- Falhas ao atualizar o estado auxiliar da conversa no WhatsApp não bloqueiam o envio pela Evolution conectada; a falha continua registrada no log do servidor.
