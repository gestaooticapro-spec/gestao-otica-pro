import { z } from 'zod'
import { getStoreModules, type StoreModuleKey, type StoreSettings } from '@/lib/store-modules'

export const USAGE_QUESTION_LIMIT = 1800
export const USAGE_HISTORY_LIMIT = 10
export const USAGE_ANSWER_LIMIT = 6000

export type UsageMessage = { role: 'user' | 'assistant'; content: string }
export type UsageRole = 'admin' | 'manager' | 'store_operator' | 'vendedor' | 'tecnico'
export type UsageDestination = {
  id: string
  label: string
} & ({ kind: 'page'; href: string } | { kind: 'action'; action: 'installments' | 'customer-info' })

export type UsageProfile = { role: string | null; store_id: number | null; tenant_id: string | null }
const roles: UsageRole[] = ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico']
const managers: UsageRole[] = ['admin', 'manager']
const storeTeam: UsageRole[] = ['admin', 'manager', 'store_operator']
const cashTeam: UsageRole[] = [...storeTeam, 'vendedor']

export function canUseUsageAssistant(profile: UsageProfile | null, store: { tenant_id: string | null }, storeId: number) {
  return Boolean(profile?.tenant_id
    && store.tenant_id === profile.tenant_id
    && roles.includes(profile.role as UsageRole)
    && (profile.role === 'admin' || profile.store_id === storeId))
}

type DestinationDefinition = {
  id: string; label: string; roles: UsageRole[]; module?: StoreModuleKey
} & ({ path: string } | { action: 'installments' | 'customer-info' })

// Somente destinos reais da operação. Nunca aceitar URLs ou IDs de registros gerados pela IA.
const destinations: DestinationDefinition[] = [
  { id: 'receituario', label: 'Receituário', path: '/atendimento', roles },
  { id: 'venda-rapida', label: 'Venda Rápida', path: '/pdv-express', roles, module: 'quickSale' },
  { id: 'clientes', label: 'Clientes', path: '/clientes', roles },
  { id: 'busca', label: 'Busca', path: '/consultas', roles },
  { id: 'entrega', label: 'Entrega de Óculos', path: '/entrega', roles },
  { id: 'assistencia', label: 'Assistência', path: '/assistencia', roles },
  { id: 'receber-parcela', label: 'Receber parcela', action: 'installments', roles: cashTeam, module: 'installments' },
  { id: 'enviar-informacao', label: 'Enviar Informação ao cliente', action: 'customer-info', roles: cashTeam },
  { id: 'avaliacao', label: 'Avaliação pré-venda', path: '/avaliacao', roles, module: 'evaluation' },
  { id: 'tabela-precos', label: 'Tabela de Preços', path: '/tabela-precos', roles, module: 'globalTables' },
  { id: 'laboratorio', label: 'Laboratório', path: '/laboratorio', roles: [...storeTeam, 'tecnico'] },
  { id: 'gaveta', label: 'Gaveta — óculos prontos', path: '/gaveta', roles },
  { id: 'historico', label: 'Histórico de Vendas', path: '/vendas?mode=historico', roles: storeTeam },
  { id: 'parcelamentos', label: 'Parcelamentos', path: '/financeiro/parcelas', roles: storeTeam, module: 'installments' },
  { id: 'cobranca', label: 'Cobrança', path: '/cobranca', roles: storeTeam, module: 'installments' },
  { id: 'pos-venda', label: 'Pós-Venda', path: '/pos-venda', roles: [...storeTeam, 'vendedor'], module: 'postSales' },
  { id: 'estoque', label: 'Movimentação de Estoque', path: '/estoque/movimentacoes', roles: [...storeTeam, 'tecnico'] },
  { id: 'cadastros', label: 'Cadastros — produtos e preços', path: '/cadastros', roles: [...storeTeam, 'tecnico'] },
  { id: 'xml', label: 'Importação de XML', path: '/importacao', roles: [...storeTeam, 'tecnico'] },
  { id: 'etiquetas', label: 'Etiquetas', path: '/estoque/etiquetas', roles: [...storeTeam, 'tecnico'], module: 'labels' },
  { id: 'caixa', label: 'Livro Caixa', path: '/financeiro/caixa', roles: storeTeam },
  { id: 'contas', label: 'Contas a Pagar', path: '/financeiro/contas', roles: managers },
  { id: 'comissoes', label: 'Comissões', path: '/financeiro/comissoes', roles: managers },
  { id: 'relatorios', label: 'Central de Relatórios', path: '/reports', roles: managers },
  { id: 'configuracao', label: 'Configuração da Loja', path: '/config', roles: managers },
  { id: 'fiscal', label: 'Fiscal', path: '/fiscal', roles: managers, module: 'fiscal' },
]

export function getUsageDestinations(storeId: number, role: UsageRole, settings: StoreSettings | null): UsageDestination[] {
  const modules = getStoreModules(settings)
  return destinations
    .filter(item => item.roles.includes(role) && (!item.module || modules[item.module]))
    .map(item => 'path' in item
      ? { id: item.id, label: item.label, kind: 'page', href: `/dashboard/loja/${storeId}${item.path}` }
      : { id: item.id, label: item.label, kind: 'action', action: item.action })
}

const requestSchema = z.object({
  storeId: z.number().int().positive().safe(),
  message: z.string().trim().min(1).max(USAGE_QUESTION_LIMIT),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(USAGE_ANSWER_LIMIT),
  }).strict()).max(USAGE_HISTORY_LIMIT).default([]),
}).strict()

export function parseUsageRequest(value: unknown) {
  const result = requestSchema.safeParse(value)
  if (!result.success) return null
  const { history } = result.data
  // Cada turno confirmado contém uma pergunta e uma resposta. Nenhuma instrução de sistema vem do navegador.
  if (history.length % 2 !== 0 || history.some((item, index) => item.role !== (index % 2 ? 'assistant' : 'user'))) return null
  while (history.reduce((sum, item) => sum + item.content.length, 0) > 18000) history.splice(0, 2)
  return result.data
}

export function getUsageKeyEntries(env: Record<string, string | undefined>) {
  const numbered = Object.entries(env)
    .filter(([name]) => /^GEMINI_SECRET_KEY_\d+$/.test(name))
    .sort(([a], [b]) => Number(a.match(/\d+$/)?.[0]) - Number(b.match(/\d+$/)?.[0]))
    .flatMap(([name, value]) => value?.trim() ? [{ name, key: value.trim() }] : [])
  const candidates = numbered.length ? numbered : env.GOOGLE_API_KEY?.trim()
    ? [{ name: 'GOOGLE_API_KEY', key: env.GOOGLE_API_KEY.trim() }]
    : []
  const seen = new Set<string>()
  return candidates.filter(({ key }) => {
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function getUsageKeys(env: Record<string, string | undefined>) {
  return getUsageKeyEntries(env).map(item => item.key)
}

export function parseUsageAnswer(value: unknown, available: UsageDestination[]) {
  if (!value || typeof value !== 'object') return null
  const output = value as { answer?: unknown; destinationIds?: unknown }
  if (typeof output.answer !== 'string' || !output.answer.trim() || output.answer.length > USAGE_ANSWER_LIMIT) return null
  const allowed = new Map(available.map(item => [item.id, item]))
  const selected = new Set<string>()
  const answer = output.answer.trim().replace(/\[([^\]\n]+)\]\(([^)]+)\)/g, (_match, label: string, id: string) => {
    if (!allowed.has(id)) return label
    selected.add(id)
    return `[${allowed.get(id)!.label}](${id})`
  })
  if (Array.isArray(output.destinationIds)) {
    output.destinationIds.forEach(id => { if (typeof id === 'string' && allowed.has(id)) selected.add(id) })
  }
  // A venda experimental exige identificador real. Se o modelo não sugerir
  // nenhum caminho para localizá-la, ofereça a busca autorizada da loja.
  if (selected.size === 0 && /\bvenda experimental\b/i.test(answer) && allowed.has('busca')) selected.add('busca')
  return { answer, destinations: [...selected].map(id => allowed.get(id)!).slice(0, 6) }
}

const normalizeUsageText = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Respostas financeiras conferidas no código. O modelo não pode inventar estas correções.
export function resolveSalePaymentGuidance(input: {
  message: string
  history: UsageMessage[]
  destinations: UsageDestination[]
  pixEnabled: boolean
}): { answer: string; destinationIds: string[] } | null {
  const question = normalizeUsageText(input.message)
  const previousQuestion = normalizeUsageText([...input.history].reverse().find(item => item.role === 'user')?.content || '')
  const mentionsInstallment = /\b(parcela|parcelas|carne|carnes)\b/.test(question)
    || (/\b(ela|isso|esse recebimento|essa baixa|esse pagamento)\b/.test(question) && /\b(parcela|parcelas|carne|carnes)\b/.test(previousQuestion))
  const asksCorrection = /\b(errad\w*|erro|engano|engan\w*|indevid\w*|revert\w*|estorn\w*|cancel\w*|desf\w*|corrig\w*|correcao|remov\w*|apag\w*|exclu\w*|lixeira)\b/.test(question)
  const asksLaterDownPayment = mentionsInstallment && /\bentrada\b/.test(question)
    && /\b(depois|sem entrada|quis|quer|reduz\w*|renegoci\w*|prazo)\b/.test(question)
  const previousLaterDownPayment = /\bentrada\b/.test(previousQuestion) && /\b(carne|parcela|parcelas)\b/.test(previousQuestion)
  const asksLaterDownFollowUp = previousLaterDownPayment && /\b(fechad\w*|abert\w*|status|nao sei|nao tenho certeza)\b/.test(question)
  const asksDuplicate = mentionsInstallment && !/\brenegoci\w*\b/.test(question) && !asksLaterDownPayment && (
    /\b(novo pagamento|pagamento direto|pix direto|outro pix)\b/.test(question)
    || (/\b(pix|pagamento|lanc\w*|registr\w*)\b/.test(question) && /\bvenda\b/.test(question)
      && /\b(tambem|de novo|novamente|duplic\w*|alem|junto|outra vez|mesmo valor)\b/.test(question))
  )
  const mentionsSalePayment = /\b(pagamento direto|pagamentos diretos|novo pagamento|entrada da venda|pagamento da venda|paguei a venda)\b/.test(question)
    || (/\b(pagamento|recebimento|pix|entrada)\b/.test(question) && /\b(venda|expressa|experimental|balcao)\b/.test(question))
  const previousDirect = /\b(pagamento direto|novo pagamento|pagamento da venda|lixeira)\b/.test(previousQuestion)
    && !/\b(parcela|parcelas|carne|carnes)\b/.test(previousQuestion)
  const asksClosedFollowUp = /\b(fechad\w*|reabrir|reabertura|nao aparece|sumiu)\b/.test(question)
  const asksSalePixCancel = /\bpix\b/.test(question) && /\bcancel\w*\b/.test(question)
    && /\b(cobranca|qr\s*code|qrcode|pendente)\b/.test(question) && !mentionsInstallment
    && (mentionsSalePayment || /\b(venda|expressa|experimental)\b/.test(question))
  const asksDirectCorrection = !mentionsInstallment && (asksCorrection && mentionsSalePayment || previousDirect && asksClosedFollowUp)
  const asksAmbiguousCorrection = asksCorrection && /\b(pagamento|pagamentos|recebimento|pix|baixa)\b/.test(question)
    && !mentionsInstallment && !asksDirectCorrection && !asksSalePixCancel
  const asksAutoClose = /\bfechou sozinh\w*|fechou automatic\w*|fechou na hora\b/.test(question)
    && /\b(pagamento|dinheiro|pix|venda|receb)\b/.test(question)
  const previousRelationship = /\b(pos-venda|pos venda|adaptacao|assistencia|garantia|rastreio)\b/.test(previousQuestion)
  const restrictedScreen = /\bmoviment\w*|\bestoque\b/.test(question) ? 'estoque'
    : /\betiquet\w*\b/.test(question) ? 'etiquetas'
    : /\bxml\b/.test(question) ? 'xml'
    : /\b(cadastro de produto|produtos e precos)\b/.test(question) ? 'cadastros'
    : /\blivro caixa\b/.test(question) ? 'caixa'
    : /\bcontas a pagar\b/.test(question) ? 'contas'
    : /\bcomisso\w*\b/.test(question) ? 'comissoes'
    : /\brelatorio\w*\b/.test(question) ? 'relatorios'
    : /\bconfigurac\w*\b/.test(question) ? 'configuracao'
    : null
  const asksMissingScreen = Boolean(restrictedScreen)
    && !input.destinations.some(item => item.id === restrictedScreen)
    && /\b(como|onde|nao aparece|nao tenho|sem acesso|sem permissao|lanc\w*|abr\w*|consult\w*|import\w*)\b/.test(question)
  const asksRelationshipSend = (/\b(pos-venda|pos venda|adaptacao|assistencia|garantia|rastreio)\b/.test(question)
    && /\b(whatsapp|mensagem|telefone|sem fone|sem telefone|enviad\w*|chegou|leu|recebeu)\b/.test(question))
    || (previousRelationship && /\b(telefone|sem fone|sem telefone|whatsapp|mensagem|chegou|leu|recebeu)\b/.test(question))
  const mentionsPickup = !/\b(?:buscar|retirar|pegar)\s+(?:uma |a |as |suas )?vendas?\b/.test(question) && (
    /\b(?:veio|chegou|esta aqui|esta na loja|vai|quer|veio para)\s+(?:a |para |pra )?(?:buscar|retirar|pegar)\b/.test(question)
    || /\b(?:buscar|retirar|pegar)\s+(?:os |o |seus |meus )?(?:oculos|encomenda|pedido)\b/.test(question)
  )
  const previousPickup = /\b(entrega|entregar|retirada|oculos)\b/.test(previousQuestion)
    && /\b(veio|chegou|buscar|retirar|pegar|entrega|entregar|retirada)\b/.test(previousQuestion)
  const saleOpen = /\b(?:venda\s+)?(?:esta\s+|ficou\s+|continua\s+|segue\s+|ainda\s+esta\s+)?(?:em aberto|aberta)\b/.test(question)
  const asksDeliveryBlock = !asksRelationshipSend && (
    /\b(entrega|entregar|retirada|gaveta)\b/.test(question)
      && /\b(nao aparece|nao encontro|sumiu|bloquead\w*|fechamento|em aberto|venda esta aberta|nao consigo)\b/.test(question)
    || saleOpen && (mentionsPickup || previousPickup)
  )
  const asksOsMode = !asksDeliveryBlock && /\b(os|ordem de servico|protocolo)\b/.test(question)
    && /\b(lanc\w*|cri\w*|preench\w*|ficha|receita|medidas|paciente|dependente)\b/.test(question)
    && !/\b(unica|embutida|varias fichas|ficha separada|nova os|lancar os)\b/.test(question)
  const asksBlockedSaleStart = !asksOsMode && /\b(iniciar nova venda|nao consigo (iniciar|abrir|comecar)|nao abre a venda|venda nao (abre|inicia|comeca)|botao (desabilitado|travado|cinza))\b/.test(question)
    || (/\bavaliacao aberta\b/.test(question) && /\b(venda|iniciar|bloquear|imped)\b/.test(question))
  const asksCollectionAsReceipt = !asksCorrection && !asksBlockedSaleStart && /\b(contato|promessa|lembrar|spc|negativar)\b/.test(question)
    && /\b(receb\w*|baixa|quit\w*|pagou|pagamento|divida|parcela|parcelas)\b/.test(question)

  if (asksMissingScreen && restrictedScreen) {
    const labels: Record<string, string> = {
      estoque: 'Movimentações de estoque',
      etiquetas: 'Etiquetas',
      xml: 'Importação de XML',
      cadastros: 'Produtos e preços',
      caixa: 'Livro Caixa',
      contas: 'Contas a pagar',
      comissoes: 'Comissões',
      relatorios: 'Central de Relatórios',
      configuracao: 'Configuração da loja',
    }
    const owners: Record<string, string> = {
      estoque: 'administração, gerência, operação ou técnico',
      etiquetas: 'administração, gerência, operação ou técnico, e somente com o módulo de etiquetas ligado',
      xml: 'administração, gerência, operação ou técnico',
      cadastros: 'administração, gerência, operação ou técnico',
      caixa: 'administração, gerência ou operação',
      contas: 'administração ou gerência',
      comissoes: 'administração ou gerência',
      relatorios: 'administração ou gerência',
      configuracao: 'administração ou gerência',
    }
    return {
      destinationIds: [],
      answer: `${labels[restrictedScreen]} não está disponível neste acesso.\n\nQuem pode abrir é ${owners[restrictedScreen]}. Se o menu não aparece, não procure outro caminho e não use o Livro Caixa para substituir estoque, pagamento ou parcela.\n\nPeça a uma pessoa com esse acesso. Se a tela some mesmo para quem deveria vê-la, a gerência confere **Configuração → Recursos** e o perfil.`,
    }
  }

  if (asksRelationshipSend) {
    const available = new Set(input.destinations.map(item => item.id))
    const ids = ['pos-venda', 'assistencia'].filter(id => available.has(id))
    const postSale = available.has('pos-venda')
      ? 'No [Pós-Venda](pos-venda), **Enviar Mensagem** exige telefone.'
      : 'No pós-venda, quando o módulo e o perfil permitirem, **Enviar Mensagem** exige telefone.'
    const assistance = available.has('assistencia')
      ? 'Na [Assistência](assistencia), **Rastreio WhatsApp** também exige telefone.'
      : 'Na assistência, o rastreio por WhatsApp exige telefone.'
    return {
      destinationIds: ids,
      answer: `Uma tentativa de WhatsApp não prova que o cliente recebeu ou leu a mensagem.\n\n${postSale} Sem telefone, a tela avisa para cadastrar em **Sem fone**. Com telefone, o envio usa o canal da loja ou abre o WhatsApp externo.\n\n${assistance} Sem telefone, aparece **Cliente sem telefone**. O link enviado é o acompanhamento da garantia, não o resumo financeiro nem a receita.\n\nSalvar o contato no pós-venda é separado do envio. Para arquivar, primeiro salve um contato e depois dê uma nota. **Concluir e arquivar** não confirma que houve mensagem lida.\n\nDiga se falta telefone, se a tela mostrou erro, ou se a dúvida é só registrar o que foi conversado.`,
    }
  }

  if (asksDeliveryBlock) {
    const available = new Set(input.destinations.map(item => item.id))
    const ids = ['entrega', 'gaveta', 'laboratorio', 'busca'].filter(id => available.has(id))
    const delivery = available.has('entrega') ? 'Abra [Entrega](entrega).' : 'Peça a quem tenha acesso para abrir Entrega Óculos.'
    const drawer = available.has('gaveta') ? 'A [Gaveta](gaveta) só consulta os prontos.' : 'A Gaveta consulta os prontos, quando o perfil permitir.'
    const lab = available.has('laboratorio')
      ? 'No [Laboratório](laboratorio), confira se o cartão está em **Óculos Montado**.'
      : 'Se o seu perfil não tiver Rastrear Lentes, peça a quem tenha o quadro para conferir se a OS está em **Óculos Montado**.'
    return {
      destinationIds: ids,
      answer: `${delivery} A lista só mostra OS montada, ainda não entregue, desta loja, de venda que não está cancelada nem devolvida.\n\n- Se a OS não aparece, ${lab} ${drawer} OS já entregue, de outra loja ou de venda cancelada ou devolvida também fica fora da lista.\n- Se o botão for **Ir para Fechamento**, a venda está **Em Aberto**. Esse caminho abre a venda experimental e não confirma a retirada. Depois do fechamento, volte à entrega.\n- **Confirmar Entrega** pede laboratório, chegada da lente, montagem e a data **Entregue Cliente**. Não pede PIN. A mensagem de sucesso é **Entrega confirmada**.\n\nDiga se a OS não aparece ou se o botão mostrado é **Ir para Fechamento**.`,
    }
  }

  if (asksOsMode) {
    const ids = ['busca'].filter(id => input.destinations.some(item => item.id === id))
    return {
      destinationIds: ids,
      answer: 'O caminho da OS depende do botão que a loja mostra em **Protocolo (OS)**. Não escolha um modo sem ver a tela.\n\n- Se o botão for **Lançar OS**, a ficha abre dentro da venda. Use **Criar OS** na primeira vez e **Salvar OS** para atualizar. Paciente, médico, receita e medidas ficam nessa ficha. O paciente começa como **Titular**; o dependente é escolhido ali.\n- Se o botão for **Nova OS**, a ficha abre em outra página. As OS já feitas ficam em **Abrir OS**, e o salvamento é **Salvar OS**. Nessa ficha, **Histórico** pode trazer uma receita antiga depois da confirmação.\n\nAntes de ligar lente ou armação, inclua o produto em **Produtos → Novo Produto** e escolha o item na lista. Lente, armação, solar e tratamento não entram só com texto. A venda precisa estar aberta. Uma lente já usada em outra OS da mesma venda não pode ser ligada de novo.\n\nDiga qual botão aparece: **Lançar OS** ou **Nova OS**.',
    }
  }

  if (asksBlockedSaleStart) {
    const available = new Set(input.destinations.map(item => item.id))
    const ids = ['receituario', 'avaliacao', 'busca'].filter(id => available.has(id))
    const start = available.has('receituario')
      ? 'Abra [Receituário](receituario).'
      : 'Abra Receituário, se o seu acesso mostrar essa tela.'
    const evaluation = available.has('avaliacao')
      ? 'Se confirmar, a tela oferece abrir [Avaliação](avaliacao).'
      : 'Se o módulo de Avaliação não aparecer, procure o responsável.'
    const resume = available.has('busca')
      ? 'Para retomar uma venda já criada, use [Busca](busca) e abra o resultado em Vendas.'
      : 'Para retomar uma venda já criada, use a Busca da loja, se o seu acesso permitir.'
    return {
      destinationIds: ids,
      answer: `A venda nova só começa com cliente e vendedor selecionados. ${start} **Iniciar nova venda** fica desabilitado até os dois estarem escolhidos. O vendedor precisa estar ativo na loja.\n\nSe o botão estiver liberado e a venda não for criada, leia a mensagem:\n- Avaliação atualizada nos últimos 7 dias, ainda sem venda e sem desfecho, impede a abertura. ${evaluation} Recusar o aviso não cria a venda.\n- A mensalidade pode bloquear novas vendas da loja. A mensagem pede para consultar o aviso de cobrança.\n\nPendência do cliente e escolha de dependente não travam esse botão. O dependente entra depois, na OS.\n\n${resume} O histórico das duas últimas compras no Receituário não abre a venda. Não use a tela de venda antiga.`,
    }
  }

  if (asksCollectionAsReceipt && !asksLaterDownPayment) {
    const available = new Set(input.destinations.map(item => item.id))
    const ids = ['cobranca', 'receber-parcela'].filter(id => available.has(id))
    const collection = available.has('cobranca')
      ? 'Abra [Cobrança](cobranca).'
      : 'A tela de Cobrança depende do módulo e do perfil. Se ela não aparecer, peça ao responsável.'
    const receipt = available.has('receber-parcela')
      ? 'Para baixar a parcela, use [Receber parcela](receber-parcela).'
      : 'Para baixar a parcela, use o recebimento de parcelas quando o módulo e o acesso permitirem.'
    return {
      destinationIds: ids,
      answer: `Contato, lembrete, WhatsApp ou SPC não recebem a parcela e não reduzem a dívida.\n\n${collection} As abas são **Cobrar** e **Já Cobrados**. A busca é pelo nome. **Com SPC** e **Sem SPC** filtram a lista. Em **Registrar Contato**, escolha **Whatsapp**, **Ligação** ou **Presencial**, selecione o operador, escreva o resumo e use **Registrar Ação**. **Lembrar em** é um lembrete: uma data futura manda o cliente para **Já Cobrados**. Não é pagamento.\n\n${receipt} Informe valor, forma e, se a parcela estiver vencida, somente os juros realmente cobrados. Juros não abatem o principal.\n\nSe a pergunta for só sobre o contato, pare no registro. Se for sobre o dinheiro recebido, use somente o recebimento da parcela e não lance o mesmo valor na venda.`,
    }
  }

  if (asksLaterDownPayment || asksLaterDownFollowUp) {
    const ids = ['busca'].filter(id => input.destinations.some(item => item.id === id))
    const findSale = ids.includes('busca')
      ? 'Localize a venda em [Busca](busca) e abra a venda experimental.'
      : 'Peça a quem tenha acesso à busca para abrir a venda experimental.'
    return {
      destinationIds: ids,
      answer: `A entrada posterior depende do status da venda. Não registre o dinheiro antes de saber isso e não lance o mesmo valor duas vezes.\n\nUm carnê sem entrada que cobre o saldo inteiro deixa a venda **Fechada**. Nesse estado, **Renegociar** não reduz o valor: só redistribui o saldo em aberto entre quantidade e vencimentos. **Novo Pagamento** não registra essa entrada. Não crie outro Pix nem outro pagamento direto por cima do carnê.\n\nSe a venda ainda estiver **Em Aberto**, o carnê não cobriu todo o saldo. ${findSale}\n1. Em **Parcelamento**, escolha **Renegociar** e confirme que os recebimentos já feitos serão preservados.\n2. No campo **Novo saldo parcelado**, diminua apenas o saldo ainda em aberto pelo valor da entrada. O novo saldo não pode ser maior que o saldo atual nem ficar zerado.\n3. Ajuste a quantidade, de 1 a 24, e o **1º Vencimento**. Os vencimentos seguintes ficam mensais. Escolha **Calcular** e confira a soma. Os valores de cada parcela podem ser ajustados, desde que a soma feche o novo saldo.\n4. Escolha **Confirmar renegociação** e informe o PIN na janela **Autorizar renegociação**.\n5. A diferença volta para **A Receber**. A renegociação não recebe o dinheiro. Quando o cliente pagar, registre esse valor uma única vez em **Pagamentos → Novo Pagamento**.\n\nSe já houve recebimento de parcela, esse dinheiro permanece no carnê. A renegociação altera só o que ainda está em aberto. Depois dela, aquele recebimento não volta pela ação **Reverter**.\n\nSe não souber se a venda está **Em Aberto** ou **Fechada**, confira o status antes de renegociar. Não presuma que está aberta.`,
    }
  }

  if (asksDuplicate) {
    const available = new Set(input.destinations.map(item => item.id))
    const ids = ['busca', 'receber-parcela'].filter(id => available.has(id))
    const receipt = available.has('receber-parcela')
      ? 'A parcela é recebida em [Receber parcela](receber-parcela).'
      : 'A parcela é recebida no fluxo de parcelas, quando o módulo e o acesso da pessoa permitirem.'
    const findSale = available.has('busca')
      ? 'Localize a venda em [Busca](busca).'
      : 'Peça a quem tenha acesso à busca para localizar a venda.'
    return {
      destinationIds: ids,
      answer: `Não registre de novo, na venda, um valor que já entrou como parcela do carnê.\n\nO saldo **A Receber** diminui com pagamento direto ou com o valor formalizado no carnê. ${receipt} Esse recebimento não deve ser lançado outra vez em **Pagamentos → Novo Pagamento**.\n\nSe o carnê cobre o saldo, **A Receber** fica zero, **Novo Pagamento** deixa de aparecer e a venda pode ser fechada mesmo com parcelas futuras abertas. Um Pix direto adicional cobraria o cliente duas vezes.\n\nSe já existe carnê e ainda há saldo **A Receber**, esse saldo pode receber um pagamento direto. Isso não quita a parcela. Com a venda fora de **Em Aberto** ou com saldo zerado, o sistema recusa o pagamento direto e orienta renegociar o carnê da venda em aberto.\n\nSe o mesmo valor já foi lançado nos dois lugares, não apague nada pelo Livro Caixa. A parcela se corrige pela ação **Reverter**, quando existir. O pagamento direto excedente se remove pela lixeira em **Pagamentos** da venda experimental, somente enquanto a venda estiver aberta. ${findSale} Se não tiver certeza de qual lançamento está sobrando, pare e procure o responsável.`,
    }
  }

  if (asksSalePixCancel) {
    if (!input.pixEnabled) {
      return {
        destinationIds: [],
        answer: 'A cobrança Pix integrada da venda depende da configuração da loja. Neste contexto ela não está disponível para orientar o cancelamento. Cancelar um QR Code pendente é diferente de remover um pagamento já registrado e diferente de reverter uma parcela. Procure o responsável.',
      }
    }
    const express = /\b(expressa|rapida|balcao)\b/.test(question)
    const experimental = /\b(experimental|oculos|novo pagamento)\b/.test(question)
    const available = new Set(input.destinations.map(item => item.id))
    const ids = [
      (!experimental || express) && available.has('venda-rapida') ? 'venda-rapida' : null,
      (!express || experimental) && available.has('busca') ? 'busca' : null,
    ].filter((id): id is string => Boolean(id))
    const expressSteps = available.has('venda-rapida')
      ? 'Na [Venda Rápida](venda-rapida), enquanto o QR Code da venda estiver pendente, escolha **Cancelar Pix e voltar a venda** e autorize com o PIN na janela do sistema. Isso cancela a cobrança e a venda provisória, devolvendo o carrinho, desde que ainda não exista pagamento. Se o Pix já tiver sido pago, siga a mensagem da tela.'
      : 'Na venda rápida, quando o módulo estiver disponível, o QR Code pendente usa **Cancelar Pix e voltar a venda** e pede PIN. Isso cancela a cobrança e a venda provisória somente se ainda não existir pagamento.'
    const experimentalSteps = 'Na venda experimental, abra o aviso **Pix aguardando pagamento** ou **Pagamentos → Novo Pagamento → Pix Sicredi → Acompanhar Pix existente**. Na janela **Pix da venda**, se a situação for **Aguardando pagamento**, escolha **Cancelar cobrança** e autorize com o PIN. Cancelar a cobrança não cancela a venda nem remove um pagamento já confirmado.'
    const answer = express && !experimental
      ? expressSteps
      : experimental && !express
        ? `Localize a venda em [Busca](busca). ${experimentalSteps}`
        : `O cancelamento depende de qual tela gerou o QR Code.\n\n- ${expressSteps}\n- ${experimentalSteps}\n\nSe não souber qual tela foi usada, confira onde o QR Code está aberto antes de cancelar.`
    return { answer: `${answer}\n\nCancelar essa cobrança pendente não usa **Reverter** nem o Livro Caixa.`, destinationIds: ids }
  }

  if (asksDirectCorrection) {
    const ids = ['busca'].filter(id => input.destinations.some(item => item.id === id))
    const method = /\bforma\b/.test(question)
      ? 'Se apenas a forma foi lançada errada e o valor está certo, o Livro Caixa oferece o lápis **Alterar forma de pagamento**. Ele pede o PIN na janela do sistema e, quando o pagamento tem responsável registrado, só aceita o funcionário que lançou aquele recebimento. As formas dessa janela são **PIX Remoto**, **PIX na maquininha**, **Dinheiro**, **Cartão Débito** e **Cartão Crédito**. Essa alteração não muda o valor, não apaga o pagamento e não recria o controle de parcelas do cartão ou do cheque.\n\n'
      : ''
    return {
      destinationIds: ids,
      answer: `${method}Para remover o valor de um pagamento direto, não use o Livro Caixa e não use **Reverter**. **Reverter** é só para recebimento de parcela.\n\n1. Localize a venda em [Busca](busca) e abra a venda experimental.\n2. Em **Pagamentos**, o recebimento direto aparece como **Entrada / pagamento direto**. Passe o mouse e use a lixeira **Estornar / Remover**. Confirme **Remover pagamento**. Essa confirmação não pede PIN.\n3. A lixeira fica desabilitada quando a venda está **Fechada**, **Cancelada** ou **Devolvida**. Um pagamento direto que zera o saldo, sem carnê, fecha a venda na hora; a venda rápida confirmada também já nasce fechada. **Reabrir**, quando o botão aparecer, pede PIN do vendedor original ou de um gerente e só é oferecido no dia da criação ou em até dois dias depois do fechamento. Reabrir também desfaz as saídas de estoque e as comissões daquele fechamento. Se **Reabrir** não aparecer, procure o responsável.\n4. A remoção devolve o valor ao saldo **A Receber** e também remove os recebíveis de cartão ou cheque ligados àquele pagamento. Ela não mexe em parcela de carnê. Venda histórica importada não aceita essa remoção.\n\nO Livro Caixa pode mostrar o pagamento, mas o ícone de apagar dessa tela vale para lançamento manual. No pagamento da venda, o lápis só altera a forma.\n\nSe a forma foi **Crédito em Loja**, não está confirmado que a remoção devolve o crédito da carteira. Procure o responsável antes de remover esse pagamento. Se a tela mostrar erro, pare e não lance outro pagamento para compensar enquanto o valor errado continuar na venda.`,
    }
  }

  if (asksAutoClose && !mentionsInstallment) {
    const ids = ['busca'].filter(id => input.destinations.some(item => item.id === id))
    return {
      destinationIds: ids,
      answer: 'Depende de como o saldo foi coberto. Não lance outro pagamento enquanto não conferir a venda.\n\n- Sem carnê, um pagamento direto que zera **A Receber** fecha a venda na hora. Não é preciso clicar em **Finalizar Venda**. A lixeira desse pagamento fica desabilitada até **Reabrir**, se o botão existir.\n- Com carnê, quitar só o saldo restante não fecha a venda sozinho. O fechamento automático acontece quando o carnê gerado cobre o saldo. Também é possível usar **Finalizar Venda**.\n- A venda rápida confirmada, fora de um Pix ainda pendente, já nasce **Fechada** e sem saldo. Ela não guarda a diferença de um valor menor.\n\nSe não souber se havia carnê, localize a venda em [Busca](busca) e confira **A Receber** e a seção **Parcelamento**.',
    }
  }

  if (asksAmbiguousCorrection) {
    return {
      destinationIds: [],
      answer: 'Ainda não dá para indicar a correção: pagamento da venda e recebimento de parcela são fluxos diferentes.\n\n- Se foi parcela do carnê, a correção é **Reverter** na parcela, quando o botão existir. Não use o Livro Caixa.\n- Se foi pagamento direto da venda, a correção do valor é a lixeira **Estornar / Remover** em **Pagamentos** da venda experimental, somente com a venda aberta. O Livro Caixa não apaga esse valor; no máximo altera a forma.\n\nDiga qual dos dois foi lançado e se a venda está **Em Aberto** ou **Fechada**.',
    }
  }

  return null
}
