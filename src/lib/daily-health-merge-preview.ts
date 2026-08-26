import type { DuplicateIssueType } from '@/lib/daily-health-data-quality'

export type MergeDependency = {
  table: string
  column: string
  label: string
  collision?: 'customer_wallet'
}

export type MergeFieldConflict = {
  field: string
  label: string
  severity: 'choice' | 'blocker'
  values: Array<{ id: number; value: string }>
}

export type MergeFieldComplement = {
  field: string
  label: string
  fromId: number
  value: string
}

export const CUSTOMER_MERGE_DEPENDENCIES: MergeDependency[] = [
  { table: 'assistance_tickets', column: 'customer_id', label: 'assistências' },
  { table: 'cobranca_historico', column: 'customer_id', label: 'histórico de cobrança' },
  { table: 'customer_external_references', column: 'customer_id', label: 'referências externas' },
  { table: 'customer_prescription_history', column: 'customer_id', label: 'histórico de receitas' },
  { table: 'customer_wallets', column: 'customer_id', label: 'carteiras de crédito', collision: 'customer_wallet' },
  { table: 'dependentes', column: 'customer_id', label: 'dependentes' },
  { table: 'financiamento_loja', column: 'customer_id', label: 'parcelamentos' },
  { table: 'financiamento_parcelas', column: 'customer_id', label: 'parcelas' },
  { table: 'installment_receipt_operations', column: 'customer_id', label: 'operações de recebimento' },
  { table: 'installment_renegotiations', column: 'customer_id', label: 'renegociações' },
  { table: 'optical_evaluations', column: 'evaluated_customer_id', label: 'avaliações como paciente' },
  { table: 'optical_evaluations', column: 'responsible_customer_id', label: 'avaliações como responsável' },
  { table: 'pagamentos', column: 'customer_id', label: 'pagamentos' },
  { table: 'pix_installment_charges', column: 'customer_id', label: 'cobranças Pix' },
  { table: 'service_orders', column: 'customer_id', label: 'ordens de serviço' },
  { table: 'tower_customer_report_shares', column: 'customer_id', label: 'relatórios compartilhados da Torre' },
  { table: 'tower_device_customer_mappings', column: 'customer_id', label: 'vínculos locais da Torre' },
  { table: 'tower_heatmap_sessions', column: 'customer_id', label: 'sessões de mapa de calor' },
  { table: 'tower_measurement_results', column: 'customer_id', label: 'medições da Torre' },
  { table: 'tower_sessions', column: 'customer_id', label: 'sessões da Torre' },
  { table: 'vendas', column: 'customer_id', label: 'vendas' },
  { table: 'whatsapp_customer_links', column: 'customer_id', label: 'vínculos de WhatsApp' },
  { table: 'whatsapp_installment_reminders', column: 'customer_id', label: 'lembretes de parcelas' },
  { table: 'whatsapp_post_sale_followups', column: 'customer_id', label: 'acompanhamentos de pós-venda' },
]

export const PRODUCT_MERGE_DEPENDENCIES: MergeDependency[] = [
  { table: 'assistance_tickets', column: 'product_id', label: 'assistências' },
  { table: 'label_queue', column: 'product_id', label: 'etiquetas pendentes' },
  { table: 'product_external_references', column: 'product_id', label: 'referências externas' },
  { table: 'product_variants', column: 'product_id', label: 'variações e grades' },
  { table: 'stock_movements', column: 'product_id', label: 'movimentos de estoque' },
  { table: 'venda_itens', column: 'product_id', label: 'itens vendidos' },
]

const CUSTOMER_FIELDS = [
  { field: 'full_name', label: 'Nome', severity: 'choice' },
  { field: 'cpf', label: 'CPF', severity: 'blocker' },
  { field: 'rg', label: 'RG', severity: 'blocker' },
  { field: 'birth_date', label: 'Nascimento', severity: 'blocker' },
  { field: 'fone_movel', label: 'Celular', severity: 'choice' },
  { field: 'phone', label: 'Telefone', severity: 'choice' },
  { field: 'email', label: 'E-mail', severity: 'choice' },
  { field: 'rua', label: 'Endereço', severity: 'choice' },
] as const

const PRODUCT_FIELDS = [
  { field: 'nome', label: 'Nome', severity: 'choice' },
  { field: 'marca', label: 'Marca', severity: 'choice' },
  { field: 'referencia', label: 'Referência', severity: 'blocker' },
  { field: 'codigo_barras', label: 'Código de barras', severity: 'blocker' },
  { field: 'tipo_produto', label: 'Tipo de produto', severity: 'blocker' },
  { field: 'categoria', label: 'Categoria', severity: 'choice' },
  { field: 'preco_custo', label: 'Custo', severity: 'choice' },
  { field: 'preco_venda', label: 'Preço de venda', severity: 'choice' },
] as const

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return String(value)
  return String(value).trim()
}

function comparisonValue(issueType: DuplicateIssueType, field: string, value: string) {
  const plain = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
  if (['cpf', 'phone', 'fone_movel'].includes(field)) return plain.replace(/\D/g, '')
  if (issueType === 'duplicate_product' && ['nome', 'marca', 'referencia'].includes(field)) return plain.replace(/[^a-z0-9]/g, '')
  return plain
}

export function buildMergeFieldConflicts(issueType: DuplicateIssueType, records: any[]): MergeFieldConflict[] {
  const fields = issueType === 'duplicate_customer' ? CUSTOMER_FIELDS : PRODUCT_FIELDS
  return fields.flatMap((definition) => {
    const values = records
      .map((record) => ({ id: Number(record.id), value: displayValue(record[definition.field]) }))
      .filter((item): item is { id: number; value: string } => item.value !== null)
    const distinct = new Set(values.map((item) => comparisonValue(issueType, definition.field, item.value)))
    if (distinct.size <= 1) return []
    return [{ field: definition.field, label: definition.label, severity: definition.severity, values }]
  })
}

export function buildMergeFieldComplements(issueType: DuplicateIssueType, records: any[], targetId: number): MergeFieldComplement[] {
  const fields = issueType === 'duplicate_customer' ? CUSTOMER_FIELDS : PRODUCT_FIELDS
  const target = records.find((record) => Number(record.id) === targetId)
  if (!target) return []
  return fields.flatMap((definition) => {
    if (displayValue(target[definition.field]) !== null) return []
    const candidates = records
      .filter((record) => Number(record.id) !== targetId)
      .map((record) => ({ id: Number(record.id), value: displayValue(record[definition.field]) }))
      .filter((item): item is { id: number; value: string } => item.value !== null)
    const distinct = new Map(candidates.map((item) => [comparisonValue(issueType, definition.field, item.value), item]))
    if (distinct.size !== 1) return []
    const source = [...distinct.values()][0]
    return [{ field: definition.field, label: definition.label, fromId: source.id, value: source.value }]
  })
}

export function mergeDependenciesFor(issueType: DuplicateIssueType) {
  return issueType === 'duplicate_customer' ? CUSTOMER_MERGE_DEPENDENCIES : PRODUCT_MERGE_DEPENDENCIES
}
