# gestao-otica-pro

Aplicacao principal de operacao para otica, com foco em atendimento, vendas, laboratorio, financeiro, pos-venda, relatorios e automacoes de WhatsApp por loja.

## Stack

- Next.js 14
- React 18
- TypeScript
- Supabase
- Tailwind CSS
- Vercel no app principal
- Evolution API + servico Node separado para automacao de WhatsApp

## Scripts

```bash
npm run dev
npm run build
npm run lint
```

O app local abre em `http://localhost:3000`.

## Estrutura principal

- `src/app`
  rotas do App Router, incluindo dashboard, tablet, laboratorio, NFC, impressao e APIs internas.
- `src/lib/actions`
  server actions e integracoes de negocio.
- `src/lib/whatsapp`
  regras da automacao, roteamento, estados de conversa, cobranca e pos-venda.
- `src/components`
  interface operacional, configuracoes e modais.
- `supabase/migrations`
  evolucao de schema e ajustes operacionais.
- `services/whatsapp-automation`
  servico externo que recebe webhook da Evolution e conversa com o app por rotas autenticadas.

## Modulos de negocio

- Atendimento e vendas por loja
- Ordens de servico e laboratorio
- Entrega e rastreio
- Financeiro, parcelas e cobranca
- Pos-venda
- NFC para bandejas e fluxo de laboratorio
- Relatorios operacionais e gerenciais
- WhatsApp operacional com automacoes conservadoras

## WhatsApp

O projeto tem duas partes separadas:

1. `gestao-otica-pro`
   define regras de negocio, filas, estados de conversa e rotas internas como:
   - `/api/whatsapp/customer-status`
   - `/api/whatsapp/delivery`
   - `/api/whatsapp/installment-reminders`
   - `/api/whatsapp/post-sale-followups`

2. `services/whatsapp-automation`
   servico externo que recebe eventos da Evolution API e envia mensagens usando os endpoints internos do app.

Documentacao especifica desse servico:

- [services/whatsapp-automation/README.md](/G:/projetos/gestao-otica-pro/services/whatsapp-automation/README.md:1)
- [services/whatsapp-automation/deploy/evolution-compose.yml](/G:/projetos/gestao-otica-pro/services/whatsapp-automation/deploy/evolution-compose.yml:1)

Observacao:
detalhes operacionais sensiveis da VPS, acessos e cron devem ficar em documentacao local nao versionada.

## Banco e migracoes

As mudancas de banco ficam em `supabase/migrations`.

Quando uma feature depender de tabela nova, indice novo ou alteracao estrutural, confirme que a migration foi aplicada antes de validar apenas pela interface.

## Deploy

### App principal

- hospeda na Vercel
- pode ser publicado por integracao Git ou `npx vercel --prod`

### Automacao WhatsApp

- roda separada do app principal
- usa os artefatos em `services/whatsapp-automation`
- pode usar Docker Compose na VPS ou `systemd`, conforme ambiente

Antes de considerar um deploy completo de WhatsApp, normalmente precisamos validar:

- app principal atualizado
- migrations aplicadas
- servico `whatsapp-automation` atualizado
- cron ou scheduler das rotas internas configurado

## Convencoes importantes

- O projeto trabalha com contexto real de `storeId`.
- Em fluxos de WhatsApp, o sistema deve respeitar handoff humano e nao atravessar conversa assumida por funcionario.
- Para mudancas de configuracao por loja, a fonte canonica costuma ficar em `stores.settings`.
- Em mudancas operacionais, priorize comportamento confiavel e auditavel antes de sofisticacao.

## Arquivos de contexto util

- [WHATSAPP_VPS_EVOLUTION_PLAN.md](/G:/projetos/gestao-otica-pro/WHATSAPP_VPS_EVOLUTION_PLAN.md:1)
- [WHATSAPP_IA_MASTER_PLAN.md](/G:/projetos/gestao-otica-pro/WHATSAPP_IA_MASTER_PLAN.md:1)
- [WHATSAPP_FAKE_MODAL_SPEC.md](/G:/projetos/gestao-otica-pro/WHATSAPP_FAKE_MODAL_SPEC.md:1)

## Observacao final

O `README.md` foi intencionalmente mantido sem IP, usuario, segredo, cron real ou passo a passo sensivel de infraestrutura. Esse tipo de detalhe deve ficar em runbook local ignorado pelo Git.

## Diario de desenvolvimento

Ao final de cada alteracao relevante, atualize o arquivo `..\brain\gestao-otica-pro.md` usando o conhecimento disponivel no contexto da alteracao. O diario deve ter uma unica entrada por dia: alteracoes feitas no mesmo dia devem atualizar ou sobrescrever a secao daquele dia; quando mudar a data, crie uma nova secao e preserve integralmente o historico dos dias anteriores. O diario deve registrar:

- o que foi feito;
- problemas encontrados ou pendencias;
- proximos passos;
- ideias futuras.

O arquivo pertence ao repositorio `brain`, nao a este projeto. Depois de atualizar o diario, faca commit e push para o GitHub no repositorio `brain`.
