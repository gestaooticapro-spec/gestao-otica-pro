# WhatsApp VPS Runbook Local

## Objetivo

Guardar o contexto operacional real do WhatsApp para nao depender de memoria de conversa ao retomar deploy, debug ou manutencao.

Este arquivo e local e esta no `.gitignore`.

## Acesso

- SSH usado hoje:

```bash
ssh root@191.252.205.29
```

- Host observado:

```text
vps68068
```

## Arquitetura atual

- App principal:

```text
Vercel
https://gestao-otica-pro.vercel.app
```

- Servico de automacao WhatsApp:

```text
/opt/whatsapp-automation
```

- Compose ativo na VPS:

```text
/opt/whatsapp-automation/deploy/evolution-compose.yml
```

- O ambiente atual usa Docker Compose, nao `systemd`.
- O `systemd` `whatsapp-automation.service` existe no repo como alternativa, mas na VPS o `systemctl is-active whatsapp-automation` estava `inactive`.

## Containers confirmados

Pelos checks feitos em 2026-06-22:

- `whatsapp_automation`
- `evolution_api`
- `evolution_postgres`
- `evolution_redis`

Imagem do servico principal:

```text
deploy-whatsapp-automation:latest
```

## Portas e proxy

- Nginx publico:
  - `80`
  - `443`
- Evolution exposta apenas localmente:

```text
127.0.0.1:8080
```

- Automacao WhatsApp exposta apenas localmente:

```text
127.0.0.1:8081
```

- Processo `127.0.0.1:3001` visto na VPS era do `nuvem-local-fiscal`, nao do WhatsApp.

## Caminhos importantes

- Projeto do servico:

```text
/opt/whatsapp-automation
```

- Deploy Compose:

```text
/opt/whatsapp-automation/deploy
```

- Arquivo do app da automacao:

```text
/opt/whatsapp-automation/server.mjs
```

- Env do Compose:

```text
/opt/whatsapp-automation/deploy/automation.env
/opt/whatsapp-automation/deploy/evolution.env
```

## Comandos de diagnostico

Listar containers:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
```

Health da automacao:

```bash
curl -fsS http://127.0.0.1:8081/health
```

Health da Evolution:

```bash
curl -fsS http://127.0.0.1:8080
```

Logs da automacao:

```bash
docker logs --tail 80 whatsapp_automation
```

Logs da Evolution:

```bash
docker logs --tail 80 evolution_api
```

Ver compose em uso:

```bash
cd /opt/whatsapp-automation
docker compose -f deploy/evolution-compose.yml ps
```

## Deploy do app principal

Quando houver commits locais ainda nao enviados, o caminho mais direto e:

```bash
npx vercel --prod --yes
```

Depois disso, confirmar que o alias principal continua:

```text
https://gestao-otica-pro.vercel.app
```

## Deploy da automacao WhatsApp na VPS

Arquivos que normalmente importam:

- `services/whatsapp-automation/server.mjs`
- `services/whatsapp-automation/package.json`
- `services/whatsapp-automation/Dockerfile`
- `services/whatsapp-automation/run-installment-reminders.sh`

Copiar arquivos:

```bash
scp services/whatsapp-automation/server.mjs services/whatsapp-automation/package.json services/whatsapp-automation/Dockerfile services/whatsapp-automation/run-installment-reminders.sh root@191.252.205.29:/opt/whatsapp-automation/
```

Rebuild e restart do servico:

```bash
ssh root@191.252.205.29 "cd /opt/whatsapp-automation/deploy && docker compose -f evolution-compose.yml up -d --build whatsapp-automation"
```

## Cuidado operacional

- Esse comando recriou tambem o `evolution_postgres` numa rodada real de deploy, embora sem perda aparente de dados porque o volume foi mantido.
- Depois de qualquer rebuild, sempre conferir:
  - `docker ps`
  - `curl http://127.0.0.1:8081/health`
  - `curl http://127.0.0.1:8080`
  - logs recentes de `whatsapp_automation`

## Cron atual

Estado ajustado em 2026-06-22:

- Parcelas:

```text
0,30 9-17 * * 1-5 curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://gestao-otica-pro.vercel.app/api/whatsapp/installment-reminders >> /var/log/whatsapp-installment-reminders.log 2>&1
```

- Pos-venda:

```text
15,45 9-17 * * 1-5 curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://gestao-otica-pro.vercel.app/api/whatsapp/post-sale-followups >> /var/log/whatsapp-post-sale-followups.log 2>&1
```

Observacoes:

- Parcelas e pos-venda ficam alternados para nao sobrepor.
- O horario 9-17 no cron evita chamada inutil apos 18h. O proprio app ainda aplica gates internos.

Ver crontab:

```bash
crontab -l
```

Backup de crontab criado na rodada de 2026-06-22:

```text
/root/crontab.backup.20260622204716
```

## Validacoes uteis apos deploy

Rota protegida deve devolver `401` sem bearer:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://gestao-otica-pro.vercel.app/api/whatsapp/post-sale-followups
```

Comparar hash do `server.mjs` local vs VPS/container:

```bash
sha256sum /opt/whatsapp-automation/server.mjs
docker exec whatsapp_automation sha256sum /app/server.mjs
```

## Observacoes de comportamento

- O operacional do programa le `whatsapp_outbound_messages` e `whatsapp_conversation_states`, entao lembretes de parcela e pos-venda automatico devem aparecer na thread do cliente quando o outbound for gravado corretamente.
- A tabela `whatsapp_post_sale_followups` ja existia no banco em 2026-06-22.
- A alteracao de `post_sales_interactions.registrado_por_id` para aceitar `null` tambem aparentava estar aplicada.

## Pendencias que vale checar no futuro

- Documentar o bloco exato do Nginx que aponta para `127.0.0.1:8081`.
- Avaliar um comando de deploy da VPS que nao recrie `evolution_postgres`.
- Guardar um procedimento padrao para testes controlados de outbound sem afetar cliente real.
