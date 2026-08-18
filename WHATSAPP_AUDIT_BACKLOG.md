# Backlog de correções — WhatsApp

Documento de acompanhamento dos pontos encontrados na auditoria técnica do WhatsApp.

## Situação atual

Já corrigido:

- Autenticação da rota `/api/alertas-operacionais`.
- Proteção da rota `/api/fiscal/print/[id]` por sessão ou token assinado com expiração.
- Restrição da leitura ampla da tabela `whatsapp_ai_logs`.
- Registro do horário original da mensagem recebida em `provider_created_at`.
- Watchdog da Loja 1 publicado na VPS, com verificação periódica e cooldown de reinício.

Ainda pendente:

- O watchdog ainda depende do estado declarado pela Evolution e não comprova que o socket está realmente recebendo mensagens.

## Prioridade crítica

### 1. Detectar conexão WhatsApp travada

Problema: a instância pode permanecer como `connected` mesmo sem receber eventos.

Implementar:

- registrar o último `CONNECTION_UPDATE` por instância;
- registrar o último evento recebido no webhook;
- diferenciar `connected`, `connected_without_events` e `disconnected`;
- criar alerta quando a instância ficar sem eventos por período anormal;
- aplicar backoff progressivo nos reinícios;
- limitar reinícios consecutivos;
- registrar cada reinício com motivo, horário e resultado;
- criar alerta humano quando o limite for atingido.

Critério de aceite:

- simular uma instância sem eventos;
- watchdog detectar o problema em até 2 minutos;
- reiniciar somente a instância afetada;
- registrar o evento de recuperação;
- não entrar em loop de reinícios.

### 2. Rotacionar segredos expostos

Problema: existem chaves e credenciais sensíveis armazenadas no `.env.local` e que já foram expostas durante a análise.

Implementar:

- rotacionar `SUPABASE_SERVICE_ROLE_KEY`;
- rotacionar chaves de IA;
- rotacionar segredos SMTP;
- rotacionar segredos da Evolution e da integração WhatsApp;
- rotacionar credenciais fiscais e de gateways, se ainda válidas;
- conferir logs e histórico para verificar exposição adicional;
- remover segredos de arquivos versionáveis e manter apenas exemplos mascarados.

Critério de aceite:

- nenhuma chave real em arquivos versionados;
- todas as chaves antigas invalidadas;
- aplicação, VPS e cron funcionando com as novas chaves.

### 3. Corrigir o pipeline de migrations do WhatsApp

Problema: parte do schema original do WhatsApp foi criada fora do fluxo normal de migrations.

Implementar:

- consolidar as tabelas-base nas migrations oficiais;
- reconciliar constraints divergentes;
- conferir a inclusão de `ai_session` nos estados permitidos;
- adicionar FKs e índices ausentes;
- revisar policies RLS de todas as tabelas WhatsApp;
- validar o schema em um banco limpo.

Critério de aceite:

- `supabase db reset` reconstruir o schema WhatsApp completo;
- nenhuma tabela WhatsApp depender de SQL solto na raiz;
- migrations aplicadas sem alterações manuais.

## Prioridade alta

### 4. Criar fila persistente de mensagens recebidas

Problema: o buffer atual fica somente em memória e pode perder mensagens durante reinício do serviço.

Implementar:

- persistir mensagens antes do processamento;
- criar estados `received`, `processing`, `processed`, `failed` e `dead_letter`;
- retry com limite e backoff;
- recuperar mensagens pendentes após reinício;
- impedir processamento duplicado.

Critério de aceite:

- reiniciar a automação com mensagens pendentes;
- todas serem recuperadas uma única vez;
- mensagens impossíveis de processar irem para dead-letter.

### 5. Criar reconciliação de envios

Problema: mensagens `pending` ou `failed` podem ficar sem nova tentativa ou sem diagnóstico.

Implementar:

- job de reconciliação de outbounds antigos;
- recuperação de estados `pending` presos;
- retry seguro para timeouts;
- consulta de confirmação de entrega;
- relatório de mensagens sem confirmação.

Critério de aceite:

- nenhum outbound `pending` com mais de 24 horas sem decisão;
- reenvio idempotente;
- mensagem não ser enviada duas vezes.

### 6. Dedupe server-side de envios manuais

Problema: duplo clique ou repetição da tela pode enviar o mesmo texto, PDF ou imagem duas vezes.

Implementar:

- chave de idempotência por operação;
- constraint ou registro de tentativa;
- bloqueio de repetição durante o processamento;
- retorno do envio já existente quando aplicável.

### 7. Corrigir o fallback `wa.me`

Problema: o fallback abre o WhatsApp externo, mas o envio pode não aparecer no histórico do sistema.

Implementar:

- registrar que o operador abriu o fallback;
- diferenciar `prepared`, `opened`, `sent` e `confirmed`;
- não marcar como enviado antes de confirmação;
- revisar a pausa humana quando o envio falhar;
- permitir rollback da pausa humana em caso de erro.

### 8. Preservar linha do tempo completa da mensagem

Problema: atualmente o horário original do WhatsApp é preservado, mas não existe uma linha do tempo completa.

Implementar tabela ou estrutura de timeline com:

- `correlation_id`;
- `provider_created_at`;
- `webhook_received_at`;
- `db_inserted_at`;
- `processing_started_at`;
- `ai_completed_at`;
- `reply_created_at`;
- `sent_to_evolution_at`;
- `delivery_ack_at`;
- erro e tentativas.

Critério de aceite:

- reconstruir integralmente o caso da cliente em espanhol sem depender de logs manuais.

### 9. Confirmar e corrigir o job de pós-venda

Problema: não há evidência suficiente de que o job de pós-venda esteja sendo executado regularmente em produção.

Implementar:

- confirmar cron ou scheduler ativo;
- registrar cada execução;
- registrar quantidade processada, enviada e falhada;
- criar alerta de execução atrasada;
- criar retry para falhas recuperáveis.

## Prioridade média

### 10. Reduzir custo e latência da IA

- revisar chamadas Gemini e OpenAI em paralelo;
- usar fallback sequencial quando possível;
- configurar timeout por etapa;
- registrar custo e tokens por mensagem;
- evitar chamadas de IA quando uma regra determinística resolver o caso.

### 11. Melhorar tratamento de mensagens sem suporte

Hoje alguns tipos podem resultar em silêncio ou pausa humana.

Implementar respostas padrão para:

- áudio sem transcrição;
- sticker;
- localização;
- vídeo;
- documento ilegível;
- imagem acima do limite;
- mensagem sem texto reconhecível.

### 12. Segurança do webhook

- mover token da query string para header;
- usar comparação timing-safe;
- rotacionar o segredo sem downtime;
- rejeitar payloads fora do tamanho esperado;
- registrar tentativas inválidas sem armazenar o segredo.

### 13. Melhorar normalização de telefones

- evitar dependência exclusiva dos últimos 8 dígitos;
- preservar DDI e DDD;
- tratar números do Brasil e Paraguai sem colisão;
- validar o telefone antes do envio;
- testar casos com números semelhantes.

### 14. Health-check e observabilidade

O endpoint `/health` atualmente confirma apenas que o processo Node está vivo.

Adicionar:

- estado da Evolution;
- conectividade com Supabase;
- idade do último webhook;
- idade do último `CONNECTION_UPDATE`;
- quantidade de mensagens pendentes;
- quantidade de falhas recentes;
- versão/hash do serviço em execução.

### 15. Fixar versão da Evolution

- substituir imagem `latest` por versão explícita;
- registrar versão em produção;
- atualizar somente após testes;
- manter procedimento de rollback.

### 16. Logs e LGPD

- remover telefones completos dos logs;
- evitar payloads completos em produção;
- revisar `raw_request` e `raw_response` da IA;
- definir retenção e exclusão;
- revisar envio de comprovantes para OCR/IA;
- documentar base legal e finalidade do processamento.

## Testes obrigatórios

- mensagem simples em português;
- mensagem em espanhol;
- duas mensagens em sequência;
- mensagem durante desconexão;
- reconexão com backlog;
- mensagem duplicada;
- webhook repetido;
- timeout da IA;
- timeout da Evolution;
- Supabase indisponível;
- envio de PDF;
- envio de imagem;
- arquivo acima do limite;
- número inexistente;
- áudio;
- isolamento entre lojas;
- dois clientes com telefones semelhantes;
- concorrência de duas respostas;
- reinício do container com mensagens no buffer.

## Caso de referência

Revalidar o caso da cliente da Loja 1, telefone final `98900560`:

- mensagem sobre o óculos por volta de 14:35;
- “Hola” por volta de 16:01;
- resposta automática por volta de 16:45.

O teste deve comprovar:

- horário original preservado;
- atraso identificado por camada;
- mensagem não perdida;
- resposta emitida após recuperação;
- alerta gerado quando o atraso ultrapassar 1 minuto.

## Ordem recomendada

1. Rotacionar segredos.
2. Melhorar o watchdog e criar alerta de mensagem sem resposta.
3. Criar fila persistente e reconciliação de envios.
4. Consolidar migrations e revisar RLS.
5. Criar timeline completa.
6. Corrigir jobs, fallback manual e dedupe.
7. Melhorar IA, mídia, logs e testes.

