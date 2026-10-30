# Pendências identificadas nas auditorias

Este arquivo reúne possíveis erros e comportamentos que precisam de revisão após o trabalho atual na base de conhecimento e no assistente de uso. **Não corrigir agora para não perder o foco**, salvo se o usuário mudar essa prioridade. Acrescentar aqui os achados de auditorias futuras e atualizar cada situação quando houver verificação e correção.

Os itens abaixo vêm do relatório da auditoria de venda e pagamentos diretos compartilhado pelo usuário. São **relatos pendentes de verificação nesta conversa**, não confirmações independentes de falha. Antes de alterar regras financeiras, reproduzir ou conferir o código atual, avaliar efeitos e definir com o usuário o comportamento esperado.

## Venda e pagamentos diretos

### 1. Venda rápida com valor pago inferior ao total

- **Situação:** pendente de investigação e decisão.
- **Relato:** é possível editar o valor pago para menos que o total, mas a venda é gravada fechada e com saldo zero.
- **Risco a avaliar:** registrar uma venda como quitada quando parte do valor não foi recebida.
- **Próximo passo:** verificar fluxo e efeitos, esclarecer o comportamento desejado e definir como tratar diferença, parcelamento e eventual troco, quando aplicável.

### 2. Pagamento direto acima do saldo

- **Situação:** pendente de investigação e decisão.
- **Relato:** sem carnê, o servidor não recusa pagamento direto maior que **A Receber**.
- **Risco a avaliar:** registro de valor excedente ou inconsistência financeira.
- **Próximo passo:** verificar a validação efetiva e distinguir eventual troco de pagamentos superiores ao saldo antes de propor correção.

### 3. Remoção de pagamento em crédito em loja

- **Situação:** pendente de investigação e decisão.
- **Relato:** remover pagamento em **Crédito em Loja** não devolve o saldo à carteira no caminho de código auditado.
- **Risco a avaliar:** perda ou divergência do crédito do cliente.
- **Próximo passo:** conferir o ciclo completo da carteira, remoção e histórico; definir com o usuário a reversão esperada.

### 4. Finalização com carnê e saldo ainda a receber

- **Situação:** pendente de investigação e decisão.
- **Relato:** com carnê e **A Receber** positivo, **Finalizar Venda** permanece disponível.
- **Risco a avaliar:** fechamento de venda com saldo ainda não coberto por pagamento direto ou compromisso de carnê.
- **Próximo passo:** conferir o comportamento no servidor e na interface e definir a regra desejada.

### 5. Alteração de forma de pagamento no Livro Caixa

- **Situação:** pendente de investigação e decisão.
- **Relato:** alterar a forma no Livro Caixa não recria as parcelas de cartão ou cheque.
- **Risco a avaliar:** divergência entre forma de pagamento e os registros de parcelas relacionados.
- **Próximo passo:** verificar os efeitos dessa edição e definir se deve ser bloqueada, limitada ou acompanhada de ajuste.

### 6. Fluxo de devolução não auditado

- **Situação:** auditoria pendente; não há falha identificada neste item.
- **Relato:** a auditoria de venda e pagamentos não examinou o conteúdo da janela **Devolução**.
- **Próximo passo:** auditar esse fluxo separadamente, incluindo seus efeitos financeiros, antes de acrescentar orientações específicas à base.

### 7. Carnê da venda rápida não chega à autorização

- **Situação:** comportamento confirmado no código; correção adiada.
- **Comportamento observado:** em `PaymentModal`, a aba **Carnê** cria a venda ao selecionar o cliente e passa `customer={null}` para `FinanciamentoBox`. O botão **Gerar Carnê** exige documento e celular do objeto do cliente. Sem esse objeto, ele tenta abrir a janela de complemento, que só é renderizada quando o cliente existe. A autorização por PIN não abre.
- **Risco:** a venda já foi criada e a saída de estoque já foi registrada antes do carnê. A pessoa pode iniciar outra venda rápida para a mesma cesta.
- **Confirmado:** a seleção do cliente chama `criarVendaParcialCarnê`, que grava a venda em aberto e registra a saída. O bloqueio está no botão de geração, não na criação da venda.
- **Decisão pendente:** corrigir a tela da venda rápida para concluir o carnê ou orientar a operação a continuar somente pela venda experimental.

### 8. Observação da renegociação não é gravada

- **Situação:** comportamento confirmado no código; correção adiada.
- **Comportamento observado:** o formulário de renegociação mostra o campo **Observação**, mas `renegociarFinanciamentoLoja` não envia esse texto. A criação do carnê grava a observação; a renegociação não.
- **Risco:** a equipe pode acreditar que uma ressalva ficou registrada no acordo.
- **Confirmado:** o payload da renegociação contém identificadores e parcelas, sem observação.
- **Decisão pendente:** gravar a observação no histórico da renegociação ou retirar o campo dessa tela.

### 9. Data sugerida do primeiro vencimento pode mudar de dia

- **Situação:** comportamento possível no código; correção adiada.
- **Comportamento observado:** a data inicial do carnê é calculada no fuso local e depois convertida com `toISOString()`. No fuso do Brasil, de madrugada, o dia sugerido pode ser o anterior.
- **Risco:** vencimento diferente do dia que a equipe espera, se ninguém conferir o campo.
- **Confirmado:** a função usa o mês seguinte e converte a data para UTC antes de preencher o campo.
- **Decisão pendente:** definir se a sugestão deve usar somente a data local, sem conversão UTC.

### 10. Data do recebimento da parcela usa o dia UTC

- **Situação:** comportamento confirmado no código; correção adiada.
- **Comportamento observado:** a janela de recebimento não deixa escolher a data. Ela envia `new Date().toISOString().split('T')[0]`, que é o dia em UTC.
- **Risco:** de madrugada no Brasil, o recebimento pode ficar no dia anterior.
- **Confirmado:** o formulário de `ParcelaSearchModal` acrescenta essa data pronta; não há campo de data na tela.
- **Decisão pendente:** definir se o recebimento deve usar a data local e se a equipe pode informar outro dia.

### 11. Excedente da parcela é anunciado antes da validação do carnê

- **Situação:** comportamento confirmado no código; correção adiada.
- **Comportamento observado:** se o principal passa do saldo da parcela, a tela avisa que o excedente será descontado da próxima. O servidor percorre as pendentes seguintes e recusa o recebimento quando o valor ultrapassa o saldo em aberto do carnê.
- **Risco:** a pessoa confirma esperando amortização e recebe erro, ou entende que só a próxima parcela será afetada quando várias podem ser.
- **Confirmado:** a mensagem está no modal; a recusa está em `receive_installment_payment_core`, com a exceção de principal acima do saldo do carnê.
- **Decisão pendente:** alinhar o aviso da tela com o limite real antes de confirmar.

### 12. Descrição do recebimento usa a observação da parcela

- **Situação:** comportamento confirmado no código; correção adiada.
- **Comportamento observado:** o pagamento da parcela grava em `obs` o texto `Cliente:` seguido de `financiamento_parcelas.obs`, não do nome do cliente.
- **Risco:** o Livro Caixa, que lê esse trecho como nome, pode mostrar a observação da parcela no lugar do cliente.
- **Confirmado:** o formato está em `receive_installment_payment_core`.
- **Decisão pendente:** gravar o nome do cliente e preservar a observação em outro campo.

### 13. Busca do Receituário não consulta telefone

- **Situação:** comportamento confirmado no código; correção adiada.
- **Comportamento observado:** o campo diz “Nome, CPF ou Telefone...”, mas `searchCustomersByName` procura nome, razão social, nome fantasia, CPF e CNPJ. `fone_movel` não entra na consulta.
- **Risco:** a equipe busca pelo telefone, não encontra o cadastro e cria outro cliente.
- **Confirmado:** o placeholder está em `atendimento/page.tsx`; a consulta está em `searchCustomersByName`.
- **Decisão pendente:** incluir o telefone na busca ou alterar o texto do campo.

### 14. Nova venda usa a loja do perfil, não a loja da tela

- **Situação:** comportamento confirmado no código; correção adiada.
- **Comportamento observado:** a busca do Receituário usa a loja da rota. `createNewVenda` grava `profile.store_id` e não recebe a loja exibida. O navegador depois abre a venda na loja da rota.
- **Risco:** um acesso administrativo em outra loja pode criar a venda na loja do perfil e a tela experimental da loja visitada não encontrá-la.
- **Confirmado:** a gravação está em `createNewVenda`; o redirecionamento usa o `storeId` da página.
- **Decisão pendente:** gravar a venda na loja da tela, depois de conferir o acesso do administrador.

### 15. Item da venda grava a loja do perfil

- **Situação:** comportamento confirmado no código; correção adiada.
- **Comportamento observado:** ao incluir um produto na venda experimental, `addVendaItem` consulta a venda pelo tenant, mas grava `store_id` com `profile.store_id`, não com a loja da venda.
- **Risco:** um administrador operando outra loja pode deixar o item vinculado à loja do perfil.
- **Confirmado:** a montagem do item está em `src/lib/actions/vendas.actions.ts`, na inclusão experimental.
- **Decisão pendente:** gravar o item com a loja da venda já conferida.

### 16. Entrega pode ficar salva e o envelope NFC continuar vinculado

- **Situação:** comportamento confirmado no código; correção adiada.
- **Comportamento observado:** `updateLabTracking` grava a data de entrega e, em seguida, tenta liberar o envelope. Se essa liberação falha, a resposta diz que a entrega foi salva, mas o envelope não foi liberado.
- **Risco:** a OS sai da lista de entrega e a tag continua presa à OS.
- **Confirmado:** o retorno de erro acontece depois do update em `src/lib/actions/lab.actions.ts`.
- **Decisão pendente:** definir se a entrega e a liberação da tag devem ser uma única operação.

### 17. Troca imediata usa identificador de funcionário vazio

- **Situação:** comportamento confirmado no código; correção adiada.
- **Comportamento observado:** ao abrir assistência **Imediata** com produto cadastrado, o ticket é criado e depois a baixa de estoque recebe `employee_id` a partir de `profile.id`. O perfil carregado só traz papel, loja e tenant, então esse identificador fica 0.
- **Risco:** o ticket pode existir e a baixa falhar, ou o estoque ser lançado sem o funcionário correto.
- **Confirmado:** a sequência está em `createAssistanceTicket`, em `src/lib/actions/assistance.actions.ts`.
- **Decisão pendente:** definir qual funcionário autoriza a baixa e se o ticket deve ser criado somente depois dela.

## Registro de novos achados

Para cada ponto futuro, registrar a origem, a situação, o comportamento relatado, o risco e o próximo passo. Preservar os itens até que tenham sido verificados e sua resolução ou decisão tenha sido registrada.
