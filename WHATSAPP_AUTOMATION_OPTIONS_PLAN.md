# WhatsApp Automation Options Plan

## Objetivo

Documentar o proximo passo da area de WhatsApp no `gestao-otica-pro`:
criar, na UI da loja, uma area de automacoes configuraveis por toggle e texto
editavel pelo proprio lojista.

Este documento e apenas um plano de produto/implementacao futura.
Nenhuma dessas opcoes deve ser implementada agora.

## Ideia Geral

Depois da ativacao do WhatsApp da loja, a UI deve oferecer uma segunda camada de
configuracao: quais automacoes o lojista quer habilitar naquele numero.

Cada automacao deve ter:

- um toggle de ativacao
- um titulo claro
- uma descricao curta
- um campo de texto editavel pelo lojista
- placeholders iniciais sugeridos pelo sistema
- possibilidade de salvar sem publicar imediatamente outras automacoes

O sistema deve deixar claro que cada loja escolhe o que quer automatizar.

## Opcoes de Automacao

### 1. Enviar status da OS

Objetivo:
enviar atualizacoes automáticas relacionadas ao andamento da ordem de servico.

Exemplos de gatilho futuro:

- OS saiu para producao
- lente chegou
- oculos entrou em montagem
- oculos ficou pronto

Campo editavel:
mensagem-base usada para atualizacoes de status.

Observacao:
essa opcao e diferente da resposta sob demanda. Aqui a ideia e disparo ativo.

### 2. So responder sobre OS

Objetivo:
responder apenas quando o cliente entra em contato perguntando sobre a OS.

Exemplos de comportamento:

- cliente manda "ola" ou outra mensagem
- sistema verifica se existe OS aberta
- sistema responde dentro das regras ja implementadas

Campo editavel:
mensagem-base de resposta por status da OS.

Observacao:
essa opcao representa o fluxo que hoje ja existe, mas futuramente deve virar uma
automacao configuravel pela UI.

### 3. Fazer pos-vendas

Objetivo:
enviar mensagens de acompanhamento depois da entrega ou retirada.

Exemplos de gatilho futuro:

- X dias apos retirada
- primeira verificacao de adaptacao
- pesquisa curta de satisfacao

Campo editavel:
mensagem de acompanhamento pos-venda.

### 4. Enviar aviso de vencimento

Objetivo:
avisar clientes sobre parcelas a vencer.

Exemplos de gatilho futuro:

- 3 dias antes do vencimento
- no dia do vencimento
- 1 dia depois, se ainda nao pago

Campo editavel:
mensagem de lembrete financeiro amigavel.

### 5. Fazer cobranca

Objetivo:
enviar cobrancas de parcelas em atraso.

Exemplos de gatilho futuro:

- atraso acima de X dias
- sequencia progressiva de cobranca
- abordagem mais leve ou mais firme conforme regra da loja

Campo editavel:
mensagem de cobranca editavel pelo lojista.

Observacao:
essa opcao deve ser tratada com cuidado por risco operacional e reputacional.

### 6. Enviar felicitacoes de aniversario

Objetivo:
enviar mensagem de aniversario para clientes cadastrados.

Exemplos de gatilho futuro:

- no proprio dia
- com cupom ou sem cupom
- opcao de usar nome do cliente

Campo editavel:
mensagem de aniversario da loja.

## Comportamento Esperado na UI

### Estrutura sugerida

Dentro da aba `WhatsApp`, depois da area de conexao do numero, exibir uma secao:

- `Automacoes do WhatsApp`

Cada item pode aparecer como um bloco com:

- nome da automacao
- resumo do que faz
- toggle `ativado/desativado`
- textarea para editar a mensagem
- badge de `planejado`, `em breve` ou `ativo`

### Fase inicial

Como proximo passo de produto, podemos primeiro criar somente placeholders na UI:

- cards/blocos das 6 automacoes
- toggle visual
- textarea editavel
- botao salvar
- estado `em breve` para as opcoes ainda nao implementadas

Sem executar nenhuma automacao real nesta etapa.

## Requisitos de Produto

- Cada loja decide individualmente quais automacoes quer usar.
- O lojista nao deve depender de suporte tecnico para editar os textos.
- Os textos devem ser totalmente editaveis, sem ficar presos a um modelo fixo.
- O sistema deve poder usar placeholders dinamicos no futuro, por exemplo:
  - nome do cliente
  - nome do dependente
  - numero da OS
  - data de vencimento
  - valor da parcela
  - nome da loja
- Deve existir separacao clara entre:
  - resposta sob demanda
  - envio automatico ativo

## Sugestao de Dados Futuros

Uma implementacao futura pode usar uma tabela dedicada, por exemplo:

- `whatsapp_automation_settings`

Campos sugeridos:

- `store_id`
- `automation_type`
- `is_enabled`
- `message_template`
- `settings_json`
- `created_at`
- `updated_at`

`automation_type` poderia usar valores como:

- `os_status_proactive`
- `os_status_on_demand`
- `post_sale`
- `installment_due_reminder`
- `collection`
- `birthday_greeting`

## Cuidados Importantes

- Nem toda automacao deve ser ligada por padrao.
- Mensagens ativas podem aumentar risco operacional no WhatsApp.
- Cobranca e lembretes financeiros exigem mais cuidado de frequencia.
- O sistema precisa evitar spam, repeticao e conflitos entre automacoes.
- Antes de qualquer disparo automatico futuro, precisamos definir:
  - janela de horario
  - limite de frequencia
  - opt-out
  - prioridade entre automacoes

## Proximo Passo Quando Retomarmos

O proximo passo pedido para implementacao futura sera:

1. criar os placeholders dessas 6 automacoes na UI
2. permitir toggle e texto editavel por loja
3. salvar as configuracoes no banco
4. manter tudo inicialmente como configuracao visual, sem disparos reais
