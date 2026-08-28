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
export const PENDING_RELEASE_VERSION: string | null = '1.02.06'
export const PENDING_RELEASE_CHANGES: readonly string[] = [
  'A integração Pix Sicredi passou a usar exclusivamente as credenciais e a API oficial de produção, mantendo a liberação restrita à Ótica Ocular configurada como loja-piloto.',
  'Certificados do Pix Sicredi podem ser configurados como segredos Base64 no ambiente hospedado, preservando os arquivos locais apenas para desenvolvimento.',
  'Baixas confirmadas de parcelas por Pix Sicredi passam a abrir o recibo automaticamente; a tela de contas a receber diferencia pagamento parcial da quitacao total.',
  'Contas a receber passou a calcular o saldo da parcela sem somar juros; cancelamentos que encontram QR ja pago concluem a baixa automatica e conciliacoes simultaneas nao gravam erro transitorio.',
  'O recebimento de parcelas por Pix Sicredi passou a usar as mesmas regras da baixa manual para juros, pagamento parcial, transferencia do saldo e amortizacao das parcelas seguintes.',
  'O acesso em celular volta ao menu tablet a cada novo login, mesmo que a sessao anterior tenha usado a versao desktop.',
  'Parcelas parcialmente recebidas por Pix passam a abrir nova cobranca pelo saldo atual; contas a receber e o atendimento atualizam o valor restante real da parcela, inclusive apos renegociacoes.',
  'A transferencia do saldo de uma baixa Pix parcial voltou a reconhecer as proximas parcelas pendentes do mesmo carne.',
  'A baixa de parcelas agora usa no banco o mesmo saldo efetivo da interface, incluindo valores ja retirados por renegociacao; o atendimento aguarda a atualizacao antes de reabrir a parcela e o modo maquininha fica restrito a loja Sicredi habilitada.',
  'Cobranças Pix pagas com baixa pendente agora bloqueiam um novo QR Code e podem concluir o registro diretamente pelo estado confirmado, sem depender de uma nova consulta ao Sicredi; a expiração também preserva pagamentos confirmados simultaneamente.',
  'Os botões Pix do carnê e da venda experimental passaram a refletir a ação necessária, incluindo conferir pagamento, conferir situação e gerar novo QR Code; o PIN da cobrança direta da venda voltou a aceitar o contexto correto.',
  'A impressão de recibos passou a exigir uma sessão autorizada para a empresa e a loja dos pagamentos selecionados, sem reutilizar um ID de pagamento inexistente como se fosse o código de uma venda.',
]
const RELEASE_10205_CHANGES: readonly string[] = [
  'IMPLEMENTAÇÃO DO MÓDULO PONTOS DE ATENÇÃO - A IA VASCULHA OS REGISTROS E AJUDA NA GESTÃO DA EMPRESA.',
  'A pagina Pontos de Atencao ganhou retorno a Central de Operacoes no cabecalho, identificacao Beta e uma descricao da leitura noturna com a referencia do relatorio; a orientacao da lista diaria passou a usar a cor de atencao.',
  'Pendencias de Cadastros passaram a permanecer visiveis diariamente ate receberem uma decisao; a regra de silencio por ausencia de mudanca continua nos modulos analiticos.',
  'O atalho Pontos de Atencao da tela inicial pulsa de forma discreta ate ser aberto uma vez no dia, com controle local por loja e dia.',
  'Quando um modulo diario nao tiver mudanca material, a Central passa a oferecer a ultima atualizacao relevante salva para aquele modulo, buscando o historico alem de ontem.',
  'O acesso discreto a Pontos de Atencao foi incluido abaixo da versao na tela inicial da loja; ele exige PIN de gerente e abre no resumo diario. Marca, versao e acesso recebem brilho somente quando cada um recebe foco do mouse.',
  'Textos visiveis da Central de Pontos de Atencao e de seus modais foram revisados para exibir acentuacao correta em portugues brasileiro.',
  'Resumo de vendas, acumulados e analises de itens passou a considerar a data_fechamento da venda; recebimentos continuam usando a data real do pagamento.',
  'O botao de refazer de qualquer loja pode gerar uma previa mensal com os dados disponiveis antes do fechamento do mes, sem grava-la como snapshot oficial.',
  'A Central de Pontos de Atencao deixou de ficar restrita a Loja 1; a pagina, a previa mensal e o job noturno agora respeitam qualquer loja autorizada.',
  'Atualizacao manual da Central pode recalcular o snapshot atual e substitui-lo somente depois que o novo calculo termina com sucesso.',
  'Radar Operacional deixou de listar OS de vendas canceladas, devolvidas ou com fluxo de laboratorio encerrado.',
  'Relacionamento passou a alertar somente quando existem notas 1 ou 2, reclamacoes, insatisfacao ou dificuldade de adaptacao; informacoes normais de pos-venda continuam fora do resumo.',
  'Sinais de relacionamento passaram a separar ocorrencias de ontem, acumulado do mes e historico antigo; o alerta mensal so aparece ao atingir tres sinais e nao se repete diariamente.',
  'Central passou a salvar snapshots semanais e mensais a partir dos diarios, com consulta somente leitura na tela e sem recalculo pelos botoes de periodo.',
  'A leitura mensal ganhou o modal "Sub-uso do programa", com cards determinísticos por área para funções desabilitadas, nunca utilizadas ou com queda relevante de uso.',
  'Resumo financeiro passou a ocultar comparacoes sem historico disponivel; numeros presentes nas leituras e alertas ganharam destaque visual por prioridade.',
  'Cards de vendas e valores que entraram foram compactados para reduzir o espaco vertical entre as linhas.',
  'Cards de vendas e valores que entraram receberam uma segunda compactacao visual, preservando a legibilidade.',
  'O titulo da secao de pontos de atencao passou a usar uma orientacao mais direta ao gerente.',
  'Cards de atencao passaram a ser exibidos em duas colunas em telas medias e grandes.',
  'Textos narrativos da IA ganharam mais largura e tipografia maior para melhorar a leitura sem alongar excessivamente a tela.',
  'Destaques das narrativas passaram a vincular trechos aos alertas de origem; a prioridade e a cor agora sao definidas pelo motor auditavel, e os modulos ganharam icones da biblioteca Lucide.',
  'Subtitulos de cada modulo passaram a controlar a expansao dos conteudos, fechados por padrao para uma leitura mais limpa.',
  'Controles de expansao dos modulos ganharam indicacao visual de abrir e fechar, com seta, texto e estado de hover.',
  'Correcao: os subtitulos dos modulos passaram a renderizar o botao de expansao funcional, permitindo abrir e fechar cada leitura.',
  'Alerta de montagem passou a informar que a data da montagem local ainda nao foi preenchida, em vez de sugerir um registro separado de atraso.',
  'Central passou a executar faxina cadastral diaria, identificando possiveis duplicidades de clientes e produtos, produtos vendidos sem custo e vendas abertas antigas para revisao.',
  'Estados vazios das varreduras semanal e mensal passaram a informar objetivamente quando a primeira leitura sera disponibilizada.',
  'Operacao passou a acompanhar oculos montados e nao entregues parados na Gaveta por mais de sete dias, destacando permanencias acima de 30 dias, ausencia de telefone e falta de aviso de retirada registrado.',
  'Cards operacionais de OS passaram a abrir uma lista protegida dos casos afetados, com cliente ou paciente, datas relevantes e link direto para cada Ordem de Servico.',
  'Alertas de relacionamento passaram a abrir os pos-vendas afetados com motivo, ultimo resumo e data da interacao; a fila de pos-venda recebe a OS selecionada pelo link do caso.',
  'Cadastros ganhou filas protegidas em lotes de ate 10 para revisar duplicidades, informar custos ausentes e abrir vendas antigas; decisoes e alteracoes ficam auditadas com o gerente responsavel.',
  'A identificacao de produtos duplicados passou a exigir nome, marca e referencia compativeis em conjunto; a referencia ignora apenas espacos e pontuacao, preserva sufixos e nao mistura registros com referencia ausente e informada.',
  'A revisao de duplicidades ganhou uma previa de mesclagem somente leitura: o gerente escolhe o cadastro principal e ve vinculos a transferir, estoque resultante, dados complementares e conflitos bloqueadores antes de qualquer alteracao.',
  'Duplicidades sem conflitos bloqueadores agora podem ser mescladas pelo gerente com confirmacao dupla; a operacao transfere todos os vinculos, complementa campos vazios, consolida estoque e registra auditoria em uma unica transacao reversivel em caso de falha.',
  'Na revisao de duplicidades, a previa de mesclagem passou a ficar dentro de cada card, com o rotulo objetivo "Previa usando este como o principal".',
  'Cards de cadastros suspeitos passaram a exibir o codigo do registro; a previa explica em linguagem operacional quando dependentes serao transferidos ou ja existem no cadastro principal.',
  'Mesclagens recentes agora podem ser desfeitas pelo gerente a partir da auditoria; a recuperacao restaura cadastros e vinculos em uma unica transacao e e bloqueada quando houve alteracoes posteriores.',
  'Comissoes pendentes de agosto da Natalia na Loja 1 foram ajustadas retroativamente para a taxa de 3%, sem alterar as vendas nem a configuracao vigente para os proximos fechamentos.',
  'Resposta ao agradecimento após lembrete de parcela passou a usar uma confirmação humana e específica, sem sugerir recebimento de pagamento ou documento.',
]

// Esta lista contem somente deploys concluidos e deve preservar todo o historico.
// A versao 1.02.00 e o registro mais antigo atualmente disponivel neste repositorio.
// Ao iniciar o proximo lote, use 1.02.06 em PENDING_RELEASE_VERSION. Depois do deploy,
// mova as mudancas pendentes para a nova versao e limpe as duas constantes pendentes.
// Alteracoes de linha/minor (ex.: 1.02.xx -> 1.03.00) exigem solicitacao expressa.
export const RELEASE_HISTORY: Release[] = [
  {
    version: '1.02.05',
    date: '26/08/2026',
    changes: [...RELEASE_10205_CHANGES],
  },
  {
    version: '1.02.04',
    date: '25/08/2026',
    changes: [
      'Respostas automáticas de horário passaram a informar os intervalos recorrentes, incluindo o almoço, junto do horário semanal da loja.',
    ],
  },
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
