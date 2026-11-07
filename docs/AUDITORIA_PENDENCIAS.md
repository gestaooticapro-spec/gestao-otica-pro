# Pendências identificadas nas auditorias

Este arquivo reúne possíveis erros e comportamentos que precisam de revisão após o trabalho atual na base de conhecimento e no assistente de uso. **Não corrigir agora para não perder o foco**, salvo se o usuário mudar essa prioridade. Acrescentar aqui os achados de auditorias futuras e atualizar cada situação quando houver verificação e correção.

Os itens abaixo vêm do relatório da auditoria de venda e pagamentos diretos compartilhado pelo usuário e das revisões posteriores. Cada item registra sua verificação e situação; relatos ainda não investigados não devem ser tratados como falhas confirmadas. Antes de alterar regras financeiras, reproduzir ou conferir o código atual, avaliar efeitos e definir com o usuário o comportamento esperado.

## Resumo atualizado em 07/11/2026

Onze itens têm correção implementada no código e validação local, dentro do escopo autorizado. A publicação do aplicativo e a validação operacional continuam pendentes de confirmação.

| Item | Correção implementada | Situação do banco |
| --- | --- | --- |
| 1 | Expressa bloqueia pagamento inferior ao total | Sem migration própria |
| 2 | Expressa exige total exato; Experimental bloqueia excedente de A Receber; registrar valor líquido após o troco | Migration 180000 aplicada conforme relato do usuário |
| 3 | Remoção de Crédito em Loja devolve saldo e registra extrato na mesma transação | Migration 140000 aplicada conforme relato do usuário |
| 4 | Fechamento exige cobertura integral por pagamentos diretos e carnê, sem tolerar centavo pendente | Migration 20261107120000 aplicada conforme relato do usuário |
| 5 | Alteração de forma e parcelamento recompõe somente recebíveis pendentes, com auditoria atômica | Migration 20261107140000 aplicada conforme relato do usuário |
| 6 | Devolução integral de venda quitada, sem carnê, com Crédito em Loja | Migration 160000 aplicada conforme relato do usuário |
| 7 | Cliente selecionado na Expressa chega ao complemento de cadastro e à autorização do carnê; saída retoma a mesma venda | Sem nova migration |
| 8 | Observação acompanha a renegociação e fica no registro do acordo, com autor/data e transação única | Nova migration 20261107160000 pendente de aplicação |
| 18 | Destinatário da NFC-e não mistura documento informado com os dados do cliente da venda | Sem nova migration nesta correção; validação real com provedor pendente |
| 19 | Criação e uso de crédito com gravações atômicas e proteção contra repetição | Migration 150000 aplicada conforme relato do usuário |
| 20 | Remoção de pagamento comum e recebíveis com recálculo e auditoria na mesma transação | Migration 170000 aplicada conforme relato do usuário |

As cinco migrations de 06/11 das correções acima foram informadas como aplicadas com sucesso pelo usuário. A migration 120000 de Clientes Sumidos também já havia sido aplicada, conforme seu relato. A migration de fechamento de 07/11 também foi informada como aplicada com sucesso nessa data. O ambiente do banco não foi especificado e não houve consulta independente ao schema instalado. Nenhuma dessas aplicações confirma a publicação do aplicativo.

Restam **9 itens** para investigação, decisão ou correção: **9 a 17**. O próximo na sequência é o **item 9 — data sugerida do primeiro vencimento pode mudar de dia**. Os detalhes e limites das correções permanecem registrados abaixo.

## Venda e pagamentos diretos

### 1. Venda Expressa com valor pago inferior ao total

- **Situação:** comportamento confirmado no código; correção local preparada em 06/11/2026, aguardando publicação.
- **Causa:** `PaymentModal` verificava somente se o pagamento era positivo; `finalizarVendaExpress` criava a venda fechada e com saldo zero sem comparar o pagamento com o total da cesta.
- **Decisão do usuário:** bloquear a conclusão com pagamento inferior ao total. Pagamentos parciais devem ser feitos pela Venda Experimental.
- **Correção:** validação em centavos antes do PIN, novamente ao receber a autorização e no servidor antes de qualquer gravação de cliente, venda, pagamento ou estoque. Dados inválidos também são recusados. O Pix Sicredi usa a mesma proteção para não aceitar um centavo a menos pela tolerância anterior.
- **Escopo conferido:** a Venda Experimental usa `addPagamento`, que recalcula o saldo após o recebimento e só fecha automaticamente a venda sem carnê quando o saldo está coberto. O bloqueio de excedentes e a orientação de registrar o valor líquido após o troco foram posteriormente implementados no item 2. A prote??o do fechamento manual foi implementada posteriormente no item 4, com nova migration ainda pendente de aplica??o.
- **Validação local:** 16 testes automatizados de validação, action e modal aprovados, usando banco e dependências sintéticos. Cobrem pagamento parcial, diferença de um centavo, dados inválidos, ausência de gravações no bloqueio, pagamento integral com saída de estoque e Pix Sicredi. Não houve alteração de vendas existentes nem validação em produção.
- **Checagens complementares:** `npm run typecheck` aprovado; `npm run test:sale-financial-boundary` aprovado com 20 testes (16 novos e 4 existentes). `npm run test:sicredi-pix-contracts` teve 2 testes aprovados e 1 falha preexistente: a linha 98 exige `valor_renegociado_saida` em `vendas.actions.ts`, mas o termo também está ausente no arquivo de `HEAD`, anterior a esta correção. Revisar esse contrato separadamente; não representa validação completa da integração Sicredi.

### 2. Pagamento direto acima do saldo

- **Situação:** confirmado no código; correção local preparada em 06/11/2026. Migration aplicada com sucesso conforme relato do usuário na mesma data; publicação e validação operacional pendentes de confirmação.
- **Causa:** `addPagamento` limitava pagamentos comuns somente quando havia `financiamento_id`. Na Expressa, a validação corrigida no item 1 só bloqueava pagamento inferior. Não existia cálculo de troco; o valor digitado era gravado inteiro como pagamento. A geração Pix ainda admitia tolerância de um centavo acima do saldo.
- **Decisão do usuário:** bloquear excedentes em todas as formas, inclusive dinheiro, registrando somente o valor líquido. Exemplo: venda de R$ 100, cliente entrega R$ 120 e recebe R$ 20 de troco; registrar R$ 100. Não criar campos de valor entregue/troco nesta correção.
- **Correção na aplicação:** Experimental bloqueia valor acima de A Receber no formulário e na action, independentemente de carnê. Expressa exige o total exato antes do PIN, na confirmação e no servidor. A geração Pix compara centavos sem tolerância de excedente. Crédito em Loja mantém a RPC própria e o reconhecimento da mesma tentativa, sem bloquear seu replay antes da RPC.
- **Proteção no banco:** a migration `20261106180000_guard_direct_payment_sale_balance.sql` acrescenta validação de inclusão/alteração financeira de pagamentos diretos. Bloqueia as vendas afetadas em ordem determinística, calcula saldo canônico com itens/desconto, pagamentos diretos anteriores e valor formalizado no carnê e recusa valor superior. Ao alterar um pagamento, exclui o próprio registro da soma. Recalcula o saldo na mesma transação; falha desfaz o pagamento. Valores de `valor_restante` desatualizados não liberam excedente. O registro inicial da Expressa, que já nasce fechado, continua permitido até seu total.
- **Escopo e limites:** recebimentos com parcela seguem o fluxo do carnê e não contam duas vezes. Registros históricos importados mantêm seu tratamento próprio. A migration não corrige excedentes antigos nem torna o fechamento manual transacional; o item 4 continua pendente. Se um Pix já pago no provedor exceder o saldo porque outro pagamento entrou antes, o banco bloqueia a baixa e o fluxo existente marca erro de conciliação, exigindo revisão; não ocorre devolução bancária automática.
- **Validação:** TypeScript aprovado; 18 testes de `npm run test:payment-limit` e 23 de `npm run test:sale-financial-boundary` aprovados. Testes cobrem SQL real em PostgreSQL/WASM sintético, diferença de um centavo, parcial/integral, desconto/carnê, soma de várias linhas, saldo armazenado desatualizado, alteração/mudança de venda, rollback e integração de formulário/action/geração Pix. Os 39 testes da carteira e 29 da remoção também foram executados com a proteção nova instalada. Validação visual e concorrência entre conexões PostgreSQL independentes não foram exercitadas.
- **Integração com devolução:** os 36 testes de `npm run test:sale-return` também passaram com a proteção instalada. Cenários de dados legados inconsistentes usam preparação explícita apenas no banco sintético, pois a nova validação impede recriar essas inconsistências por gravações normais. `git diff --check` aprovado.
- **Entrega:** o usuário informou em 06/11/2026 que aplicou `20261106180000_guard_direct_payment_sale_balance.sql` com sucesso, após a migration 170000. Ambiente do banco não especificado e sem consulta independente ao schema instalado. As migrations anteriores foram preservadas. Publicação e validação operacional continuam pendentes de confirmação. A validação automatizada foi feita em banco sintético, sem consulta ou alteração de vendas reais pelo agente. O ambiente de teste depende de `npm run test:wallet:setup`.

### 3. Remoção de pagamento em crédito em loja

- **Situação:** confirmado no código; correção local preparada em 06/11/2026. Migration aplicada com sucesso conforme relato do usuário na mesma data; publicação e validação operacional pendentes de confirmação.
- **Causa:** `deletePagamento` excluía o pagamento e recalculava a venda sem atualizar a carteira nem registrar a devolução no extrato.
- **Decisão autorizada:** devolver à carteira de quem pagou o valor removido, uma única vez, com registro no histórico.
- **Correção:** a RPC `reverse_store_credit_payment` valida usuário, empresa, loja, venda aberta não histórica e pagamento direto em crédito; bloqueia as linhas da venda, do pagamento e da carteira. Devolução, extrato, remoção de recebíveis/pagamento e recálculo da venda ficam na mesma transação. O identificador do pagamento removido permanece no extrato com índice único. Falha da RPC não permite usar a exclusão comum. O autor da remoção fica registrado, sem atribuir a ação ao vendedor do pagamento original.
- **Legado:** o débito antigo só referencia a venda. A rotina exige carteira do `customer_id` do pagamento e saldo de débitos comprovado no extrato dessa venda, descontando estornos anteriores. Ausência de cliente, carteira ou lastro bloqueia a remoção para revisão. Não houve recomposição retroativa de pagamentos já apagados.
- **Fluxos:** a Venda Experimental usa a lista de pagamentos com confirmação explícita da devolução. A Venda Expressa não oferece Crédito em Loja na sua aba de pagamento; a nova opção não foi acrescentada ali.
- **Validação:** 19 testes aprovados com PostgreSQL/WASM em memória e esquema mínimo sintético, executando a migration e a função real de recálculo. Cobrem estorno, repetição, dois pagamentos, transferência de titular, escopo de acesso, dados inconsistentes, permissões da RPC e rollback por falhas no extrato, carteira, exclusão e recálculo. A action foi testada com RPC indisponível para garantir ausência de exclusão alternativa. A concorrência entre conexões PostgreSQL independentes não foi exercitada nesse ambiente.
- **Entrega:** o usuário informou em 06/11/2026 que aplicou `20261106140000_reverse_store_credit_payment.sql` com sucesso, antes das migrations 150000 e 160000. Ambiente do banco não especificado e sem consulta independente ao schema instalado. Publicação e validação operacional continuam pendentes de confirmação. Testes reproduzíveis com `npm run test:wallet:setup` e `npm run test:wallet`.
- **Checagens complementares:** `npm run typecheck`, os 20 testes de `npm run test:sale-financial-boundary` e `git diff --check` aprovados. Falha posterior no recálculo de comissão é informada como pendência, sem apresentar o estorno já confirmado como falha.

### 4. Finalização com carnê e saldo ainda a receber

- **Situação:** falha confirmada e corrigida localmente em 07/11/2026. Migration aplicada com sucesso conforme relato do usuário na mesma data; publicação e validação operacional pendentes de confirmação.
- **Relato:** com carnê e **A Receber** positivo, **Finalizar Venda** permanece disponível.
- **Interface antes da correção:** `src/components/vendas/VendaActions.tsx` calcula `isLocked = hasRemaining && !hasFinance`. A existência de `financiamento_id` libera o botão mesmo com saldo restante positivo. A comparação `> 0.01` também permite finalizar com exatamente um centavo pendente, mesmo sem carnê.
- **Servidor antes da correção:** `updateVendaStatus`, em `src/lib/actions/vendas.actions.ts`, consulta somente status e indicador de importação histórica antes de gravar `Fechada`. Não recalcula nem verifica o saldo ao fechar; a requisição direta independe do bloqueio visual. O fechamento ainda dispara comissão e operações de estoque. A consulta e o update usam apenas o ID da venda, sem conferir acesso à loja/tenant nessa action; carregar o usuário/perfil não interrompe a operação quando não há sessão ou vínculo autorizado.
- **Fluxos antes da correção:** a Expressa na aba Pagamento usa `getExpressPaymentError` e exige pagamento igual ao total antes de criar a venda fechada. Sua aba Carnê cria uma venda aberta e usa a geração compartilhada; `saveFinanciamentoLoja` calcula a cobertura e chama `updateVendaStatus` quando considera o saldo coberto. Esse cálculo arredondava diferenças menores que cinco centavos para zero. O fechamento manual da Experimental é o caminho diretamente vulnerável; a rotina compartilhada também precisa proteger o fechamento após carnê sem tolerar saldo positivo em centavos.
- **Banco:** a migration 180000 protege inclusões/alterações financeiras de pagamentos, não a transição do status da venda para Fechada. Aplicá-la não resolve este item. As migrations versionadas consultadas não apresentam uma proteção específica de saldo nessa transição; o schema remoto não foi consultado.
- **Regra já definida no README:** permitir fechamento quando pagamentos diretos e valor formalizado no carnê cobrem o total líquido da venda; parcelas futuras em aberto não impedem fechar. Qualquer centavo ainda não coberto deve manter a venda aberta. Importações históricas conservam seu fluxo próprio.
- **Correção implementada:** a tela bloqueia qualquer centavo positivo, com ou sem carnê, e saldo ausente/inválido. `updateVendaStatus` exige sessão e acesso à loja/tenant, consulta e altera a venda no mesmo escopo e usa exclusivamente `close_sale_with_balance_check` para fechar. Falta/erro da RPC impede o fechamento sem UPDATE alternativo. A geração do carnê arredonda para centavos, removendo a tolerância de cinco centavos.
- **Proteção nova no banco:** `20261107120000_guard_sale_closing_balance.sql` instala um trigger na transição para Fechada. O saldo é calculado com itens, desconto, pagamentos diretos e valor formalizado no carnê sob bloqueio da venda, na mesma transação do status. Parcelas recebidas não contam duas vezes. A RPC restringe acesso ao backend e valida usuário/loja/tenant e venda aberta não histórica. O trigger também bloqueia uma alteração direta do status com saldo descoberto. Não altera inserções iniciais de vendas fechadas da Expressa, históricos nem vendas já fechadas retroativamente.
- **Validação local:** TypeScript aprovado; 15 testes de `npm run test:sale-closing` e 23 de `npm run test:sale-financial-boundary` aprovados. Cobrem SQL real em PostgreSQL/WASM sintético, cobertura parcial/integral, entrada/carnê, diferença de um e quatro centavos, saldo armazenado obsoleto, desconto, escopo de acesso, status protegidos, rollback, permissões, reaplicação, integração com a migration 180000 e criação inicial da Expressa, além de action e tela em memória. Sem consulta ao banco remoto ou execução de vendas reais. Navegador visual e concorrência entre conexões independentes não foram testados.
- **Regressão:** os 36 testes de `npm run test:sale-return` também passaram; a fixture da action passou a validar a consulta de acesso à loja antes do bloqueio de venda devolvida. `git diff --check` aprovado.
- **Limites e entrega:** o usuário informou em 07/11/2026 que aplicou `20261107120000_guard_sale_closing_balance.sql` com sucesso, depois da 180000. Ambiente não especificado e sem consulta independente ao schema instalado. Publicação e validação operacional pendentes de confirmação. As migrations anteriores foram preservadas. A transação cobre saldo e status; comissão, reservas, saídas de estoque e ranking continuam posteriores, com o comportamento existente. A proteção verifica a transição de fechamento, sem tornar todas as edições futuras de itens, carnê e pagamentos uma única operação atômica. Teste local depende de `npm run test:wallet:setup`.

### 5. Alteração de forma de pagamento no Livro Caixa

- **Situação:** falha confirmada e corrigida localmente em 07/11/2026. Migration aplicada com sucesso conforme relato do usuário na mesma data; publicação e validação operacional pendentes de confirmação.
- **Relato:** alterar a forma no Livro Caixa não recria as parcelas de cartão ou cheque.
- **Causa confirmada:** `alterarFormaPagamento`, em `src/lib/actions/cashflow.actions.ts`, chama `change_payment_method_with_audit`. A função versionada em `20260829100000_payment_method_change_audit.sql` altera o pagamento e registra auditoria, mas não atualiza `accounts_receivable`. O campo `parcelas` só muda quando a quantidade nova é maior que um; mudar para uma parcela ou dinheiro pode conservar a quantidade antiga.
- **Interface e fluxos:** `CaixaInterface` oferece dinheiro, Pix manual e cartões, com quantidade de parcelas para crédito; também permite editar a origem em cheque para essas formas. Pagamentos da Expressa e Experimental aparecem no mesmo Livro Caixa.
- **Risco:** trocar dinheiro por cartão não cria recebíveis; trocar cartão/cheque por dinheiro conserva os anteriores; mudar o parcelamento deixa a agenda divergente. A RPC também não confere perfil/tenant do usuário informado nem restringe formas vinculadas à carteira ou conciliação Pix.
- **Decisão do usuário:** recompor somente recebíveis pendentes; bloquear os já recebidos/conciliados. Crédito em Loja, Pix integrado e recebimentos de carnê ficam fora dessa edição.
- **Correção:** `20261107140000_atomic_payment_method_change.sql` substitui a implementação da RPC existente, mantendo sua assinatura. Confere usuário/perfil/tenant/loja, funcionário ativo e autoria do pagamento. Bloqueia a venda antes do pagamento, depois os recebíveis em ordem de ID. Recusa históricos, canceladas/devolvidas e vínculos especiais. Somente status exatamente Pendente é elegível; campos opcionais de baixa/conciliação detectados no JSON do recebível também bloqueiam a edição se preenchidos. Nenhuma migração já aplicada foi reescrita.
- **Agenda financeira:** cartão de crédito e Cheque-Pré geram de 1 a 12 recebíveis, com a diferença de centavos na primeira parcela e vencimentos de 30 em 30 dias a partir da data original do pagamento, seguindo a regra existente de `addPagamento`. Dinheiro, Pix manual e débito removem a agenda pendente e ficam com uma parcela. Valor, data, saldo da venda e movimentação bancária não são alterados. Repetir forma/quantidade já gravadas não recria os recebíveis.
- **Atomicidade e histórico:** exclusão da agenda antiga, alteração do pagamento, nova agenda, auditoria existente e snapshots de antes/depois ficam na mesma transação. Falha em qualquer etapa desfaz tudo. `payment_method_change_operations` preserva snapshots mesmo após remoção futura do pagamento, com acesso restrito ao backend.
- **Interface:** caixa do dia e consulta histórica carregam a quantidade atual de parcelas. A janela permite corrigir o parcelamento mantendo a mesma forma, oferece Cheque-Pré e explica o bloqueio de lançamentos já recebidos/conciliados. O servidor continua usando somente a RPC, sem atualização alternativa se ela falhar.
- **Validação local:** `npm run typecheck`, 34 testes de `npm run test:payment-method`, 29 de `npm run test:payment-removal` e 18 de `npm run test:payment-limit` aprovados. SQL real em PostgreSQL/WASM sintético com a proteção 180000 instalada; inclui soma exata, crédito/cheque/dinheiro/Pix manual/débito, redução para uma parcela, repetição, snapshots duráveis, acesso, bloqueios especiais, rejeição de fração de centavo no legado e rollback em cada escrita e na exclusão. A action foi exercitada em memória. Navegador visual e concorrência entre conexões independentes não foram testados.
- **Entrega e limites:** o usuário informou em 07/11/2026 que aplicou `20261107140000_atomic_payment_method_change.sql` com sucesso, depois da 20261107120000. Ambiente não especificado e sem consulta independente ao schema; publicação e validação operacional pendentes de confirmação. Nenhuma alteração de banco remoto ou venda real foi feita pelo agente. O schema remoto, integrações externas de conciliação e dados antigos não foram consultados; a detecção opcional usa os nomes de campos contendo paid/received/settled/reconcil/conciliad/recebid/baixa, além do status. A migration não recompõe retroativamente agendas antigas e não movimenta dinheiro no provedor. O PIN mantém o fluxo preexistente, sem novo token assinado nesta correção. Testes dependem de `npm run test:wallet:setup`.

### 6. Devolução integral de venda

- **Situação:** auditado e corrigido localmente no escopo autorizado em 06/11/2026. Migration aplicada com sucesso conforme relato do usuário na mesma data; publicação e validação operacional pendentes de confirmação.
- **Falhas confirmadas:** estoque, crédito, status e comissão eram gravados separadamente; quantidades, produtos e valores vinham do navegador; a seleção parcial marcava a venda inteira como devolvida e a opção Estorno Financeiro não registrava reembolso. Falhas podiam deixar alterações parciais e repetições podiam duplicar estoque/crédito.
- **Decisão do usuário:** permitir somente devolução integral de venda quitada sem carnê, com reembolso em Crédito em Loja. Parcial, carnê e Estorno Financeiro ficam bloqueados até definição própria.
- **Correção:** a action exige sessão, acesso à loja e token assinado do PIN para a venda/tentativa. A RPC `return_sale_integral` confere o titular, todos os itens da venda, pagamentos diretos que cubram exatamente o valor final, ausência de carnê e de cobrança Pix pendente/incerta. Preços e quantidades são buscados no banco. O valor do crédito inclui o desconto, sem reembolsar a soma bruta dos itens.
- **Atomicidade e histórico:** estoque, criação de sobra, crédito/extrato, status Devolvida, comissões pendentes e snapshot ficam na mesma transação. A tabela `sale_return_operations` guarda autor, funcionário, titular, itens, pagamentos, estoque e comissões anteriores. Uma chave reconhece repetições; uma restrição por venda também impede nova devolução com outra chave. Reabertura, troca de titular e alterações dos itens/pagamentos de venda devolvida são bloqueadas para preservar o histórico.
- **Estoque:** exige saída comprovada na mesma loja, por venda ou OS. Intacto restaura o produto e sua variante; Par representa duas unidades. Defeito registra perda sem nova baixa. Sobra exige uma lente individual com variante de origem e copia seus graus; um par ou origem ambígua exige revisão fora desse fluxo. Itens avulsos sem produto cadastrado ficam no snapshot e não geram entrada fictícia; a tela informa isso. Registros antigos de devolução/crédito e saídas divergentes bloqueiam a operação para revisão.
- **Comissões:** todas as pendentes vinculadas à venda, inclusive de médico, são estornadas. As já pagas são preservadas e a confirmação informa a necessidade de acerto manual.
- **Expressa e Experimental:** a devolução é acessada pela Venda Experimental, inclusive ao abrir por ela uma venda originada na Expressa. O cadastro compartilhado Consumidor Final não pode receber esse crédito; é necessário identificar o titular antes de continuar. A tela é atualizada após sucesso e mantém a tentativa ao repetir após resposta incerta. Mesmo fechando/reabrindo o modal, uma venda devolvida não gera outro crédito.
- **Limites:** não cancela nota fiscal nem envia dinheiro por Pix/cartão. Não recompõe devoluções antigas incompletas. O tratamento de parcial, carnê, comissões já pagas e estoque de origem ambígua permanece sujeito à decisão/revisão específica, conforme o escopo escolhido pelo usuário.
- **Validação local:** `npm run typecheck`, 36 testes de `npm run test:sale-return` (4 de solicitação e 32 de SQL/action/modal), 39 testes da carteira e 20 testes financeiros. SQL real executado em PostgreSQL/WASM com esquema mínimo sintético, cobrindo rollback em cada etapa, descontos, autorização assinada, tentativas repetidas, nova chave para venda já devolvida, preservação de pagamentos, Par, Defeito e Sobra. Hooks e modal exercitados em memória; navegador visual e concorrência entre conexões independentes não foram testados.
- **Entrega:** o usuário informou em 06/11/2026 que aplicou `20261106160000_atomic_integral_sale_return.sql` com sucesso, depois das migrations de estorno e operações atômicas da carteira. Ambiente do banco não especificado e sem consulta independente ao schema instalado. Publicação e validação operacional continuam pendentes de confirmação. O teste local depende de `npm run test:wallet:setup`.

### 7. Carnê da venda rápida não chega à autorização

- **Situação:** comportamento confirmado e corrigido localmente em 07/11/2026; publicação e validação operacional pendentes. Sem nova migration.
- **Comportamento observado:** em `PaymentModal`, a aba **Carnê** cria a venda ao selecionar o cliente e passa `customer={null}` para `FinanciamentoBox`. O botão **Gerar Carnê** exige documento e celular do objeto do cliente. Sem esse objeto, ele tenta abrir a janela de complemento, que só é renderizada quando o cliente existe. A autorização por PIN não abre.
- **Risco:** a venda já foi criada e a saída de estoque já foi registrada antes do carnê. A pessoa pode iniciar outra venda rápida para a mesma cesta.
- **Confirmado:** a seleção do cliente chama `criarVendaParcialCarnê`, que grava a venda em aberto e registra a saída. O bloqueio está no botão de geração, não na criação da venda.
- **Correção:** `PaymentModal` passa o cliente selecionado ao `FinanciamentoBox`. O contrato do componente compartilhado declara somente os campos de cliente usados, aceitando o resultado da busca sem cast para um cadastro completo. Cliente PF/PJ com documento e celular chega ao PIN; dados ausentes abrem `UpdateCpfModal`, que permite seguir para a autorização após salvar. A Experimental conserva o mesmo componente e fluxo.
- **Continuidade:** trava local impede seleção simultânea de vários clientes e criação repetida enquanto a chamada está em andamento. Não permite mudar para pagamento direto durante essa criação. Depois de criada a venda, o X e o botão Continuar na Venda Experimental limpam a cesta da Expressa e abrem o mesmo ID. A venda e o estoque já existentes são preservados.
- **Validação local:** `npm run typecheck`, 7 testes de `npm run test:express-financing` e 23 de `npm run test:sale-financial-boundary` aprovados. Componentes reais executados em memória com actions e navegador simulados; cobrem cliente PF/PJ, complemento de documento/telefone seguido de PIN, envio dos IDs de cliente/venda/autorizador, duplo clique, bloqueio da troca de aba durante criação, erro informado, retomada e limpeza da cesta. Nenhuma venda real foi criada; navegador visual não foi exercitado.
- **Limites:** a criação da venda e a geração do carnê continuam em etapas separadas, com as regras anteriores de estoque. A trava é local ao modal e não garante idempotência entre abas ou após recarregar. Resposta incerta exige conferir a lista de vendas antes de nova tentativa; a mensagem orienta essa revisão. Esta correção não reescreve as transações das actions nem resolve as outras pendências do carnê.

### 8. Observação da renegociação não é gravada

- **Situação:** comportamento confirmado e corrigido localmente em 07/11/2026; nova migration, publicação e validação operacional pendentes.
- **Comportamento observado:** o formulário de renegociação mostra o campo **Observação**, mas `renegociarFinanciamentoLoja` não envia esse texto. A criação do carnê grava a observação; a renegociação não.
- **Risco:** a equipe pode acreditar que uma ressalva ficou registrada no acordo.
- **Confirmado:** o payload da renegociação contém identificadores e parcelas, sem observação.
- **Decisão autorizada:** manter o campo e registrar o texto no histórico da renegociação, junto ao autor e à data, preservando os registros anteriores.
- **Correção:** `FinanciamentoBox` envia `obs` também ao renegociar. A action valida e normaliza o texto e chama somente `renegotiate_store_financing_with_note`. A migration `20261107160000_financing_renegotiation_note.sql` acrescenta `installment_renegotiations.note` e uma RPC restrita ao backend que valida acesso/funcionário, executa a rotina financeira existente e grava a nota no registro retornado. Saldo, parcelas, histórico e nota estão na mesma transação; falha ao salvar a nota desfaz a renegociação. Não há chamada alternativa sem observação se a RPC nova falhar.
- **Histórico e fluxos:** a observação original da capa do carnê e os registros de acordos anteriores não são sobrescritos. Autor e data continuam nos campos existentes do acordo. Campo opcional, com limite de 2000 caracteres; vazio fica null. O mesmo componente atende a Experimental e o carnê originado na Expressa. A criação inicial do carnê mantém sua observação própria e não foi alterada.
- **Validação local:** `npm run typecheck`, 9 testes de `npm run test:renegotiation-note` e 8 de `npm run test:express-financing` aprovados. SQL real em PostgreSQL/WASM sintético executa a rotina financeira existente e a nova RPC; cobre nota/autor/data, preservação do histórico, texto opcional/limite, recebimentos anteriores, redução de saldo, rollback por falha na nota, permissões e reaplicação. Action e formulário reais foram exercitados em memória, incluindo o texto após o PIN.
- **Regressão:** os 9 testes de `npx tsx --test tests/installment-balance.test.ts` e `git diff --check` também passaram.
- **Entrega e limites:** aplicar a nova migration 20261107160000 depois da 20261107140000 antes de publicar. Banco remoto e vendas reais não foram acessados; navegador visual e concorrência entre conexões independentes não foram exercitados. Não recupera textos perdidos anteriormente nem cria uma tela de consulta do histórico. As regras financeiras e a RPC original são preservadas. Teste local depende de `npm run test:wallet:setup`.

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

### 18. CPF informado na NFC-e conserva o nome do cliente da venda

- **Origem:** relato de 06/11/2026 sobre a venda experimental 14045, Loja 1, de R$ 1.380,00; NFC-e 222, serie 2, atualmente cancelada no banco.
- **Situacao:** comportamento confirmado no codigo e no payload gravado da nota 585. A auditoria da primeira correcao encontrou bloqueios de autorizacao e retomada, alem de limitacao PF/PJ. Esses pontos receberam correcao local; publicacao e validacao real com o provedor nao foram realizadas.
- **Comportamento observado:** `FiscalEmissionModal` envia o CPF digitado quando o cadastro nao possui documento, mas monta o nome, email e endereco com os dados do cliente da venda. Informar documento de outra pessoa nao seleciona um novo destinatario. A action `emitirNFCe` utiliza o documento e o nome recebidos para montar `dest`.
- **Risco:** a nota pode combinar o CPF de um terceiro com o nome do cliente da venda. O botao de salvar documento tambem pode gravar esse CPF no cadastro do cliente da venda.
- **Conferencia do caso:** o payload da NFC-e 222 contem o CPF com final 5964 e `xNome` da Isabela. O cadastro dela permanece sem CPF. A titularidade do documento informado nao foi consultada.
- **Nova conferencia em 07/11/2026:** a ultima NFC-e da venda 14045 e a 223, serie 2, registro 586, emitida as 11:03:04 de Brasilia por R$ 1.380,00, autorizada. Payload, snapshot, XML processado e PDF contem o nome da Isabela junto do CPF final 5964. O XML baixado da Nuvem Local e identico ao salvo no banco, tem protocolo com cStat 100 e chave correspondente. Portanto, o nome nao foi acrescentado apenas ao PDF; ele ja integra o XML autorizado. O cadastro atual continua sem CPF. A versao publicada/caminho que gerou essa emissao nao foi confirmado. Nenhuma nota ou cadastro foi alterado nesta conferencia; consulta direta a SEFAZ nao foi realizada.
- **Correcao:** o servidor confere o cadastro da venda na mesma loja e tenant. Nome, email e endereco somente acompanham o documento desse cadastro. Documento informado somente para a nota nao herda dados pessoais, inclusive no XML e no registro da emissao. O modal oferece outro documento para a nota e nao permite grava-lo no cadastro da cliente.
- **Revisao apos auditoria:** a action agora exige sessao valida, perfil no tenant informado e acesso a loja antes de consultar dados fiscais, obter token ou reservar numeracao. O cliente de recuperacao bloqueia mudancas no destinatario de uma NFC-e ja preparada, inclusive em `blocked_local`, e deriva o snapshot do destinatario efetivamente enviado. A verificacao de versao existente na RPC preserva a preparacao vencedora em chamadas obsoletas. O modal aceita CPF ou CNPJ independentemente do tipo do cliente original.
- **Validacao:** TypeScript aprovado e testes locais ampliados para action, payload final, snapshot, autorizacao, recuperacao e modal. Detalhes e limites em `docs/NFCE_DESTINATARIO_AUDITORIA_20261106.md`. Nenhuma nota foi emitida, cancelada ou alterada, e nenhum cadastro foi modificado. As demais pendencias de auditoria permanecem em aberto.

### 19. Criação e uso de crédito possuem gravações separadas

- **Origem:** revisão do item 3 em 06/11/2026.
- **Situação:** correção local preparada em 06/11/2026. Migration aplicada com sucesso conforme relato do usuário na mesma data; publicação e validação operacional pendentes de confirmação. Impacto em dados antigos não investigado.
- **Causa confirmada:** `addCredit` e `useCredit` gravavam saldo e extrato em chamadas separadas e `addPagamento` debitava antes de criar o pagamento. Falhas podiam deixar débito sem pagamento; gravações de saldo absoluto podiam sobrescrever operações simultâneas.
- **Correção:** `add_store_credit_atomic` grava saldo e extrato juntos. `pay_sale_with_store_credit` grava pagamento, débito, extrato e recálculo da venda na mesma transação. As RPCs validam usuário, empresa, loja, funcionário e cliente; bloqueiam carteira/venda e conferem os saldos. A chave da tentativa tem índice único e serialização no banco; reutilização com dados diferentes é recusada. O extrato guarda o pagamento de origem e a chave sobrevive ao estorno; repetir uma cobrança já removida não cria outra.
- **Aplicação:** a action de débito isolado foi removida. `addPagamento` usa exclusivamente a RPC para Crédito em Loja e não usa inserção alternativa se ela falhar. Falhas posteriores de fechamento/comissão informam que o pagamento já foi confirmado. A Venda Expressa continua sem oferecer crédito em sua aba de pagamento; a mudança operacional se aplica à Venda Experimental e à adição de crédito por devolução.
- **Tentativas:** `AddPagamentoForm` reutiliza a chave para os mesmos dados e a renova após sucesso ou mudança dos dados. A chave do pagamento não persiste após fechar/recarregar a página; uma resposta incerta exige conferir o histórico antes de uma nova tentativa. A devolução foi posteriormente integrada à RPC própria do item 6, com proteção adicional por venda mesmo se a chave mudar.
- **Validação:** `npm run typecheck`, 39 testes de `npm run test:wallet`, 20 testes de `npm run test:sale-financial-boundary` e `git diff --check` aprovados. Os testes executam SQL real em PostgreSQL/WASM com esquema mínimo sintético, incluindo rollback em cada etapa, repetição, conflito de chave, saldo insuficiente, carnê, estorno, isolamento de loja/empresa, permissões e integração das actions. O formulário foi exercitado em memória. Concorrência entre conexões independentes e navegador visual não foram testados.
- **Entrega:** o usuário informou em 06/11/2026 que aplicou `20261106150000_atomic_wallet_operations.sql` com sucesso, depois da migration do item 3 e antes da migration 160000. Ambiente do banco não especificado e sem consulta independente ao schema instalado. Publicação e validação operacional continuam pendentes de confirmação.

## Registro de novos achados

### 20. Remoção comum de pagamento e seus recebíveis

- **Origem:** revisão dos bloqueios de venda devolvida no item 6, em 06/11/2026.
- **Situação:** causa confirmada; correção local preparada em 06/11/2026. Migration aplicada com sucesso conforme relato do usuário na mesma data; publicação e validação operacional pendentes de confirmação. Impacto em dados reais não investigado.
- **Causa:** fora do Crédito em Loja, `deletePagamento` excluía recebíveis, pagamento e recalculava a venda em chamadas separadas. O erro da exclusão de recebíveis era apenas registrado no console, permitindo inconsistências em falhas intermediárias.
- **Correção:** `remove_direct_sale_payment` exige usuário com acesso à loja e empresa, venda em aberto não histórica e pagamento direto. Bloqueia venda, pagamento e recebíveis; exclusão dos recebíveis/pagamento, recálculo e auditoria ficam na mesma transação. Falha em qualquer etapa desfaz tudo. O servidor não usa exclusão alternativa quando a RPC falha ou falta no banco. Repetir uma remoção concluída retorna pagamento não encontrado/já removido sem novos efeitos.
- **Histórico:** `direct_payment_removals` preserva autor, pagamento, recebíveis e estado financeiro da venda antes/depois, com identificador único do pagamento. O acesso é restrito ao backend. O registro não representa devolução de dinheiro ao cliente.
- **Proteções:** pagamentos de parcelas ou com `receipt_operation_id` usam o fluxo de carnê; Crédito em Loja mantém a rotina própria. Venda fechada exige reabertura; canceladas/devolvidas/históricas são bloqueadas. Pix Sicredi ou pagamento vinculado em `pix_sale_charges.settlement_pagamento_id` exige revisão da conciliação e não é apagado pela rotina. Recebível de outra loja/empresa bloqueia a operação para revisão.
- **Expressa e Experimental:** ambas continuam com as mesmas formas de entrada. A remoção é feita pela lista da Venda Experimental, inclusive para pagamentos originados na Expressa depois de abrir e reabrir a venda conforme as regras existentes. Não foi criada exclusão na tela concluída do PDV Express.
- **Comissão e interface:** o recálculo de comissão permanece posterior à transação financeira. Exceções desse passo geram aviso de comissão pendente de revisão, sem declarar falha na remoção já confirmada. A lista mostra a mensagem também nas formas comuns e diferencia falha de atualização da página de falha na remoção. A implementação preexistente da comissão pode absorver erros internamente; esta correção não reescreve esse cálculo nem garante atomicidade com ele.
- **Validação:** `npm run typecheck`, 29 testes de `npm run test:payment-removal`, 39 testes de `npm run test:wallet`, 20 testes de `npm run test:sale-financial-boundary` e `git diff --check` aprovados. SQL real executado em PostgreSQL/WASM isolado com esquema mínimo sintético; inclui transação, snapshots, bloqueios de acesso, Pix integrado, carnê, repetição, rollback de cada gravação e integração da action sem exclusões alternativas. Concorrência entre conexões independentes e navegador visual não foram testados.
- **Entrega:** o usuário informou em 06/11/2026 que aplicou `20261106170000_atomic_direct_payment_removal.sql` com sucesso, após as migrations anteriores. Ambiente do banco não especificado; sem consulta independente ao schema instalado. Publicação e validação operacional continuam pendentes de confirmação. Testes locais dependem de `npm run test:wallet:setup`.

Para cada ponto futuro, registrar a origem, a situação, o comportamento relatado, o risco e o próximo passo. Preservar os itens até que tenham sido verificados e sua resolução ou decisão tenha sido registrada.
