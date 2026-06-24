# Inbound Aggregation

O webhook da VPS agrupa mensagens de texto recebidas do mesmo cliente antes de chamar o app em `/api/whatsapp/customer-status`.

## Variavel

- `WHATSAPP_INBOUND_AGGREGATION_WINDOW_MS`
- Padrao atual: `10000`

## Regra

Cada nova mensagem de texto recebida dentro da janela reinicia o temporizador.
Quando o cliente fica sem mandar novas mensagens pelo tempo configurado, o servico concatena todas as frases com quebra de linha e envia um unico bloco para o app.

Exemplo:

```text
Ola
Tudo bem?
Eu estava pensando aqui
Sera que eu devo alguma coisa pra otica?
Pode ver se tem alguma parcela atrasada?
```

O app so recebe o texto acima depois do silencio final da janela configurada.

## Alcance

Essa agregacao acontece antes da logica de roteamento do app. Entao ela vale para qualquer conversa automatica que entre por `services/whatsapp-automation/server.mjs`, inclusive quando o cliente responde em varias partes durante uma automacao ja ativa.

Ela deixa de importar apenas quando a conversa ja foi entregue para fluxo humano e o app decide nao responder automaticamente.
