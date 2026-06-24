# WhatsApp Automation

Serviço independente que recebe webhooks da Evolution API, consulta o
`gestao-otica-pro` e envia uma resposta apenas quando existe uma OS aberta para
o telefone recebido.

## Variáveis

- `APP_BASE_URL`: URL pública do `gestao-otica-pro`.
- `WHATSAPP_INTERNAL_SECRET`: segredo compartilhado com o app.
- `EVOLUTION_API_URL`: URL base da Evolution API.
- `EVOLUTION_API_KEY`: chave global da Evolution API.
- `EVOLUTION_WEBHOOK_SECRET`: segredo exigido no webhook.
- `PORT`: porta HTTP, padrão `8080`.

## Webhook

Configure cada instância da Evolution para chamar:

```text
https://SEU-DOMINIO/webhooks/evolution/NOME_DA_INSTANCIA?token=SEU_SEGREDO
```

Eventos esperados:

- mensagens recebidas (`messages.upsert` ou equivalente);
- atualização de conexão (`connection.update` ou equivalente).

O proxy reverso da VPS deve encaminhar essa URL para `127.0.0.1:8080`.

## Execução local com Docker

```bash
docker compose -f compose.example.yml up -d --build
```

O serviço não acessa diretamente o Supabase. Todo acesso de negócio passa pelos
endpoints internos autenticados do app.

## Envio administrativo

`POST /admin/messages/send` aceita mensagem de texto ou uma mídia real. A mídia
pode ser `document` (PDF) ou `image` (JPEG, PNG ou WebP), enviada em base64 com
limite de 10 MB. O conteúdo do arquivo não deve ser persistido nem registrado em
logs; o app guarda somente os metadados e o estado de entrega.

## Produção na VPS

Os arquivos em `deploy/` seguem o mesmo padrão operacional do serviço fiscal:

- `whatsapp-automation.service`: alternativa para executar o processo via `systemd`;
- `whatsapp-automation.env.example`: ambiente da automação;
- `evolution-compose.yml`: Evolution API, PostgreSQL e Redis;
- `evolution.env.example`: ambiente mínimo da Evolution.

A composição de produção também inclui o container da automação. A Evolution
fica em `127.0.0.1:8080`, a automação expõe apenas o healthcheck em
`127.0.0.1:8081` e a comunicação entre ambas ocorre pela rede privada Docker.
