/** Mesmo dia do proximo mes no calendario local, limitado ao ultimo dia do mes. */
export function getSuggestedFirstDueDate(today: Date = new Date()): string {
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1, 12)
  const year = nextMonth.getFullYear()
  const month = nextMonth.getMonth()
  const lastDay = new Date(year, month + 1, 0, 12).getDate()
  const day = Math.min(today.getDate(), lastDay)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
/** Data civil local para campos date; nao converte o instante para UTC. */
export function getLocalDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

