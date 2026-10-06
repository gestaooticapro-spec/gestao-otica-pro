# Recuperacao do pos-venda — Loja 1

## Evidencia coletada em 06/10/2026

- O cron estava ativo. A leitura inicial das ultimas respostas JSON mostrava zero agendamentos e zero tentativas, mas elas eram anteriores aos erros mais recentes.
- A consulta direta com o formato usado pelo job encontrava OS elegiveis. A investigacao posterior confirmou HTTP 401 no fim do log: havia dois espacos depois de `Bearer` no cabeçalho do cron, enquanto a rota removia somente um. A chamada administrativa, que normalizava os espacos, era aceita. Cache e deploy desatualizado nao foram comprovados como causa dessa falha de autenticacao.
- A janela recente analisada continha 50 OS maduras: 12 concluidas, 17 em acompanhamento e 21 sem acompanhamento. Todos os 29 acompanhamentos existentes ja estavam cobertos por followups. Tres acompanhamentos nao tinham interacao registrada; isso sozinho nao autoriza repetir um envio.
- A simulacao do novo planejador encontrou 19 grupos elegiveis, sem criar filas ou enviar mensagens. Um candidato foi descartado por telefone ausente ou invalido. Os numeros sao um retrato da consulta, nao uma garantia de entregas futuras.
- Os tres acompanhamentos sem interacao estao associados a envios `failed`, com outbound tambem `failed` e sem `sent_at` ou identificador do provedor. A simulacao identificou dois followups recentes aptos a recuperacao; a contagem de followups pode diferir da quantidade de OS agrupadas.

## Comportamento implementado

- Leituras operacionais usam `cache: no-store`; a rota e dinamica e identifica a revisao operacional `20261006120000c`.
- Cada execucao registra inicio, fim, resultado e contagens em `whatsapp_post_sale_job_runs`. Erros registram somente o codigo, sem dados do cliente. Uma execucao concorrente e recusada enquanto a anterior possui lease de dez minutos.
- A autenticacao aceita os espacos do esquema Bearer e conserva a comparacao segura do segredo. O cron passa por um script local na VPS, com a credencial em arquivo restrito; cada chamada registra inicio, fim, status HTTP e codigo de saida, sem gravar a credencial.
- Uma reserva persistente permite somente uma tentativa normal por janela de trinta minutos, alinhada aos slots `:15` e `:45`. O teste isolado ja existente conserva sua excecao explicita. Falhas e bloqueios tambem podem consumir o slot; nao ha rajada de substituicoes.
- Primeiro contato exige venda elegivel, OS entregue, espera configurada, telefone valido, canal conectado, modulo habilitado, ausencia de opt-out e atendimento humano ativo.
- `Em Acompanhamento` sem interacoes nao bloqueia por si so. Qualquer interacao registrada e tratada conservadoramente como contato anterior. `Concluido` nunca reabre.
- Cobertura anterior de qualquer OS do grupo impede novo primeiro contato, inclusive quando o estado do envio exige revisao. Um trigger protege a cobertura agrupada contra insercoes concorrentes.
- A recuperacao automatica e limitada a entregas dos ultimos trinta dias, ou `dias_apos_entrega + 14` quando a espera configurada exige uma janela maior. Entregas antigas ficam para revisao da equipe.
- Os novos grupos ocupam slots apos a fila existente. Cada envio revalida todas as OS cobertas. Pausa humana adia o envio; opt-out, conclusao ou contato anterior cancelam o primeiro contato.
- Falhas recentes so podem voltar a fila quando nao existe evidencia de envio aceito e o outbound esta confirmado como `failed`, ou nao chegou a ser criado. Outbounds pendentes, resultados desconhecidos e envios com identificador do provedor nao sao repetidos. A recuperacao e limitada a duas tentativas adicionais e revalida os gates no despacho.
- A acao da Central Diaria usa as mesmas regras do planejador, sem ignorar interacoes ou reagendar resultados ambiguos.
- O encerramento por prazo consulta somente followups que ainda cobrem acompanhamentos abertos. Casos ja concluidos nao sao percorridos a cada execucao.
- A resposta `exists: false` do provedor e uma falha permanente de destinatario: esse telefone nao possui WhatsApp. Ela impede recuperacao automatica, mesmo com outbound `failed`. Retries pendentes com essa evidencia saem da fila e os slots restantes sao redistribuidos em intervalos de trinta minutos, mantendo todos os gates no despacho.

## Operacao e validacao

```powershell
npm run typecheck
npm run build
npx tsx scripts/manage-whatsapp-post-sale-job.ts preview
npx tsx scripts/manage-whatsapp-post-sale-job.ts status
```

`preview` consulta o banco sem modificar dados e sem disparar mensagens.

`apply-migration` aplica somente a migracao desta correcao, em transacao, e registra sua versao no historico de migracoes. A migracao foi aplicada em producao em 06/10/2026.

Depois do deploy, `preview-production` consulta a selecao da rota publicada e `run-production` executa o job real. Ambos verificam primeiro, sem autenticacao, se a revisao nova esta publicada; a rota antiga nao recebe uma chamada de simulacao que poderia provocar envios.

Se as credenciais locais de producao estiverem desatualizadas, acrescente `--cron-host`. Essa opcao usa SSH configurado no runbook local e a credencial vigente do cron, sem copia-la ou imprimi-la.

O resultado `sent` significa aceite confirmado pelo provedor. Entrega no aparelho exige evidencia adicional.

## Publicacao

O acesso salvo a Vercel retornou HTTP 403 (`Not authorized`) ao consultar a conta. A publicacao foi realizada pela integracao GitHub–Vercel. O commit `37a1a76` teve deploy concluido e a rota de producao confirmou a revisao `20261006120000c`. Nenhum numero ou estado de versao de release foi alterado.

## Validacao executada

- `npm run typecheck`: aprovado.
- `npm run build`: aprovado; exibiu avisos de bases Browserslist desatualizadas, sem impedir o build.
- Simulacao com dados reais: zero agendamentos, zero tentativas e zero envios; 19 grupos novos e dois followups com falha confirmada recuperaveis.
- Banco de producao: migracao registrada, RLS ativo nas duas tabelas novas, RPCs indisponiveis a `anon`/`authenticated` e liberadas a `service_role`, trigger de cobertura ativo. A simulacao nao modificou filas nem acompanhamentos.

## Recuperacao real

- O run iniciado em `2026-10-06T17:51:28Z` concluiu em cerca de trinta segundos e agendou os 19 grupos novos. Eles cobrem vinte OS.
- Uma tentativa de recuperar falha antiga recebeu HTTP 400 com `exists: false`: o destinatario nao possui WhatsApp. A revisao do outro followup confirmou a mesma falha permanente. Os dois continuam como `failed`, sem novos retries automaticos; exigem revisao do telefone pela equipe.
- O script usado pelo cron foi executado com o mesmo usuario da agenda. Retornou HTTP 200 e codigo de saida zero, com inicio/fim no log e run concluido no banco em aproximadamente vinte segundos.
- Os dezenove envios validos foram distribuidos do slot `2026-10-06T18:15:00Z` ate `2026-10-07T19:45:00Z`, respeitando expediente e intervalos de trinta minutos. A elegibilidade sera novamente conferida em cada despacho.
- O primeiro run interrompido por timeout ficou marcado `abandoned / lease_expired`. A varredura foi corrigida para consultar somente casos ainda abertos, e os runs posteriores concluiram dentro da janela da funcao.
- Primeiro envio real aceito em `2026-10-06T18:17:00Z` (15h17 em Sao Paulo): followup `sent`, outbound `sent`, identificador do provedor presente, acompanhamento `Em Acompanhamento` e interacao de disparo registrada. O run `c5192a3d-73ac-4c3a-9b8b-d6c6439b986c` concluiu com uma tentativa, um envio e zero falhas. A chamada usou o mesmo script da agenda.
- A chamada automatica seguinte foi comprovada no journal do cron e no log do script: HTTP 200, run `45127db5-84a9-4d6e-aa81-527cd757473e`, iniciado em `2026-10-06T18:19:14Z` e concluido em aproximadamente treze segundos. Nao houve outro envio na mesma janela. O banco confirmou um unico envio desde 18h15 UTC e dezoito itens ainda agendados.
- Depois desse envio, restam dezoito mensagens agendadas. O total historico da Loja 1 passou de 177 para 178 followups enviados; os 22 com falha e os dois cancelados permanecem preservados.
- Conferencia final da migracao: registro presente em `supabase_migrations.schema_migrations` e SHA-256 do SQL armazenado igual ao arquivo local. A rota ativa retornou a revisao `20261006120000c` com `Cache-Control: no-store`; consultas sem credencial continuam recebendo HTTP 401.

## Relogio da VPS

A VPS usa `America/Sao_Paulo`, mas a comparacao com o cabeçalho HTTP de producao indicou atraso de aproximadamente 252 segundos. O NTP estava habilitado sem sincronizacao; reiniciar `systemd-timesyncd` nao confirmou a sincronizacao. O job utiliza o relogio do app e do banco para elegibilidade e cadencia. Os horarios locais do log da VPS devem ser correlacionados pelo run ID e pelo timestamp UTC da auditoria, enquanto o relogio do host exigir ajuste.
