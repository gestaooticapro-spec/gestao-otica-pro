// Pausa temporaria para medir a ingestao de logs sem as geracoes do modulo.
// O agendamento e os endpoints retomam automaticamente apos este instante.
export const DAILY_HEALTH_PAUSED_UNTIL = '2026-10-18T02:59:59.999Z'

export function isDailyHealthPaused(now = Date.now()) {
  return now < Date.parse(DAILY_HEALTH_PAUSED_UNTIL)
}
