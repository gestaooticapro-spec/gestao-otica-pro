# MB Optical

Aplicacao principal de operacao para otica, com foco em atendimento, vendas, laboratorio, financeiro, pos-venda, relatorios e automacoes de WhatsApp por loja.

## Pendencias identificadas em auditorias

Ha possiveis erros e comportamentos financeiros aguardando revisao em
[docs/AUDITORIA_PENDENCIAS.md](docs/AUDITORIA_PENDENCIAS.md). Em cada novo
contexto de trabalho, consulte esse arquivo e lembre o usuario de que ha
pendencias de auditoria, sem desviar da tarefa atual. Registre ali novos pontos
encontrados em auditorias futuras. Ao terminar o trabalho atual sobre a base de
conhecimento e o assistente, retome com o usuario a analise desses pontos.
Nao trate os relatos como falhas confirmadas ou corrigidas sem verificacao.

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

### Redesign como padrao do WhatsApp

O redesign completo e o fluxo padrao do programa em todas as lojas. A loja
continua decidindo se usa o WhatsApp, a automacao e a IA pelas configuracoes
existentes; nao existe uma ativacao separada para escolher o redesign.
Os campos antigos `ai_redesign.mode` e `safe_replies_enabled` ficam preservados
como historico e nao selecionam mais o motor de atendimento. Configuracao ausente,
`legacy`, `shadow` ou flag antiga desativada nao levam ao fluxo anterior.

Automacao e IA desativadas continuam respeitadas. Agenda, consulta de OS,
lembretes, pos-venda, controles humanos, endereco e Pix continuam individuais.
Nenhuma configuracao da Loja 1 e copiada para outra loja.

A publicacao exige a migration `20261030120000_whatsapp_full_redesign_all_stores.sql`
e o scheduler de decisoes/retomadas abrangendo as lojas que usam o atendimento.
Nao e preciso executar comando de ativacao por loja. O procedimento completo esta em
[docs/whatsapp-redesign-all-stores-rollout.md](docs/whatsapp-redesign-all-stores-rollout.md).

### Continuidade do pos-venda no WhatsApp

O atendimento da Loja 1 recupera pos-vendas ainda abertos por ate 30 dias,
somente quando existe um contato automatico confirmado e um unico acompanhamento
identificavel. Cumprimentos retomam a pergunta pendente sem registrar adaptacao
positiva; boa adaptacao com ajuste simples de armacao tem encaminhamento proprio,
sem alerta de reclamacao visual. Pedidos explicitos de atendente e pausas humanas
continuam respeitados. Antes de disparar ou repetir o primeiro contato, a rotina
revalida o grupo de OSs e recalcula os dias desde a entrega. Contatos com mais de
30 dias sao cancelados para revisao. O painel distingue tentativa de envio de
mensagem enviada e apresenta os motivos de pausa em portugues.

Na Loja 1, um arquivo adicional durante o encaminhamento pendente nao repete
a apresentacao nem o aviso de chamar a equipe. Antes de criar essa resposta,
o fluxo tambem consulta a ultima saida real da conversa (pendente, enviando ou
enviada), para cobrir atraso na memoria. Essa protecao respeita IA proxima,
nao transforma uma falha anterior em envio confirmado e vale por ate 48 horas.

Apos o fim da pausa humana, a Loja 1 retoma avisos de retirada da equipe
presentes no historico das ultimas 48 horas. Cumprimentos preservam o assunto;
confirmacoes de que o cliente vai buscar recebem apenas um reconhecimento, sem
nova consulta de OS ou promessa de agendamento. Outro assunto ou aviso posterior
invalida essa associacao; perguntas de status e pedidos humanos mantem prioridade.

Na Loja 1, audios seguem para atendimento humano com confirmacao neutra e
sem transcricao ou interpretacao do conteudo pelos modelos de texto. A rotina
preserva o vinculo do acompanhamento em handoff e reutiliza a protecao contra encaminhamentos
repetidos. Classificacao contextual de pos-venda exige texto real sem anexo.

### Limpeza do WhatsApp operacional

A limpeza possui uma rotina diaria autenticada no app principal, com agenda
versionada no `vercel.json`. Ela entra em vigor depois do deploy;
nenhuma limpeza e executada ao abrir o painel.
O painel de Manutencao permite consultar a previa e executar uma rodada manual.

Cada rodada, por loja com canal cadastrado, remove ate 250 registros de cada tipo:
logs de IA com mais de 30 dias; mensagens recebidas finalizadas e mensagens
enviadas/concluidas com mais de 15 dias; estados ja expirados sem atualizacao
ha mais de 7 dias. Estados humanos, conversas sob controle humano (incluindo
o novo fluxo e formatos equivalentes de telefone) e mensagens com processamento
ou envio pendente sao preservados. Falhas de envio tambem preservam a conversa
para permitir recuperacao. A memoria, mensagens e turnos do redesign nao entram
nesta limpeza. O restante dos candidatos fica para as proximas rodadas.

A execucao retorna contagens por loja, sem textos ou telefones, e sinaliza falhas
com HTTP 500 para acompanhamento pelo scheduler. A previa usa a mesma politica
da execucao manual e automatica. Nenhuma mensagem de WhatsApp e enviada pela rotina.

## Banco e migracoes

As mudancas de banco ficam em `supabase/migrations`.

Quando uma feature depender de tabela nova, indice novo ou alteracao estrutural, confirme que a migration foi aplicada antes de validar apenas pela interface.

Em 06/11/2026, o usuario informou que a migration de Clientes Sumidos
`20261106120000_inactive_customer_list_controls.sql` ja estava aplicada e que
executou com sucesso, nesta ordem, `20261106140000_reverse_store_credit_payment.sql`,
`20261106150000_atomic_wallet_operations.sql` e
`20261106160000_atomic_integral_sale_return.sql`.
Na mesma data, informou sucesso tambem na aplicacao de
`20261106170000_atomic_direct_payment_removal.sql` e
`20261106180000_guard_direct_payment_sale_balance.sql`.
Em 07/11/2026, informou tambem a aplicacao com sucesso de
`20261107120000_guard_sale_closing_balance.sql`, depois da 180000.
Na mesma data, informou sucesso na aplicacao de
`20261107140000_atomic_payment_method_change.sql`, depois da migration de fechamento.
O ambiente do banco nao foi especificado. Esse e um registro do relato do
usuario, sem consulta independente ao banco. A publicacao do aplicativo e a
validacao operacional das correcoes continuam pendentes de confirmacao.

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

## Fluxos de vendas em uso

Sempre que tratarmos de vendas, seja em analises, auditorias, correcoes ou novas
implementacoes, considere os dois fluxos em uso: **Venda Expressa** e
**Venda Experimental**. Verifique o impacto em ambos, incluindo as rotinas
compartilhadas. Os demais fluxos de vendas presentes no codigo nao estao sendo
usados na operacao atual.

Na aba Pagamento da Venda Expressa, o valor pago deve ser igual ao total da
cesta. A tela e o servidor bloqueiam valores inferiores ou superiores antes de
criar a venda; pagamentos parciais devem ser feitos pela Venda Experimental.
Na Experimental, o pagamento direto nao pode superar A Receber. Em ambas,
inclusive em dinheiro, registre somente o valor liquido, sem o troco devolvido:
venda de R$ 100,00, entrega de R$ 120,00 e troco de R$ 20,00 geram pagamento de
R$ 100,00. Nao ha campo separado de valor entregue ou calculo de troco.

A protecao no banco usa a migration
`20261106180000_guard_direct_payment_sale_balance.sql`, aplicada com sucesso
conforme relato do usuario em 06/11/2026, sem consulta independente ao banco.
Publicacao e validacao operacional continuam pendentes de confirmacao.
Antes de cada inclusao/alteracao financeira de pagamento direto,
o banco bloqueia a venda e calcula o limite com itens, desconto, pagamentos
diretos anteriores e valor formalizado no carne. O saldo e recalculado na mesma
transacao do pagamento. Recebimentos de parcelas seguem seu proprio fluxo e
nao sao descontados duas vezes; importacoes historicas ficam fora dessa regra.
Nenhum pagamento antigo e corrigido retroativamente pela migration.
Os testes usam `npm run test:wallet:setup` e `npm run test:payment-limit`.

O Pix Sicredi tambem recusa um centavo acima do saldo ao gerar a cobranca. Se o
provedor confirmar pagamento depois de o saldo ter sido coberto por outra forma,
a baixa excedente e bloqueada no banco e o fluxo existente sinaliza erro de
conciliacao para revisao; isso nao devolve dinheiro automaticamente ao cliente.

## Regra financeira: venda, pagamentos e carne

Na aba Carne da Expressa, o cliente selecionado acompanha o componente de
financiamento. Sem documento ou celular, a janela de complemento abre antes do
PIN; cadastros PF e PJ usam CPF ou CNPJ, respectivamente. Durante a criacao,
cliques repetidos e troca para pagamento direto ficam bloqueados no modal.
Depois de criada a venda, sair pelo X ou por Continuar na Venda Experimental
limpa a cesta da Expressa e abre o mesmo registro para retomar. A selecao ainda
cria a venda e registra estoque antes da emissao do carne; erro de rede com
resultado incerto exige conferir a lista antes de tentar novamente. Essa
correcao de interface nao exige nova migration nem torna a criacao atomica.
Testes locais: `npm run test:express-financing`.

O fechamento da Venda Experimental bloqueia qualquer centavo ainda a receber,
mesmo com carne. O servidor usa `close_sale_with_balance_check`, com sessao e
acesso a loja/tenant conferidos. A nova migration
`20261107120000_guard_sale_closing_balance.sql` foi aplicada com sucesso
conforme relato do usuario em 07/11/2026, depois da 180000. Nao houve consulta
independente ao banco; publicacao e validacao operacional seguem pendentes.
O banco recalcula itens, desconto, pagamentos diretos e valor formalizado no
carne na mesma transacao da transicao para Fechada. A insercao inicial fechada
da Expressa e os historicos mantem seu fluxo. A geracao compartilhada de carne
nao arredonda saldo pendente de ate quatro centavos para zero.
Comissao, estoque e ranking continuam posteriores a confirmacao do status.
Validacao local: `npm run test:wallet:setup` e `npm run test:sale-closing`.

O saldo da venda representa somente o valor que ainda nao foi coberto por pagamento direto ou pelo compromisso formalizado no carne. Depois que um carne e assinado, o compromisso de recebimento deixa de ser a venda e passa a ser exclusivamente o carne. Portanto, uma venda integralmente financiada deve ficar com `valor_restante = 0` e pode ser fechada, mesmo que existam parcelas futuras em aberto.

- Venda de R$ 30,00; carne assinado de R$ 30,00: falta R$ 0,00 na venda. Os R$ 30,00 passam a ser recebidos apenas pelas parcelas do carne.
- Venda de R$ 30,00; pagamentos diretos de R$ 10,00 e R$ 5,00; carne assinado de R$ 15,00: falta R$ 0,00 na venda. Os R$ 15,00 restantes pertencem exclusivamente ao carne.
- Venda de R$ 30,00; pagamento direto de R$ 30,00; sem carne: falta R$ 0,00 na venda.

Pagamentos de parcelas nao podem ser somados novamente como pagamentos diretos da venda. Tambem nao se deve criar um Pix direto de venda depois de um carne integral já assinado: isso aumentaria o total comprometido pelo cliente. Se for necessário alterar esse acordo, o fluxo deve ajustar ou substituir o carne de forma auditavel, antes de registrar qualquer novo pagamento.

Na renegociacao de uma venda `Em Aberto`, o saldo parcelado pode ser reduzido para receber uma entrada posterior. A diferenca reduz o valor formalizado no carne e volta a `valor_restante`, liberando `Novo pagamento`. O dinheiro anteriormente recebido nas parcelas e preservado no valor formalizado; somente a parte ainda pendente pode voltar para a venda. A renegociacao registra saldo anterior, saldo novo e diferenca no historico, sem criar um recebimento. Vendas fechadas permitem redistribuir o mesmo saldo entre parcelas, mas nao reduzir o valor. Exemplo: carne de R$ 900,00 renegociado para R$ 700,00 devolve R$ 200,00 ao saldo da venda; o recebimento efetivo desses R$ 200,00 zera novamente o saldo.

## Observacao da renegociacao

O formulario compartilhado de carne envia a observacao opcional para
`renegotiate_store_financing_with_note`, que chama a rotina financeira existente
e grava `installment_renegotiations.note` na mesma transacao. Autor e data ficam
no registro do acordo; observacoes anteriores e a observacao original do carne
sao preservadas. Texto vazio vira null; limite de 2000 caracteres na tela,
action e banco. A nova migration
`20261107160000_financing_renegotiation_note.sql` precisa ser aplicada depois da
20261107140000 e antes de publicar; ainda pendente de aplicacao. Sem essa RPC,
a action falha sem tentar renegociar sem a observacao. Nenhum texto perdido em
renegociacoes antigas e recuperado retroativamente. O historico e persistido no
banco; esta correcao nao cria uma tela de consulta do historico.
Testes: `npm run test:wallet:setup` e `npm run test:renegotiation-note`.

## Estorno de pagamento em credito em loja

Ao remover um pagamento direto em Credito em Loja de uma venda em aberto,
o valor deve voltar uma unica vez a carteira do cliente que pagou. A devolucao,
o extrato, a exclusao do pagamento e o recalculo da venda ocorrem na mesma
transacao. A publicacao dessa correcao exige aplicar primeiro a migration
`20261106140000_reverse_store_credit_payment.sql`. A rotina exige a carteira
original e lastro do debito no extrato; inconsistencias bloqueiam a remocao.

Os testes locais dessa operacao usam PostgreSQL em memoria, com dados sinteticos:
execute `npm run test:wallet:setup` uma vez e depois `npm run test:wallet`.
Essa validacao nao confirma o schema instalado no Supabase de producao.

A adicao de credito grava saldo e extrato na mesma transacao. O uso na Venda
Experimental grava pagamento, debito da carteira, extrato e saldo da venda
juntos. As rotinas bloqueiam a carteira durante a atualizacao e identificam
cada tentativa para impedir repeticao com a mesma chave. O formulario preserva
a chave ao repetir os mesmos dados enquanto permanece aberto; fechar ou
recarregar a pagina inicia outra tentativa e exige conferir o historico antes
de reenviar uma operacao cujo resultado ficou incerto.

Essa protecao exige tambem `20261106150000_atomic_wallet_operations.sql`, depois
da migration de estorno e antes de publicar o app. Nenhuma rotina de debito
isolado da carteira permanece no servidor da aplicacao atualizada.

## Devolucao integral de venda

O fluxo autorizado aceita somente venda fechada, integralmente quitada, sem
carne e nao historica. Todos os itens sao devolvidos juntos, com reembolso
do valor final em Credito em Loja, incluindo o desconto. Devolucao parcial,
venda com carne e Estorno Financeiro ficam bloqueados ate definicao propria.
O cadastro compartilhado Consumidor Final, usado na Venda Expressa, exige
identificar o titular antes de receber credito em carteira. A devolucao de uma
venda originada na Expressa e feita ao abri-la pela Venda Experimental.

A autorizacao por PIN gera um token assinado para a venda e a tentativa.
O servidor busca valores e quantidades no banco e confirma estoque, credito,
extrato, status Devolvida, estorno das comissoes pendentes e historico na mesma
transacao. A mesma venda nao pode ser devolvida outra vez nem reaberta por esse
fluxo; seus itens, pagamentos originais e titular sao preservados. Comissoes ja pagas
continuam no historico e exigem acerto manual, informado na confirmacao.

Entradas de estoque exigem saidas comprovadas na mesma loja. Pares restauram
duas unidades; defeitos registram perda sem nova baixa. Sobras exigem uma lente
individual com variante original identificada, conservando os graus. Itens
avulsos sem produto cadastrado nao geram entrada ficticia. Registros anteriores
de devolucao ou credito e cobrancas Pix pendentes/incertas exigem revisao antes
de continuar. A devolucao comercial nao cancela notas fiscais nem transfere
dinheiro por Pix/cartao.

A publicacao exige `20261106160000_atomic_integral_sale_return.sql`, depois das
duas migrations da carteira. A validacao local usa `npm run test:wallet:setup`
e `npm run test:sale-return`. As migrations foram testadas em banco sintetico;
o schema instalado em producao e a concorrencia entre conexoes independentes
continuam exigindo verificacao antes da entrega operacional.

## Remocao de pagamento direto comum

A remocao de dinheiro, Pix manual, cartao, cheque e outras formas comuns usa
`remove_direct_sale_payment`. Recebiveis vinculados, pagamento, recalculo do
saldo e snapshot de auditoria sao confirmados na mesma transacao. A rotina
exige venda Em Aberto nao historica, mesma loja/empresa e pagamento direto.
Vendas fechadas precisam ser reabertas pela regra existente; vendas devolvidas
e pagamentos de parcelas continuam protegidos. Credito em Loja usa a rotina
propria de devolucao da carteira.

Pagamento vinculado a cobranca Pix Sicredi nao pode ser apagado por esse fluxo:
exige revisao da conciliacao. A exclusao local de pagamento nao devolve dinheiro
ao banco ou cartao. A comissao continua com recalculo posterior; se esse passo
lancar erro, a resposta informa a pendencia sem negar a remocao ja confirmada.
O historico preserva os valores originais do pagamento e dos recebiveis.

Em 06/11/2026, o usuario informou que aplicou com sucesso
`20261106170000_atomic_direct_payment_removal.sql`. Nao houve consulta independente
ao banco; publicacao e validacao operacional seguem pendentes de confirmacao.
Testes: `npm run test:wallet:setup` e `npm run test:payment-removal`.

## Correcao de forma de pagamento no Livro Caixa

Pagamentos diretos originados na Expressa ou Experimental usam a mesma rotina
`change_payment_method_with_audit`. A nova migration
`20261107140000_atomic_payment_method_change.sql` foi aplicada com sucesso
conforme relato do usuario em 07/11/2026, depois da 20261107120000.
Ela altera forma/parcelamento, recompoe somente recebiveis pendentes e preserva
snapshots na mesma transacao. Recebimento ou conciliacao bloqueiam a edicao;
carteira, Pix integrado, parcelas de carne e vendas historicas/canceladas/devolvidas
exigem revisao no fluxo proprio. A autoria do pagamento continua sendo conferida.
Cartao de credito e Cheque-Pre dividem centavos em 1 a 12 parcelas; vencimentos
seguem intervalos de 30 dias desde a data original, como na criacao existente.
Dinheiro, Pix manual e debito ficam com uma parcela e sem agenda de recebiveis.
Nao ha alteracao do valor/data, recomposicao retroativa nem movimentacao no banco.
O schema remoto e integracoes externas de conciliacao nao foram consultados;
alem do status, a verificacao usa campos opcionais de baixa/conciliacao no JSON.
Validacao local: `npm run test:wallet:setup` e `npm run test:payment-method`.

## Versionamento de deploy

A politica obrigatoria para o historico esta em [RELEASE_VERSIONING_POLICY.md](/G:/projetos/gestao-otica-pro/RELEASE_VERSIONING_POLICY.md:1).
**Trava obrigatoria:** nenhuma versao pode ser aberta, incrementada, fechada, movida para `RELEASE_HISTORY` ou ter seu numero alterado sem o usuario escrever exatamente **"mude a versao"**. Essa frase e a senha/autorizacao exclusiva para qualquer mudanca de numero ou estado da versao; "ready", deploy concluido, "pode fazer" ou autorizacao para outra tarefa nao substituem essa frase. Sem ela, preserve `PENDING_RELEASE_VERSION` e `RELEASE_HISTORY` exatamente como estao. `PENDING_RELEASE_CHANGES` pode ser ajustado para refletir o conteudo real pendente, mas nunca altere numero de versao nem feche/mova o registro. Informacoes internas devem ficar fora dos textos de release.

`1.02.00` e o deploy mais antigo atualmente registrado neste repositorio. Versoes anteriores so devem ser acrescentadas se houver uma fonte confiavel para recupera-las.

O rodape da Central de Operacoes exibe a versao atual e permite abrir o historico de deploys. O registro fica em `src/lib/release-history.ts`.

- A versão exibida no Dashboard é sempre a primeira de `RELEASE_HISTORY`: ela identifica o último deploy fechado. `PENDING_RELEASE_VERSION` nunca altera o número exibido no Dashboard ou no histórico.
- Uma nova versão patch só pode ser aberta depois que a versão atual estiver efetivamente publicada. Commit, push, validação local ou tentativa de deploy não contam como publicação.
- Até a publicação efetiva, toda correção, melhoria ou ajuste solicitado pelo usuário continua pertencendo à versão atual, mesmo depois do comando “mude a versão”. Atualize o registro dessa mesma versão; não abra o próximo patch.
- Depois de uma publicação efetiva, a primeira alteração aprovada abre `PENDING_RELEASE_VERSION` com o próximo patch e entra em `PENDING_RELEASE_CHANGES`; as demais alterações da próxima entrega completam essa mesma versão.
- Itens de implementações novas podem usar caixa alta no histórico. Correções e melhorias devem usar escrita normal, em frase clara para o usuário.
- A redação pendente deve descrever o comportamento final percebido pelo usuário, nunca tentativas, erros intermediários, fallbacks técnicos ou detalhes internos de implementação.
- Se uma alteração pendente for desfeita, abandonada ou substituída antes da publicação, remova ou atualize seu item para que a lista descreva somente o que será entregue.
- A frase **“mude a versão”** é o comando explícito para fechar o registro da versão atual no histórico e preparar sua publicação. Se houver ajustes antes da publicação efetiva, eles corrigem esse mesmo registro já fechado.
- Antes dessa frase, nenhuma alteração pendente deve ser movida para `RELEASE_HISTORY`, mesmo que já tenha sido validada ou esteja pronta para publicar.
- `RELEASE_HISTORY` guarda apenas deploys concluídos e preserva todas as versões antigas. O modal do programa nunca exibe versões pendentes.
- Alterar a linha/minor, como `1.02.xx` -> `1.03.00`, somente mediante solicitacao expressa do usuario.
- O modal mostra inicialmente os tres deploys mais recentes e carrega versoes mais antigas conforme a rolagem; o arquivo nao deve descartar historico antigo.

## Arquivos de contexto util

- [WHATSAPP_VPS_EVOLUTION_PLAN.md](/G:/projetos/gestao-otica-pro/WHATSAPP_VPS_EVOLUTION_PLAN.md:1)
- [WHATSAPP_IA_MASTER_PLAN.md](/G:/projetos/gestao-otica-pro/WHATSAPP_IA_MASTER_PLAN.md:1)
- [WHATSAPP_FAKE_MODAL_SPEC.md](/G:/projetos/gestao-otica-pro/WHATSAPP_FAKE_MODAL_SPEC.md:1)

## Observacao final

O `README.md` foi intencionalmente mantido sem IP, usuario, segredo, cron real ou passo a passo sensivel de infraestrutura. Esse tipo de detalhe deve ficar em runbook local ignorado pelo Git.

Reacoes vinculadas a mensagens (incluindo troca e remocao) sao ignoradas antes
do agrupamento, da classificacao e do registro de atividade humana. A recuperacao
de eventos aplica o mesmo filtro; emoji enviado como mensagem comum continua
no atendimento. A protecao exige publicar o app e atualizar o servico de automacao.

Na Loja 1, a consulta de OS pode usar um nome completo escrito pelo cliente,
inclusive no contexto recente de uma pergunta sobre outra pessoa. A busca fica
na mesma loja, exige um cadastro unico com nome completo correspondente e nao
modifica o vinculo do remetente. Nomes incompletos ou ambiguos pedem identificacao;
a ausencia de pedidos pelo telefone nao e apresentada como busca pelo nome.

O agrupamento do WhatsApp espera ate 120 segundos de silencio enquanto o cliente
envia apenas cumprimentos. Quando chega conteudo, o bloco completo usa a janela
normal de 20 segundos, reiniciada a cada mensagem, antes de chamar a IA.

No pos-venda confirmado da Loja 1, elogios claros acompanhados de comentarios
casuais como so falta pagar continuam o acompanhamento e pedem nota de 1 a 5.
Perguntas financeiras reais seguem o fluxo proprio; comentarios nao afirmam
divida, quitacao nem fatura de cartao. A resposta especializada identifica a
IAra quando ela ainda nao se apresentou no historico recente.

## Assistente de uso da Central de Operacoes

O botao abaixo de Pontos de Atencao abre uma conversa de ajuda baseada em
`docs/BASE_CONHECIMENTO_GESTAO_OTICA_PRO.md`. O contexto dura enquanto o modal
estiver aberto; ao fechar ou iniciar nova conversa, o historico local e descartado.
Cada pergunta envia no maximo cinco pares recentes de pergunta/resposta, com
limite adicional de tamanho, e carrega a base no servidor.

O endpoint `/api/usage-assistant` valida a sessao, o vinculo com a loja e o tenant.
Ele consulta somente as configuracoes necessarias para orientar o uso. Os atalhos
da resposta sao resolvidos por uma lista de destinos permitidos para o perfil e
os modulos da loja, incluindo os modais de parcelas e consulta de cliente.

Cada resposta permite registrar uma avaliacao negativa. Ao clicar, a pergunta
correspondente e a resposta sao guardadas em `usage_assistant_feedback`, com loja,
usuario e data, para revisao posterior. O restante da conversa nao e armazenado;
perguntas de continuacao podem precisar de contexto adicional para analise. A
migration da tabela deve ser aplicada no banco antes de disponibilizar o botao.
O registro exige sessao e acesso a loja e a tabela nao permite acesso direto de
clientes autenticados; a consulta administrativa e feita pelo banco.

Esse assistente usa o mesmo `gemini-2.5-flash` do tutorial existente, com as chaves
`GEMINI_SECRET_KEY_1`, `GEMINI_SECRET_KEY_2` e demais numeradas em ordem numerica.
A chave inicial alterna por processo e as seguintes sao tentadas em caso de falha;
se nenhuma chave numerada existir, utiliza `GOOGLE_API_KEY`. Se Gemini nao produzir
uma resposta valida, o assistente tenta a chave `OPENAI_API_KEY` com o modelo
`gpt-6-luna`. A variavel opcional `USAGE_ASSISTANT_OPENAI_MODEL` permite escolher
outro modelo apenas para esse fallback. A OpenAI recebe a mesma base, contexto e
lista de destinos permitidos, e usa o mesmo filtro de links. O rodizio e o limite
de requisicoes sao locais ao processo, sem coordenacao entre instancias.

Em acesso pelo localhost, o terminal registra o nome da chave consultada, o modelo,
o resultado e a quantidade de tokens de entrada e saida informada pelo provedor.
Nao registra o valor da chave, perguntas ou respostas. Uma chamada que falha sem
informacoes de uso nao permite informar sua contagem de tokens. As chaves ficam
exclusivamente no servidor. O arquivo Markdown e incluido no pacote da rota para
publicacao na Vercel.

## Configuracao dos modelos OpenAI

O backend centraliza os modelos em `src/lib/openai-models.ts`.
`OPENAI_TEXT_MODEL` define o modelo geral; `WHATSAPP_AI_OPENAI_MODEL`
define o modelo geral do WhatsApp e herda o primeiro quando vazio.
As variaveis opcionais abaixo sobrescrevem somente sua tarefa:

- `OPENAI_VISION_MODEL`: localizacao de pontos nas fotos de medidas.
- `DAILY_STORE_HEALTH_OPENAI_MODEL`: leitura diaria da loja.
- `WHATSAPP_AI_OPENAI_ORDER_HANDOFF_MODEL`: texto de encaminhamento humano.
- `WHATSAPP_AI_OPENAI_CLASSIFICATION_MODEL`: classificacao do redesign do WhatsApp.
- `WHATSAPP_AI_OPENAI_ORDER_STATUS_MODEL`: resposta e revisao de consulta de OS.
- `USAGE_ASSISTANT_OPENAI_MODEL`: fallback OpenAI da ajuda por IA; por padrao `gpt-6-luna`.

Quando vazias, as variaveis de tarefa herdam o modelo geral correspondente,
exceto o fallback do assistente de uso, que usa o modelo economico indicado acima.
`OPENAI_TEXT_FALLBACK_MODELS` aceita alternativas para narrativas, separadas por
virgula e tentadas em ordem depois do modelo principal. Quando vazia, nenhuma
alternativa de modelo e acrescentada. A lista nao inclui modelos antigos fixos.

Configure os valores em `.env.local` para desenvolvimento e nas variaveis de
ambiente do projeto Vercel para producao. Reinicie o backend local ou publique
um novo deploy para carregar os valores. Essa configuracao pertence ao backend
MB Optical; o Electron instalado acessa o backend publicado.
