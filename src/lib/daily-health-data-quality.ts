export type DuplicateIssueType = 'duplicate_customer' | 'duplicate_product'
export type DuplicateReason = 'cpf' | 'cnpj' | 'telefone' | 'nome' | 'produto_composto'

export type DuplicateGroup = {
  fingerprint: string
  ids: number[]
  reasons: DuplicateReason[]
}

function text(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function digits(value: unknown) {
  return String(value || '').replace(/\D/g, '')
}

function compact(value: unknown) {
  return text(value).replace(/\s/g, '')
}

function editDistance(left: string, right: string) {
  if (left === right) return 0
  if (!left || !right) return Math.max(left.length, right.length)
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[right.length]
}

function sameTextOrLikelyTypo(left: unknown, right: unknown) {
  const leftValue = compact(left)
  const rightValue = compact(right)
  if (!leftValue || !rightValue) return leftValue === rightValue
  if (leftValue === rightValue) return true
  return Math.min(leftValue.length, rightValue.length) >= 5 && editDistance(leftValue, rightValue) <= 1
}

function criteriaGroups<T extends { id: unknown }>(rows: T[], reason: DuplicateReason, keyFor: (row: T) => string, minimumLength: number) {
  const groups = new Map<string, number[]>()
  for (const row of rows) {
    const key = keyFor(row)
    const id = Number(row.id)
    if (key.length < minimumLength || !Number.isInteger(id) || id <= 0) continue
    groups.set(key, [...(groups.get(key) || []), id])
  }
  return [...groups.values()].filter((ids) => ids.length > 1).map((ids) => ({ ids, reason }))
}

function connectedGroups(issueType: DuplicateIssueType, criteria: Array<{ ids: number[]; reason: DuplicateReason }>): DuplicateGroup[] {
  const parent = new Map<number, number>()
  const find = (id: number): number => {
    const current = parent.get(id) ?? id
    if (current === id) return id
    const root = find(current)
    parent.set(id, root)
    return root
  }
  const union = (left: number, right: number) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot)
  }
  for (const group of criteria) {
    group.ids.forEach((id) => parent.set(id, parent.get(id) ?? id))
    group.ids.slice(1).forEach((id) => union(group.ids[0], id))
  }
  const components = new Map<number, Set<number>>()
  for (const id of parent.keys()) {
    const root = find(id)
    const ids = components.get(root) || new Set<number>()
    ids.add(id)
    components.set(root, ids)
  }
  return [...components.values()].map((component) => {
    const ids = [...component].sort((a, b) => a - b)
    const reasons = [...new Set(criteria.filter((group) => group.ids.some((id) => component.has(id))).map((group) => group.reason))]
    return { fingerprint: `${issueType}:${ids.join('-')}`, ids, reasons }
  }).sort((a, b) => a.ids[0] - b.ids[0])
}

export function customerDuplicateCandidates(customers: any[]) {
  const criteria = [
    ...criteriaGroups(customers, 'cpf', (customer) => digits(customer.cpf), 11),
    ...criteriaGroups(customers, 'cnpj', (customer) => digits(customer.cnpj), 14),
    ...criteriaGroups(customers, 'telefone', (customer) => digits(customer.fone_movel || customer.phone), 8),
    ...criteriaGroups(customers, 'nome', (customer) => text(customer.full_name), 5),
  ]
  return { groups: connectedGroups('duplicate_customer', criteria), criteria }
}

export function productDuplicateCandidates(products: any[]) {
  const byReference = new Map<string, any[]>()
  for (const product of products) {
    const id = Number(product.id)
    if (!Number.isInteger(id) || id <= 0) continue
    const reference = compact(product.referencia)
    const name = compact(product.nome)
    const brand = compact(product.marca)
    if (!name && !brand && !reference) continue
    const key = reference
    byReference.set(key, [...(byReference.get(key) || []), product])
  }

  const criteria: Array<{ ids: number[]; reason: DuplicateReason }> = []
  for (const candidates of byReference.values()) {
    const parent = new Map<number, number>()
    const find = (id: number): number => {
      const current = parent.get(id) ?? id
      if (current === id) return id
      const root = find(current)
      parent.set(id, root)
      return root
    }
    const union = (left: number, right: number) => {
      const leftRoot = find(left)
      const rightRoot = find(right)
      if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot)
    }
    for (let index = 0; index < candidates.length; index += 1) {
      const left = candidates[index]
      const leftId = Number(left.id)
      if (!parent.has(leftId)) parent.set(leftId, leftId)
      for (let next = index + 1; next < candidates.length; next += 1) {
        const right = candidates[next]
        if (sameTextOrLikelyTypo(left.nome, right.nome) && sameTextOrLikelyTypo(left.marca, right.marca)) union(leftId, Number(right.id))
      }
    }
    const components = new Map<number, number[]>()
    for (const id of parent.keys()) {
      const root = find(id)
      components.set(root, [...(components.get(root) || []), id])
    }
    for (const ids of components.values()) if (ids.length > 1) criteria.push({ ids, reason: 'produto_composto' })
  }
  return { groups: connectedGroups('duplicate_product', criteria), criteria }
}
