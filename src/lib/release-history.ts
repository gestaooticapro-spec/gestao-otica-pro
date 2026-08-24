export type Release = {
  version: string
  date: string
  changes: string[]
}

// Atualize este historico ao concluir cada implementacao que gere deploy.
// Incremento padrao: somente o ultimo bloco (ex.: 1.02.01 -> 1.02.02).
// Alteracoes de linha/minor (ex.: 1.02.xx -> 1.03.00) exigem solicitacao expressa.
export const RELEASE_HISTORY: Release[] = [
  {
    version: '1.02.02',
    date: '24/08/2026',
    changes: [
      'Alerta sonoro de novas mensagens do WhatsApp mantido ativo durante a navegacao entre as telas da loja.',
      'Monitoramento do alerta transferido do Radar Operacional para o layout persistente da loja.',
    ],
  },
  {
    version: '1.02.01',
    date: '24/08/2026',
    changes: [
      'Watchdog de conectividade para instancias WhatsApp.',
      'Persistencia e reconciliacao de mensagens inbound da Evolution API.',
      'Reprocessamento de webhooks com falha e protecao de idempotencia.',
      'Paginacao do historico de mensagens e deduplicacao por provider_message_id.',
      'Estado intermediario sending para entrega de respostas sem reenvio incerto.',
    ],
  },
  {
    version: '1.02.00',
    date: '24/08/2026',
    changes: [
      'Scheduler de pos-venda transferido para a automacao WhatsApp na VPS.',
      'Execucao desacoplada do agendamento da camada serverless.',
    ],
  },
]

export const CURRENT_VERSION = RELEASE_HISTORY[0].version
