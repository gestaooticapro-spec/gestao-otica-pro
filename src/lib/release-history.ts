export type Release = {
  version: string
  date: string
  changes: string[]
}

// Registre aqui todas as mudancas do proximo lote depois que ele for iniciado.
// A primeira mudanca apos um deploy abre a proxima versao; as seguintes apenas
// completam essa mesma versao ate o proximo deploy.
// Se uma implementacao for desfeita ou substituida antes do deploy, remova ou corrija
// o respectivo item para que a lista descreva somente o que realmente sera entregue.
export const PENDING_RELEASE_VERSION: string | null = '1.02.04'
export const PENDING_RELEASE_CHANGES: readonly string[] = [
  'Respostas automáticas de horário passaram a informar os intervalos recorrentes, incluindo o almoço, junto do horário semanal da loja.',
]

// Esta lista contem somente deploys concluidos e deve preservar todo o historico.
// A versao 1.02.00 e o registro mais antigo atualmente disponivel neste repositorio.
// Ao iniciar o proximo lote, use 1.02.04 em PENDING_RELEASE_VERSION. Depois do deploy,
// mova as mudancas pendentes para a nova versao e limpe as duas constantes pendentes.
// Alteracoes de linha/minor (ex.: 1.02.xx -> 1.03.00) exigem solicitacao expressa.
export const RELEASE_HISTORY: Release[] = [
  {
    version: '1.02.03',
    date: '24/08/2026',
    changes: [
      'Alerta operacional corrigido para montagem local apos a chegada da lente: acima de 24 horas, ou acima de 7 dias quando a loja aguarda a armacao do cliente.',
      'Alerta operacional de montagem local permanece visivel enquanto a pendencia persistir.',
      'Alerta de venda sem OS identificado explicitamente como exclusivo de lentes oftalmicas; lentes de contato ficam fora da verificacao.',
      'Alerta de OS sem data prometida mantido como ponto operacional relevante para acompanhamento de prazo.',
      'Central Diaria passou a identificar OS do fluxo optico sem lente vinculada e OS com lente sem grau preenchido.',
      'Alerta de mais de uma OS aberta por venda removido por ser um fluxo normal; a Central permanece focada em inconsistencias reais.',
      'Historico de versoes passou a preservar todos os deploys e carregar as entradas antigas progressivamente no modal.',
      'Registro de mudancas pendentes passou a ser corrigido quando uma implementacao for removida ou substituida antes do deploy.',
      'Auditoria da Central impediu sobrescrita de snapshots prontos, limitou vendas de lentes a data de referencia, confirmou o tipo de produto nas OS e restringiu a narrativa da IA a fatos suportados.',
      'Testes da Central foram incluidos na suite padrao e ampliados para snapshots, lente de contato e respostas adversariais da IA.',
    ],
  },
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

export const CURRENT_VERSION = PENDING_RELEASE_VERSION ?? RELEASE_HISTORY[0].version
