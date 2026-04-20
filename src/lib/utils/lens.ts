/** Remove ®, ™, espaços duplos e normaliza para comparação de nomes de lentes. */
export function normalizeLensName(s: string): string {
  return s.replace(/[®™]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}
