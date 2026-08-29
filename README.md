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

## Neosmart e APIs da Torre

Desde 21/07/2026, a antiga Torre é um produto e repositório próprio chamado
**Neosmart**, localizado em `..\torre-neosmart`. Este repositório MB Optical
permanece como backoffice, fonte de verdade e servidor das APIs autenticadas.

A Torre possui uma experiência operacional própria, que deve funcionar com a
credencial do dispositivo pareado e sem exigir login do sistema completo.
Rotas, buscas de clientes, avaliação e indicação de lentes precisam respeitar
o `store_id` da Torre e não podem redirecionar o touch para `/login`.

O fluxo atual inclui campo visual com MediaPipe, persistência local-first de
sessões e clientes provisórios, sincronização posterior e avaliação de lentes.
Falhas de sincronização não devem apagar dados locais nem duplicar clientes;
eventos da outbox precisam permanecer idempotentes.

Na configuração remota da Torre ainda precisamos incluir explicitamente:

- importação e ativação do catálogo global permitido para a loja;
- configuração comercial das indicações de lentes, incluindo famílias,
  tratamentos, prioridades, regras de apresentação e disponibilidade;
- versionamento, ativação, desativação e sincronização desses dois blocos por
  `store_id`.

O Electron da Neosmart deve baixar e aplicar essa configuração somente depois de validar a
credencial do dispositivo e a loja pareada. A tela de avaliação não deve
depender de uma sessão humana do dashboard para carregar o catálogo autorizado.

Novas interfaces, cache local e empacotamento Electron pertencem ao repositório
Neosmart. O MB Optical deve conservar somente o backoffice e os endpoints de
integração, incluindo os contratos versionados `/api/tower/v1/web/*`. A UI
antiga da Torre só deve ser removida daqui depois da homologação do piloto.

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

## Regra financeira: venda, pagamentos e carne

O saldo da venda representa somente o valor que ainda nao foi coberto por pagamento direto ou pelo compromisso formalizado no carne. Depois que um carne e assinado, o compromisso de recebimento deixa de ser a venda e passa a ser exclusivamente o carne. Portanto, uma venda integralmente financiada deve ficar com `valor_restante = 0` e pode ser fechada, mesmo que existam parcelas futuras em aberto.

- Venda de R$ 30,00; carne assinado de R$ 30,00: falta R$ 0,00 na venda. Os R$ 30,00 passam a ser recebidos apenas pelas parcelas do carne.
- Venda de R$ 30,00; pagamentos diretos de R$ 10,00 e R$ 5,00; carne assinado de R$ 15,00: falta R$ 0,00 na venda. Os R$ 15,00 restantes pertencem exclusivamente ao carne.
- Venda de R$ 30,00; pagamento direto de R$ 30,00; sem carne: falta R$ 0,00 na venda.

Pagamentos de parcelas nao podem ser somados novamente como pagamentos diretos da venda. Tambem nao se deve criar um Pix direto de venda depois de um carne integral já assinado: isso aumentaria o total comprometido pelo cliente. Se for necessário alterar esse acordo, o fluxo deve ajustar ou substituir o carne de forma auditavel, antes de registrar qualquer novo pagamento.

## Versionamento de deploy

`1.02.00` e o deploy mais antigo atualmente registrado neste repositorio. Versoes anteriores so devem ser acrescentadas se houver uma fonte confiavel para recupera-las.

O rodape da Central de Operacoes exibe a versao atual e permite abrir o historico de deploys. O registro fica em `src/lib/release-history.ts`.

- O histórico de versões registra somente correções de funcionalidades que já estão em produção. Novas implementações, evoluções de funcionalidades e correções feitas antes da primeira publicação não abrem versão nem recebem item no histórico, salvo solicitação expressa do usuário.
- `PENDING_RELEASE_VERSION` só é aberta para uma correção de funcionalidade em produção, usando o próximo patch (por exemplo, `1.02.04`), e permanece assim até o deploy.
- `PENDING_RELEASE_CHANGES` reúne apenas as correções de produção que serão entregues nessa versão. A redação deve descrever o comportamento final percebido pelo usuário, nunca tentativas, erros intermediários, fallbacks técnicos ou detalhes internos de implementação.
- Se uma correção pendente for desfeita, abandonada ou substituída antes do deploy, remova ou atualize seu item para que a lista descreva somente o que será entregue.
- `RELEASE_HISTORY` guarda apenas deploys concluidos e preserva todas as versoes antigas.
- Depois que o deploy for concluido, inserir a versao pendente no inicio de `RELEASE_HISTORY`, mover para ela as mudancas pendentes e limpar `PENDING_RELEASE_VERSION` e `PENDING_RELEASE_CHANGES`.
- Alterar a linha/minor, como `1.02.xx` -> `1.03.00`, somente mediante solicitacao expressa do usuario.
- O modal mostra inicialmente os tres deploys mais recentes e carrega versoes mais antigas conforme a rolagem; o arquivo nao deve descartar historico antigo.

## Arquivos de contexto util

- [WHATSAPP_VPS_EVOLUTION_PLAN.md](/G:/projetos/gestao-otica-pro/WHATSAPP_VPS_EVOLUTION_PLAN.md:1)
- [WHATSAPP_IA_MASTER_PLAN.md](/G:/projetos/gestao-otica-pro/WHATSAPP_IA_MASTER_PLAN.md:1)
- [WHATSAPP_FAKE_MODAL_SPEC.md](/G:/projetos/gestao-otica-pro/WHATSAPP_FAKE_MODAL_SPEC.md:1)

## Observacao final

O `README.md` foi intencionalmente mantido sem IP, usuario, segredo, cron real ou passo a passo sensivel de infraestrutura. Esse tipo de detalhe deve ficar em runbook local ignorado pelo Git.

## Diario de desenvolvimento
## Memória do projeto

Este projeto possui uma memória externa localizada no repositório `brain`.

Ao concluir uma alteração relevante ou encerrar uma sessão de trabalho, atualize o arquivo correspondente deste projeto localizado em:

`..\brain\gestao-otica-pro.md`

Essa memória será utilizada por outras IAs para recuperar rapidamente o contexto do projeto e decidir os próximos passos. Portanto, registre apenas informações úteis para continuidade do desenvolvimento.

Utilize apenas fatos confirmados durante a implementação. Nunca invente resultados, testes, decisões ou pendências.

O arquivo deve conter uma única entrada para cada dia. Caso já exista uma entrada para a data atual, atualize essa mesma seção em vez de criar outra. Preserve integralmente todo o histórico dos dias anteriores.

Cada entrada deve conter obrigatoriamente:

- O que foi feito.
- Problemas encontrados ou pendências.
- Próximos passos.
- Ideias futuras.

Ao registrar o trabalho:

- Consolide alterações relacionadas em vez de criar vários itens pequenos.
- Registre apenas alterações relevantes para o entendimento do projeto.
- Diferencie claramente o que foi concluído, o que ficou parcialmente implementado, o que ainda precisa ser testado e o que é apenas uma ideia futura.
- Organize os próximos passos em ordem de prioridade.
- Sempre que possível, indique se um próximo passo possui consumo de IA baixo, médio ou alto.
- Grave o arquivo sempre em UTF-8, preservando corretamente todos os caracteres em português.
- Nunca registre senhas, tokens, chaves de API, certificados, dados de clientes, informações fiscais confidenciais ou qualquer informação sensível.

Após atualizar a memória:

1. Faça commit apenas das alterações realizadas no repositório `brain`.
2. Utilize uma mensagem de commit curta e objetiva, por exemplo:

   `docs: atualizar memória da gestão ótica`

3. Faça push para o GitHub.
4. Caso o commit ou o push falhem, informe claramente o erro e não considere a memória sincronizada.

O objetivo desta memória é permitir que qualquer IA continue o desenvolvimento exatamente do ponto onde a sessão anterior terminou, sem necessidade de reconstruir o contexto novamente.
