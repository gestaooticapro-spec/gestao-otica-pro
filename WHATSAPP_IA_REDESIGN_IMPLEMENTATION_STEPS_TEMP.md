# Checklist temporario da implementacao do redesign da IA do WhatsApp

Este arquivo acompanha somente a execucao das seis etapas restantes. Ele deve
ser removido quando a etapa 6 estiver concluida e o estado final estiver
registrado no `WHATSAPP_IA_REDESIGN_PLAN.md`.

## Regra de atualizacao

- a etapa em execucao recebe `EM ANDAMENTO`;
- uma etapa concluida permanece sem risco enquanto nenhuma etapa nova tiver
  comecado;
- ao iniciar a etapa seguinte, a etapa anterior deve ser riscada e marcada como
  concluida;
- uma etapa so pode ser considerada concluida depois das validacoes previstas.

## Etapas

1. ~~**CONCLUÍDA — Processar turnos em sombra.** Ler memoria e turno, obter a
   classificacao estruturada da IA, produzir a decisao canonica do sistema e
   registrar classificacao, motivo, contexto e resposta proposta sem enviar
   mensagem ao cliente.~~
2. **CONCLUÍDA — Consolidar memoria e controle humano.** Atualizar assunto,
   pendencias, anexos, handoff e pausa humana renovavel de duas horas.
3. ~~**CONCLUÍDA — Validar decisões em sombra.** Comparar redesign e legado na
  Loja 1 com conversas reais e cenarios de teste, sem trocar quem responde.~~
4. **EM ANDAMENTO — Usar a decisao canonica no piloto ao vivo.** Reutilizar
   imediatamente a decisao registrada para auditoria, habilitar respostas e
   handoffs do redesign somente na Loja 1 e preservar reversao simples.
5. **PENDENTE — Implementar consultas operacionais.** Tratar OS/retirada,
   parcelas, produtos, exame de vista, reclamacao, troca e garantia com dados
   verificados; ate la, o redesign encaminha esses assuntos para a equipe.
6. **PENDENTE — Operacao completa e migracao.** Exibir contexto e decisoes na
   Central, integrar disparos automaticos, migrar loja por loja e aposentar o
   roteador legado quando a equivalencia estiver comprovada.

## Historico

- 18/09/2026: etapa 1 iniciada com processamento exclusivamente em sombra.
- 18/09/2026: processador publicado e executado na Loja 1; três turnos reais
  foram processados sem falha e com `sendsMessage: false` (dois de horário e um
  de exame de vista). A etapa continua em andamento até validar mudança de
  assunto e anexo.
- 22/09/2026: proteção adicionada para a pausa do piloto. Um turno de conversa
  antiga em `shadow` é liberado sem classificação se a loja já voltou para
  `legacy`.
- 23/09/2026: Loja 1 reativada em `shadow` para validar mudança de assunto e
  anexo com mensagens reais. No decisor local, pedido explícito de atendente,
  anexo e baixa confiança passaram a prevalecer sobre horário e endereço.
  A etapa 1 continua em andamento até concluir essas validações reais.
- 23/09/2026: a primeira pergunta real sobre horário foi capturada e processada
  em sombra como `store_hours`/`answer_store_hours`, com `sendsMessage: false`.
  O legado não respondeu porque havia `human_pause` ativo por mensagem enviada
  pela loja. A memória nova ainda não refletia essa pausa anterior; isso fica
  registrado para a etapa 2. Mudança de assunto e anexo seguem pendentes.
- 23/09/2026: a pergunta real sobre endereço e a foto com legenda chegaram
  como turnos separados da Loja 1 e foram processados apenas em sombra, sem
  falhas e com `sendsMessage: false`. O primeiro foi classificado como
  `store_location`/`change_topic` e propôs `answer_store_location`; o segundo
  como `attachment`/`change_topic`, com anexo detectado e proposta de
  `human_handoff`. A etapa 1 permanece em andamento até fechar as validações
  restantes, inclusive o contexto temporal de retomada.
- 23/09/2026: conferência temporal concluída em três turnos reais da Loja 1.
  Em todos havia mensagens de saída posteriores ao fechamento e anteriores ao
  processamento, mas `loadTurnContext` entregou ao redesign somente mensagens
  até o fechamento de cada turno. Etapa 1 concluída; etapa 2 iniciada com a
  consolidação pura de assuntos e anexos, ainda sem persistência nem envio.
- 23/09/2026: o carregamento do turno passou a consultar a última saída
  capturada e confirmada como `human` até o fechamento, mesmo fora da janela
  das 10 mensagens literais, e a reconstruir a pausa humana renovável de duas
  horas. O processamento usa o instante do turno para essa decisão e para a
  agenda; grava `summaryProposal` no turno sem atualizar o resumo canônico nem
  transformar o handoff simulado em pendência real. Seguem pendentes a
  persistência ordenada do resumo e os eventos explícitos de assumir/liberar
  atendimento.
- 23/09/2026: a leitura de turnos passou a reconciliar pausas legadas com
  origem manual comprovada (`store_initiated` ou `app_manual_send`) quando elas
  já existiam no instante do turno. No caso real da Loja 1, os turnos de teste
  passaram a mostrar `human_active` no contexto local; uma pausa originada por
  handoff automático não é confundida com assunção humana. Essa leitura não
  altera o estado legado nem supre eventos antigos já removidos da tabela.
- 23/09/2026: preparado replay determinístico dos turnos processados para
  reconstruir assunto e anexo sem depender da ordem de processamento e sem
  modificar controle humano. Criados comandos locais de typecheck, testes e
  conferência opcional somente leitura da Loja 1. A etapa 2 continua em
  andamento: replay ainda não é gravado no resumo canônico.
- 23/09/2026: implementada localmente uma migration para finalizar o turno e
  reconstruir assunto/anexo no resumo canônico na mesma transação, com bloqueio
  por conversa e replay cronológico. Mensagens humanas confirmadas passam a
  registrar evento de assunção; o banco também aceita eventos explícitos de
  liberação e handoff efetivamente enviado. A leitura de turnos foi ajustada
  para reconstruir somente o contexto anterior ao fechamento. Typecheck e 42
  testes locais passaram. A etapa 2 permanece em andamento: falta aplicar e
  validar a migration em banco de teste, confirmar concorrência/idempotência e
  conectar a liberação explícita a um controle operacional quando a interface
  correspondente for implementada.
- 23/09/2026: validado o SQL completo da migration no PostgreSQL do Supabase
  dentro de uma transação revertida. A execução passou e o `ROLLBACK` confirmou
  que o schema não foi alterado de forma permanente. Depois disso, o usuário
  aplicou a migration no Supabase e confirmou que a função transacional e a
  tabela/eventos estão disponíveis. Foi identificada e corrigida a validação
  de `sendsMessage` que aceitava valor ausente; a migration corretiva foi
  aplicada e a consulta de verificação retornou a guarda presente, sem EXECUTE
  para `anon`/`authenticated` e com EXECUTE para `service_role`. Typecheck e os
  42 testes locais passaram. Foi criado
  `supabase/tests/whatsapp_redesign_stage2_validation.sql`, um teste funcional
  transacional que valida consolidação, controles humanos, idempotência,
  handoff confirmado e rollback. O usuário executou o roteiro no SQL Editor e
  recebeu a linha de resultado `VALIDACAO_ETAPA_2_OK`; a transação de teste
  terminou em `ROLLBACK`. Etapa 2 concluída. A etapa 3 permanece pendente e
  ainda não foi iniciada.
- 24/09/2026: etapa 3 autorizada e iniciada com uma auditoria somente leitura.
  O comparador usa a decisão canônica realmente registrada pelo legado e a
  decisão proposta pelo redesign, produzindo apenas contagens agregadas sem
  imprimir identificadores, telefones, mensagens, payloads ou credenciais.
- 24/09/2026: primeira auditoria agregada executada sobre 50 turnos reais da
  Loja 1. Foram encontrados 28 alinhamentos e 22 divergências; 18 divergências
  são propostas de handoff do redesign diante de silêncio do legado. A etapa
  segue em andamento para validar cenários controlados de horário, endereço,
  anexo e pedido explícito de atendente.
- 24/09/2026: cenário controlado de horário validado na Loja 1. Após confirmar
  separadamente que a pausa humana bloqueia ambos os fluxos, a conversa de
  teste foi liberada: o legado enviou `store_hours` e o redesign propôs
  `answer_store_hours` com motivo `official_store_hours_available`, mantendo
  `sendsMessage: false`. Resultado alinhado.
- 24/09/2026: cenário controlado de endereço validado na Loja 1. O legado
  respondeu com `store_location` e o redesign propôs `answer_store_location`
  com motivo `official_store_location_available`. Resultado alinhado; o
  silêncio temporário criado pelo legado para a conversa de teste foi removido.
- 24/09/2026: cenário controlado de pedido explícito de atendente validado.
  O redesign propôs `human_handoff` (`customer_requests_human`), enquanto o
  legado respondeu com horário de abertura por a loja estar fechada. A diferença
  confirma que o redesign prioriza o pedido explícito de atendimento humano;
  a pausa temporária dessa conversa de teste foi removida.
- 24/09/2026: cenário controlado de anexo validado. O redesign detectou o
  arquivo e propôs handoff para quando a loja abrir; o legado enviou uma
  resposta classificada como horário. A diferença confirma o tratamento
  conservador de anexos pelo redesign; a pausa temporária dessa conversa de teste
  foi removida.
- 24/09/2026: etapa 3 concluída após comparar 50 turnos reais anonimizados
  (27 alinhados, 23 divergentes) e validar quatro cenários controlados. Horário
  e endereço alinharam com o legado. Pedido explícito de atendente e anexo
  produziram divergências esperadas: o redesign encaminha para a equipe e
  informa a próxima abertura; o fluxo atual priorizou horário. Nenhuma resposta
  do redesign foi enviada. Etapa 4 permanece pendente de autorização.
- 24/09/2026: etapa 4 autorizada. O caminho de resposta do piloto foi preparado
  para a Loja 1, limitado a horario, endereco/mapa e pedido literal pela chave
  Pix oficial. Continua desligado por padrao ate publicar o codigo e ativar
  `whatsapp_automation.ai_redesign.safe_replies_enabled` na loja. Os demais
  assuntos continuam no fluxo anterior; desativar a flag reverte o piloto.
- 24/09/2026: depois do deploy informado como Ready, as precondicoes da Loja 1
  foram conferidas sem exibir dados oficiais ou credenciais: modo sombra,
  automacao e canal ativos, horario, endereco completo e Pix presentes. A flag
  do piloto foi ativada e confirmada por nova leitura. Faltam testes reais de
  resposta antes de concluir a etapa 4.
- 24/09/2026: primeira validacao real apos ativacao concluida. Na janela
  consultada houve uma entrada processada e exatamente uma saida enviada pelo
  piloto, classificada como `answer_store_hours`/`store_hours`. A consulta foi
  agregada e nao exibiu telefone, texto ou chave Pix. Restam endereco/mapa,
  Pix, pedido humano, anexo e reversao operacional.
- 24/09/2026: segunda validacao real concluida: uma entrada gerou exatamente
  uma saida enviada, classificada como `answer_store_location`/`store_location`.
  O turno correspondente ainda estava `ready` na fila sombra durante a
  conferencia; falta confirmar seu processamento agendado. Restam Pix, pedido
  humano, anexo e reversao operacional.
- 24/09/2026: terceira validacao real concluida: o pedido isolado da chave Pix
  gerou uma unica saida enviada do tipo `payment_pix_info`. O valor da chave
  nao foi exibido na consulta nem registrado na documentacao. O cron foi pausado
  pelo usuario, portanto nao ha confirmacao de classificacao sombra desse turno.
  Restam pedido humano, anexo e reversao operacional.
- 24/09/2026: iniciado o uso da decisao canonica ao vivo na Loja 1. O webhook
  processa imediatamente o turno capturado, persiste classificacao/decisao uma
  unica vez e reutiliza o resultado para responder, sem aguardar o cron; em
  corrida, consulta o mesmo turno processado pelo cron. Respostas canonicas de
  horario, endereco, saudacao e Pix, alem de handoffs conservadores, passam pelo
  envio existente. Handoff ativa pausa/pendencia operacional, e a memoria sombra
  so registra o evento depois da entrega confirmada. Pausas humanas e modos
  `force_human`/`force_ai` preservam o roteamento de controle existente. Typecheck
  e 48 testes focados passaram; falta publicar e repetir as validacoes reais de
  pedido humano/anexo, alem de conferir ausencia de duplicidade.
