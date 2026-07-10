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
- Documentos migrados antes da trilha de anexos: enviar `link`.
- Anexos reais: PDF e imagem usam a trilha central quando o canal da loja esta conectado; nao ha fallback externo automatico que finja anexar o arquivo.
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

## Segundo Lote Migrado

- Clientes inativos: reativacao em `clientes-inativos/page`.
- Assistencia: envio de link de rastreio em `AssistanceKanban`.
- Aniversariantes: widget em `AniversariantesWidget`.
- Vencimentos: widget em `WidgetVencimentos`.
- Loja Vazia: atalhos de aniversariante e vencimento em `OperatorMenuLojaVazia`.

## Terceiro Lote Migrado

- Laboratorio: aviso de lentes prontas para trazer armacao e aviso de oculos montado em `laboratorio/page`.
- Gaveta: aviso de oculos pronto aguardando retirada em `gaveta/page`.
- Entrega: aviso de oculos pronto aguardando retirada em `entrega/page`.

## Quarto Lote Migrado

- Modal de rastreio de laboratorio: aviso de oculos pronto em `LabTrackingModal`.
- Dashboard legado: botao de aniversario em `DashboardViews`.

## Fluxos Ja Validados

- O envio manual via VPS/Evolution ja esta funcionando para os botoes migrados.
- O fluxo operacional esta espelhando as mensagens enviadas sem duplicar o registro no WhatsApp operacional.
- O retorno de cobranca no radar operacional agora abre o WhatsApp operacional ja focado no telefone do cliente quando a loja esta conectada.
- Quando a loja nao esta conectada, o retorno continua com fallback externo antigo.
- O envio de OS com grau/medidas continua como esta por enquanto, sem migracao para a trilha nova.

## Decisoes Pendentes Resolvidas

- Retornos de cobranca no radar operacional: abre o WhatsApp operacional focado no telefone do cliente quando o canal da loja esta conectado; se nao estiver, mantem fallback externo antigo.
- Envio de pedido/medidas da OS: manter como esta por enquanto.

## Envio De Recibo Em PDF

Status: implementado no modal de recebimento de parcelas.

Na tela de sucesso do `ParcelaSearchModal`, depois da impressao do recibo fisico, existe o botao `Enviar recibo por WhatsApp`.

Objetivo do botao:

- Gerar o recibo em PDF.
- Enviar esse PDF via WhatsApp para o numero do cliente.
- Manter a mesma logica de trilha central por `storeId`.

O que essa nova funcao precisa considerar:

- O recibo nao deve ser apenas um link aberto no navegador.
- A trilha precisa aceitar anexo real, primeiro para PDF e depois para imagens.
- O envio deve usar o WhatsApp operacional quando a loja tiver canal conectado.
- Se houver falha de canal ou de envio, precisamos definir um fallback seguro.

API implementada:

- Entrada principal:
  - `storeId`
  - `remotePhone`
  - `mediaType`
  - `mimeType`
  - `fileName`
  - `fileBase64`
  - `caption`
  - `source`
  - `metadata`
- Tipos iniciais:
  - `pdf`
  - `image`
- Saida padronizada:
  - `success`
  - `shouldOpenExternal`
  - `externalUrl`
  - `message`
  - `providerMessageId`

Decisoes aplicadas:

- O arquivo segue como base64 em memoria para a VPS e para a Evolution, sem URL publica temporaria.
- O base64 nao e persistido em `whatsapp_outbound_messages`; o historico guarda apenas metadados do arquivo.
- PDF e imagem compartilham `sendManualWhatsAppMedia`, na camada central `manual-whatsapp.actions.ts`.
- O recibo de parcela usa `sendInstallmentReceiptWhatsApp`, que valida loja, parcela paga, cliente e telefone antes de gerar o PDF.
- O PDF enviado por WhatsApp agora e independente do recibo fisico configurado na loja.
- Para esse envio digital, o layout e um recibo A5 de uma via, com cabecalho da loja, logo opcional, contato, dados da parcela e valor em destaque.
- Sem canal conectado ou em caso de falha, nenhum WhatsApp externo e aberto automaticamente; a interface informa claramente que o anexo nao foi enviado.
- O limite inicial e 10 MB. PDFs usam `application/pdf`; imagens aceitam JPEG, PNG e WebP.

## Inventario Inicial

Grupos encontrados para migracao gradual:

- Operacional humano: ja possui base real via VPS/Evolution.
- Cobranca e vencimentos: lembretes financeiros e contatos de pendencia.
- Pos-venda: acompanhamento de adaptacao apos retirada.
- Relacionamento: aniversariantes e clientes inativos.
- Assistencia, rastreio e garantia: atualizacoes de atendimento e garantia.
- OS, pedido de lentes e laboratorio: envio de pedido, medidas e links de laboratorio.
- Historico do cliente: resumo financeiro, receitas e dados de atendimento.
- Documentos: recibo, DANFE e outros documentos por link ou anexo.

## Pendencias Para Proximas Etapas

- Migrar os demais pontos encontrados que ainda usam `wa.me`, `api.whatsapp.com`, `getWhatsAppLink`, `openWhatsApp` ou `window.open`.
- Definir mensagem padrao para casos que hoje apenas abrem a conversa sem texto, como retorno de cobranca.
- Preparar links padronizados onde algum documento ainda nao tenha URL pronta.
- Decidir se paginas publicas, como rastreio/garantia, devem entrar na trilha central ou continuar apenas com link externo.
