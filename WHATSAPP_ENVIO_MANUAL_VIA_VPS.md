# WhatsApp Manual Via VPS

## Objetivo

Registrar a trilha combinada para reduzir o uso de `wa.me`/Chrome nas telas do sistema, aproveitando o canal WhatsApp da loja quando ele estiver configurado e conectado via VPS/Evolution.

## Direcao Geral

- Criar uma trilha unica de envio manual de WhatsApp dentro do app.
- Os botoes deixam de decidir localmente entre `window.open` e outras variacoes.
- A decisao passa a acontecer em uma camada central, sempre considerando o `storeId`.
- O rollout sera gradual, por tipo de mensagem e por tela.

## Regra Por Loja

- Se a loja tiver WhatsApp via VPS habilitado e conectado, o botao envia pela trilha interna.
- Se a loja nao tiver esse canal habilitado, desconectado ou se o envio real falhar, o sistema cai automaticamente para WhatsApp externo.
- Isso permite rollout gradual sem quebrar lojas que ainda nao usam o canal da VPS.

## Politica Fechada

- Fallback padrao: `automatico`.
- Documentos no v1: enviar `link`, nao PDF/anexo real.
- As mensagens enviadas via VPS devem aparecer no WhatsApp operacional.
- Mensagens manuais via VPS devem pausar a conversa para atendimento humano.
- Quando houver fallback externo, registrar a tentativa/fallback no historico operacional sempre que existir canal da loja para registrar o evento.

## Implementacao

- Camada central criada em `src/lib/actions/manual-whatsapp.actions.ts`.
- Helper client criado em `src/lib/whatsapp/manual-client.ts`.
- A camada central recebe:
  - `storeId`
  - `remotePhone`
  - `messageText`
  - `messageType`
  - `source`
  - `metadata`
- A camada central valida a entrada, checa o canal da loja, tenta envio via VPS/Evolution, registra historico e retorna um resultado padronizado para a interface.
- A interface exibe toast informando se a mensagem foi enviada via VPS ou se o WhatsApp externo foi aberto por fallback.

## Tipos De Mensagem

Taxonomia inicial:

- `operator_manual`
- `billing_reminder`
- `post_sale_followup`
- `relationship`
- `assistance_update`
- `service_order`
- `customer_history`
- `document_link`

Cada envio tambem deve informar `source`, identificando a tela/botao de origem.

## Primeiro Lote Migrado

- Cobranca: acao rapida de WhatsApp em `CobrancaInterface`.
- Pos-venda: botao de acompanhamento em `PostSalesInterface`.
- Historico do cliente: envio de financeiro/receita em `CustomerHistoryModal`.

## Inventario Inicial

Grupos encontrados para migracao gradual:

- Operacional humano: ja possui base real via VPS/Evolution.
- Cobranca e vencimentos: lembretes financeiros e contatos de pendencia.
- Pos-venda: acompanhamento de adaptacao apos retirada.
- Relacionamento: aniversariantes e clientes inativos.
- Assistencia, rastreio e garantia: atualizacoes de atendimento e garantia.
- OS, pedido de lentes e laboratorio: envio de pedido, medidas e links de laboratorio.
- Historico do cliente: resumo financeiro, receitas e dados de atendimento.
- Documentos: recibo, DANFE e outros documentos por link.

## Pendencias Para Proximas Etapas

- Migrar os demais pontos encontrados que ainda usam `wa.me`, `api.whatsapp.com`, `getWhatsAppLink`, `openWhatsApp` ou `window.open`.
- Preparar links padronizados onde algum documento ainda nao tenha URL pronta.
- Avaliar anexo real somente depois do fluxo por link estar validado.
- Decidir se paginas publicas, como rastreio/garantia, devem entrar na trilha central ou continuar apenas com link externo.
