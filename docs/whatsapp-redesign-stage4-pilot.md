# Piloto de respostas seguras do WhatsApp — Loja 1

O piloto é opt-in e permanece desligado após publicar o código. A Loja 1 deve
estar com `whatsapp_automation.ai_redesign.mode = "shadow"` e só responde pelo
redesign quando `whatsapp_automation.ai_redesign.safe_replies_enabled = true`.
Outras lojas não entram no piloto mesmo se a flag for definida por engano.

O caminho de saída reutiliza a mensagem de entrada e o envio existentes. Um
turno é classificado pelo redesign antes do roteamento legado. Apenas decisão
de horário/endereço com confiança suficiente, ou pedido isolado pela chave Pix,
gera saída do piloto. Anexo, pedido humano, pausa humana e outros assuntos
seguem para o fluxo anterior. O processador sombra continua registrando a
auditoria do turno sem enviar outra mensagem.

## Ativação

1. Publicar o código e confirmar o deploy. Não ativar a flag antes disso.
2. Conferir que a Loja 1 segue em `shadow` e que a automação está habilitada.
3. Alterar somente a configuração da Loja 1 para
   `whatsapp_automation.ai_redesign.safe_replies_enabled = true`, preservando
   todas as outras chaves de `stores.settings`. Se `mode` acabou de mudar para
   `shadow`, aguardar até um minuto pela atualização do cache de captura.
4. Validar com um número de teste: horário, endereço, chave Pix, pedido humano
   e anexo. Conferir que cada entrada teve no máximo uma saída e que a chave
   usada é a oficial da loja, sem imprimir seu valor em logs ou relatórios.

## Reversão

Alterar somente `safe_replies_enabled` para `false` na Loja 1, preservando o
restante da configuração. As próximas entradas voltam ao roteador anterior;
mensagens já enviadas não podem ser recolhidas. O modo `shadow` pode continuar
registrando decisões sem afetar a resposta. Se for necessário interromper
também essa captura, retornar `mode` para `legacy` separadamente.
