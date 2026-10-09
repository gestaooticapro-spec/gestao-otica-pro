export function normalizeOrderPersonName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('pt-BR').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/gu, ' ').trim()
}

/** A classificacao so pode usar nomes escritos pelo cliente, nunca pela IA. */
export function groundedOrderPersonName(name: string | null | undefined,
  message: string | null | undefined, history: string[] = []) {
  if (!name || /[^\p{L}\s'-]/u.test(name)) return null
  const normalized = normalizeOrderPersonName(name)
  if (normalized.split(' ').length < 2) return null
  const sources = [message || '', ...history.filter((line) => line.startsWith('Cliente:'))]
  return sources.some((line) => ` ${normalizeOrderPersonName(line)} `.includes(` ${normalized} `))
    ? name.trim() : null
}

/** Os curingas toleram acentos; a igualdade completa e conferida depois. */
export function orderPersonSearchPattern(name: string) {
  return normalizeOrderPersonName(name).replace(/[aeioucn]/gu, '_').split(' ').join('%')
}

export function uniqueExactOrderPerson<T extends { full_name: string }>(name: string,
  candidates: T[], limit: number) {
  // Uma pagina truncada nao prova unicidade.
  if (candidates.length >= limit) return null
  const matches = candidates.filter((row) => normalizeOrderPersonName(row.full_name)
    === normalizeOrderPersonName(name))
  return matches.length === 1 ? matches[0] : null
}
