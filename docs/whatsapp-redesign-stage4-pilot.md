# Piloto de respostas seguras do WhatsApp — Loja 1

O piloto é opt-in e permanece desligado após publicar o código. A Loja 1 deve
estar com `whatsapp_automation.ai_redesign.mode = "shadow"` e só responde pelo
redesign quando `whatsapp_automation.ai_redesign.safe_replies_enabled = true`.
Outras lojas não entram no piloto mesmo se a flag for definida por engano.

O caminho de saída reutiliza a mensagem de entrada e o envio existentes. O
turno específico é processado imediatamente pelo mesmo decisor usado na
auditoria; a resposta ao vivo reutiliza a decisão persistida e não aguarda o
cron nem faz uma segunda classificação. Horário, endereço/mapa, Pix literal,
saudação conservadora e encaminhamentos definidos pelo redesign seguem essa
decisão. Encaminhamentos ativam a pausa/pendência operacional e só são
registrados como handoff confirmado quando a entrega é confirmada. Pausas
humanas existentes continuam bloqueando respostas automáticas. O cron segue
ativo para recuperação e turnos que não foram finalizados no caminho imediato;
ele não envia mensagens.

## Ativação

1. Publicar o código e confirmar o deploy. Não ativar a flag antes disso.
2. Conferir que a Loja 1 segue em `shadow` e que a automação está habilitada.
3. Alterar somente a configuração da Loja 1 para
   `whatsapp_automation.ai_redesign.safe_replies_enabled = true`, preservando
   todas as outras chaves de `stores.settings`. Se `mode` acabou de mudar para
   `shadow`, aguardar até um minuto pela atualização do cache de captura.
4. Validar com um número de teste: horário, endereço, chave Pix, pedido humano,
   anexo, saudação, pausa ativa e conversa fora do expediente. Conferir que cada
   entrada teve no máximo uma saída e que a chave usada é a oficial, sem imprimir
   seu valor em logs ou relatórios.

Operação local, sem imprimir os valores da configuração:

```bash
node --import tsx scripts/manage-whatsapp-redesign-stage4.ts status
node --import tsx scripts/manage-whatsapp-redesign-stage4.ts enable
node --import tsx scripts/manage-whatsapp-redesign-stage4.ts check-recent
```

Em 24/09/2026, após o deploy informado como Ready, as pré-condições da Loja 1
foram conferidas e o piloto foi ativado. Falta validar mensagens reais após a
ativação; não considerar a etapa concluída antes dessa conferência.

Primeira validação após ativação: na janela de consulta, uma entrada foi
processada e houve exatamente uma saída enviada, com ação `answer_store_hours`
e tipo `store_hours`. A checagem exibiu somente contagens e categorias, sem
telefone, texto da conversa ou chave Pix.

Segunda validação: a entrada seguinte gerou exatamente uma saída enviada,
classificada como `answer_store_location`/`store_location`. O turno ainda estava
`ready` na captura sombra durante a checagem, portanto a classificação posterior
do processador agendado ainda não foi confirmada.

Terceira validação: o pedido explícito pela chave Pix gerou exatamente uma
saída enviada do tipo `payment_pix_info`. O relatório não expôs a chave. Como o
cron foi pausado pelo usuário, o turno sombra continua sem classificação final.

## Reversão

Alterar somente `safe_replies_enabled` para `false` na Loja 1, preservando o
restante da configuração. As próximas entradas voltam ao roteador anterior;
mensagens já enviadas não podem ser recolhidas. O modo `shadow` pode continuar
registrando decisões sem afetar a resposta. Se for necessário interromper
também essa captura, retornar `mode` para `legacy` separadamente.

```bash
node --import tsx scripts/manage-whatsapp-redesign-stage4.ts disable
```

## Auditoria de duplicidade e continuidade — 25/09/2026

- O pedido explícito de atendente, o encaminhamento de estoque Varilux e a
  saudação após liberação do handoff foram confirmados pelo usuário; cada
  entrada teve uma única saída enviada. Os metadados mostram a saudação gerada
  pela IA. Entre quatro inbounds recentes que citavam Varilux, dois outbounds
  usaram fallback `unsafe_stock_claim`, um foi gerado pela IA e um registro
  antigo não tinha origem registrada; o teste mais recente usou fallback.
- Auditoria somente leitura dos últimos 72 h: 53 entradas do número de teste,
  zero chaves de inbound repetidas, zero entradas com mais de um outbound e
  zero grupos de respostas enviadas duplicadas. Globalmente, 1.236 outbounds
  vinculados a inbounds também não apresentaram múltiplos registros por inbound.
- Dezessete entradas da janela não tinham saída enviada associada. O conteúdo
  não foi lido nessa auditoria, portanto isso não prova perda de resposta.
- A revisão de código detectou uma corrida rara no reprocessamento tardio. A
  proteção local acrescenta idempotência no fluxo e índice único por inbound,
  acompanhado de teste SQL aprovado dentro de uma transação revertida; nenhum
  dado foi persistido. Ainda falta aplicar a migration e publicar o código para
  ativar a proteção em produção.
- A reversão do piloto permanece pendente enquanto os testes ao vivo continuam.
